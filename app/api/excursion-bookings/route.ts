import {authDb, currentUser, hasPermission, sameOrigin} from '../../../lib/auth';
import {loadStays, stayKey} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {excursionPaid, excursionResources} from '../../../lib/excursion-workflow';
import {isConfirmedExcursion, toConfirmedExcursionBooking} from '../../../lib/excursion-bookings';
import {applyExcursionBillingAdjustment, excursionPricing} from '../../../lib/excursion-billing';
import {mirrorHotelState,mirrorOperationalRecord,saveOperationalRecordPrimary} from '../../../lib/supabase-bridge';
import {approveExternalExcursionCancellation,approveExternalExcursionChange,ensureExcursionManageState,rejectExternalExcursionAction} from '../../../lib/excursion-manage';
import {sendExternalExcursionCancelledEmail,sendExternalExcursionRejectedEmail,sendExternalExcursionUpdatedEmail} from '../../../lib/excursion-email';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};
const normal = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const legacyKey = (date: unknown, time: unknown, name: unknown) => JSON.stringify([date || '', time || '', normal(name)]);

/** All confirmed excursions, across all dates. This endpoint never changes orders. */
export async function GET() {
  try {
    const user = await currentUser();
    if (!hasPermission(user, 'edit_excursions') && !hasPermission(user, 'excursions_manager')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const {state, revision} = await loadStays();ensureExcursionManageState(state);
    const rows = await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?')
      .bind('excursion-schedule:%').all<any>();
    const schedules = (rows.results || []).map((row: any) => JSON.parse(row.payload));
    // Standard recurring schedules can reuse the same schedule id on different dates.
    // Never resolve a booking by schedule id alone or a later day's row can overwrite the booked date.
    const byDateAndId = new Map(schedules.map((s: any) => [String(s.date || '') + '|' + String(s.id || ''), s]));
    const byId = new Map<string, any[]>();
    for (const s of schedules) byId.set(String(s.id || ''), [...(byId.get(String(s.id || '')) || []), s]);
    const byDeparture = new Map<string, any[]>();
    for (const s of schedules) {
      const key = legacyKey(s.date, s.time, s.name);
      byDeparture.set(key, [...(byDeparture.get(key) || []), s]);
    }
    const stays = new Map((state.stays || []).map((s: any) => [s.id, s]));
    const resources = excursionResources(state);
    const bookings = (state.orders || []).filter(isConfirmedExcursion).map((order: any) => {
      const bookedDate = order.date || order.schedule?.date || '';
      let schedule = order.scheduleId ? byDateAndId.get(String(bookedDate) + '|' + String(order.scheduleId)) : undefined;
      if (order.scheduleId && !schedule) {
        const idMatches = byId.get(String(order.scheduleId)) || [];
        schedule = idMatches.length === 1 ? idMatches[0] : undefined;
      }
      if (!order.scheduleId) {
        const matches = byDeparture.get(legacyKey(order.schedule?.date || order.date, order.schedule?.time || order.time, order.name)) || [];
        // Never guess between two different departures sharing a name and time.
        schedule = matches.length === 1 ? matches[0] : matches.find(s => !!s.vesselId && s.vesselId === order.schedule?.vesselId);
      }
      return {...toConfirmedExcursionBooking(order, stays.get(order.stayId), schedule, resources, excursionPaid(order, state)),
        pricing: excursionPricing(order),
        billingHistory: user!.role === 'admin' ? (order.billingHistory || []) : undefined};
    });
    bookings.sort((a: any, b: any) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    const manageRequests=(state.excursionChanges||[]).filter((change:any)=>change.status==='Pending').map((change:any)=>{
      const order=(state.orders||[]).find((item:any)=>item.id===change.bookingId&&item.kind==='excursion');
      return {id:change.id,type:change.type,bookingId:change.bookingId,requestedAt:change.requestedAt,current:change.current||null,proposed:change.proposed||null,guest:order?.guest||change.current?.guest||'',excursion:order?.name||change.current?.name||'',date:order?.date||change.current?.date||'',time:order?.time||order?.schedule?.time||'',quantity:Number(order?.quantity||change.current?.quantity||0),hotel:order?.hotel||'',email:order?.email||'',phone:order?.phone||''};
    });
    return Response.json({bookings,manageRequests, revision, canAdjustBilling: user!.role === 'admin',canReviewManageRequests:true}, {headers});
  } catch {
    return Response.json({error: 'Could not load confirmed excursion bookings. Please try again.'}, {status: 503, headers});
  }
}

/** Update the existing charge atomically; never create another room bill or payment. */
export async function PATCH(request: Request) {
  try {
    const user = await currentUser();
    if (!user || !sameOrigin(request)) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    let input: any;
    try { input = await request.json(); } catch {
      return Response.json({error: 'Invalid excursion request.'}, {status: 400, headers});
    }
    if (typeof input?.action === 'string' && input.action.startsWith('manage-')) {
      if (!hasPermission(user,'edit_excursions') && !hasPermission(user,'excursions_manager')) {
        return Response.json({error:'Excursion management access is required.'},{status:403,headers});
      }
      if(typeof input.id!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0)return Response.json({error:'Refresh excursion bookings and try again.'},{status:400,headers});
      const {state,revision}=await loadStays();ensureExcursionManageState(state);
      if(input.revision!==revision)return Response.json({error:'Excursion bookings changed. Refresh and review the request again.'},{status:409,headers});
      const change=(state.excursionChanges||[]).find((item:any)=>item.id===input.id&&item.status==='Pending');
      if(!change)return Response.json({error:'This guest request has already been handled.'},{status:404,headers});
      const order=(state.orders||[]).find((item:any)=>item.id===change.bookingId&&item.kind==='excursion'&&item.source==='External guest website');
      if(!order)return Response.json({error:'The external excursion booking is no longer active.'},{status:404,headers});
      if(['Departed','Completed'].includes(String(order.status||'')))return Response.json({error:'A departed or completed excursion cannot be changed or cancelled here.'},{status:409,headers});
      const note=String(input.note||'').trim().slice(0,500);
      let decision:any=null,mail:any=null;
      if(input.action.endsWith('-reject')){
        rejectExternalExcursionAction(change,user.username,note);decision={status:'Rejected',type:change.type};
      }else if(change.type==='cancel'){
        decision=approveExternalExcursionCancellation(order,change,user.username);
      }else{
        decision=approveExternalExcursionChange(order,change,user.username);
      }
      const saved=await saveStayAccess(state,revision,user.userId);
      if(!saved)return Response.json({error:'Another excursion update was saved. Refresh and try again.'},{status:409,headers});
      const mailBase={email:order.email,guest:order.guest,reference:order.id,excursion:order.name,date:order.date,time:order.time||order.schedule?.time||'',endTime:order.endTime||order.schedule?.endTime||'',quantity:Number(order.quantity)||0,quotedCents:Number(order.quotedCents)||Number(order.cents)||0,hotel:order.hotel,manageToken:order.manageToken,eventId:change.id};
      try{
        if(change.status==='Rejected')mail=await sendExternalExcursionRejectedEmail({...mailBase,requestType:change.type,reason:note});
        else if(change.type==='cancel')mail=await sendExternalExcursionCancelledEmail({...mailBase,refundRequiredCents:Number(change.refundRequiredCents)||0});
        else mail=await sendExternalExcursionUpdatedEmail(mailBase);
      }catch{mail={sent:false,error:'Guest email could not be sent.'};}
      return Response.json({ok:true,revision:revision+1,decision:{id:change.id,type:change.type,status:change.status,logisticsChanged:!!change.logisticsChanged,refundRequiredCents:Number(change.refundRequiredCents)||0},email:mail},{headers});
    }
    if (user.role !== 'admin') {
      return Response.json({error: 'Only Admin can make excursions free or change discounts.'}, {status: 403, headers});
    }
    if (!input || typeof input.id !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 0) {
      return Response.json({error: 'Refresh bookings and reopen the billing action.'}, {status: 400, headers});
    }
    const {state, revision} = await loadStays();
    const order = (state.orders || []).find((o: any) => o.id === input.id && o.kind === 'excursion');
    if (!order) return Response.json({error: 'Excursion booking not found.'}, {status: 404, headers});
    if (!isConfirmedExcursion(order)) return Response.json({error: 'Only confirmed excursion bookings can be adjusted.'}, {status: 400, headers});
    const duplicate = (order.billingHistory || []).some((entry: any) => entry.requestId === input.requestId);
    if (!duplicate && input.revision !== revision) {
      return Response.json({error: 'Booking or billing data changed. Close this action, refresh bookings and review the amount again.'}, {status: 409, headers});
    }
    let result;
    try { result = applyExcursionBillingAdjustment(state, input, user); } catch (error) {
      return Response.json({error: error instanceof Error ? error.message : 'Check the billing adjustment.'}, {status: 400, headers});
    }
    if (result.duplicate) return Response.json({ok: true, revision, pricing: excursionPricing(result.order)}, {headers});
    let nextRevision=0,primaryAvailable=true;
    try{nextRevision=await saveOperationalRecordPrimary(stayKey,state,revision,user.userId);}catch{primaryAvailable=false;}
    if(primaryAvailable){
      if(!nextRevision)return Response.json({error: 'Another user changed the bill. Close this action, refresh bookings and review the amount again.'}, {status: 409, headers});
      try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(stayKey,JSON.stringify(state),nextRevision,user.userId).run();}catch{}
      try{await mirrorHotelState(state);}catch{}
      return Response.json({ok:true,revision:nextRevision,pricing:excursionPricing(result.order)},{headers});
    }
    const saved = await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?')
      .bind(JSON.stringify(state), user.userId, stayKey, revision).run();
    if (!saved.meta.changes) return Response.json({error: 'Another user changed the bill. Close this action, refresh bookings and review the amount again.'}, {status: 409, headers});
    try { await Promise.all([mirrorHotelState(state),mirrorOperationalRecord(stayKey,state,revision+1,user.userId)]); } catch {}
    return Response.json({ok: true, revision: revision + 1, pricing: excursionPricing(result.order)}, {headers});
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : 'Could not save the excursion update. Please retry.'}, {status: 400, headers});
  }
}
