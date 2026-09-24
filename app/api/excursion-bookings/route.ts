import {authDb, currentUser, hasPermission, sameOrigin} from '../../../lib/auth';
import {loadStays, stayKey} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {excursionPaid, excursionResources} from '../../../lib/excursion-workflow';
import {isConfirmedExcursion, toConfirmedExcursionBooking} from '../../../lib/excursion-bookings';
import {applyExcursionBillEdit,applyExcursionBillingAdjustment,excursionFolioBill,excursionPricing} from '../../../lib/excursion-billing';
import {mirrorHotelState,mirrorOperationalRecord,readExcursionSchedulesPrimary,saveOperationalRecordPrimary} from '../../../lib/supabase-bridge';
import {approveExternalExcursionCancellation,approveExternalExcursionChange,approveExternalExcursionPackageCancellation,ensureExcursionManageState,externalPackageOrders,rejectExternalExcursionAction} from '../../../lib/excursion-manage';
import {sendExternalExcursionCancelledEmail,sendExternalExcursionRejectedEmail,sendExternalExcursionUpdatedEmail} from '../../../lib/excursion-email';
import {autoAssignExcursionOrder} from '../../../lib/excursion-auto-assignment';
import {excursionDeparturePassed,islandToday,validDate} from '../../../lib/guest-catalog';
import {excursionScheduleLoadForOrder,scheduleCanServeRequest} from '../../../lib/excursion-operations';
import {applyExcursionReassignment} from '../../../lib/excursion-reassignment';
import {sendGuestPushForExcursionTimeChange} from '../../../lib/web-push';
import {addGuestNotification} from '../../../lib/guest-notifications';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};
const normal = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const legacyKey = (date: unknown, time: unknown, name: unknown) => JSON.stringify([date || '', time || '', normal(name)]);

async function schedulesForDate(date:string){
  try{
    const primary=await readExcursionSchedulesPrimary(date);
    if(primary.length)return primary.map((row:any)=>({...row}));
  }catch{}
  const rows=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key LIKE ?')
    .bind('excursion-schedule:'+date+':%').all<any>();
  return (rows.results||[]).map((row:any)=>({...JSON.parse(row.payload||'{}'),revision:Number(row.revision)||0}));
}

/** All confirmed excursions, across all dates. This endpoint never changes orders. */
export async function GET(request?: Request) {
  try {
    const user = await currentUser();
    if (!hasPermission(user, 'edit_excursions') && !hasPermission(user, 'excursions_manager')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const {state, revision} = await loadStays();state.excursionChanges??=[];
    const canReassign=hasPermission(user,'excursions_manager');
    const url=request?new URL(request.url):null,bookingId=String(url?.searchParams.get('bookingId')||''),scheduleDate=String(url?.searchParams.get('scheduleDate')||'');
    if(bookingId||scheduleDate){
      if(!canReassign)return Response.json({error:'Only Admin or Excursions Manager can view reassignment options.'},{status:403,headers});
      if(!bookingId||!validDate(scheduleDate)||scheduleDate<islandToday())return Response.json({error:'Choose a valid booking and today or a future trip date.'},{status:400,headers});
      const order=(state.orders||[]).find((item:any)=>item.id===bookingId&&item.kind==='excursion');
      if(!order)return Response.json({error:'Excursion booking not found.'},{status:404,headers});
      if(!isConfirmedExcursion(order))return Response.json({error:'Only confirmed excursion bookings can be reassigned.'},{status:409,headers});
      if(['Departed','Completed','Cancelled'].includes(String(order.status||'')))return Response.json({error:'Departed, completed or cancelled excursions cannot be reassigned.'},{status:409,headers});
      if(order.serviceType==='romantic-beach-dinner')return Response.json({error:'Romantic Beach Dinner does not use excursion trip assignment.'},{status:409,headers});
      if(order.privateBoatRequested===true||order.separateVessel===true)return Response.json({error:'Private or separate-vessel bookings must be managed from the schedule/vessel assignment screen.'},{status:409,headers});
      const schedules=(await schedulesForDate(scheduleDate)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
      const resources=excursionResources(state),quantity=Math.max(1,Number(order.quantity)||1);
      const options=schedules.map((schedule:any)=>{
        const load=excursionScheduleLoadForOrder(schedule,schedules,state.orders||[],order.id);
        const vessel=resources.vessels.find((item:any)=>item.id===schedule.vesselId);
        const current=String(order.scheduleId||'')===String(schedule.id||'')&&String(order.date||order.schedule?.date||'')===String(schedule.date||'');
        const compatible=scheduleCanServeRequest(order.name,schedule.name);
        return {
          id:String(schedule.id||''),date:String(schedule.date||scheduleDate),time:String(schedule.time||''),endTime:String(schedule.endTime||''),
          name:String(schedule.name||'Excursion trip'),capacity:load.capacity,confirmedPax:load.confirmedPax,remainingSeats:load.remaining,
          vesselId:String(schedule.vesselId||''),vessel:String(vessel?.name||schedule.vessel||'Not assigned'),
          compatible,current,canFit:load.remaining>=quantity
        };
      }).sort((a:any,b:any)=>(a.current?0:1)-(b.current?0:1)||(a.compatible?0:1)-(b.compatible?0:1)||a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
      return Response.json({
        revision,canReassign,
        booking:{id:order.id,guest:order.guest||'',name:order.name||'',date:order.date||'',time:order.time||order.schedule?.time||'',quantity,people:Array.isArray(order.excursionGuestRoster)?order.excursionGuestRoster:[],packageGroupId:order.packageGroupId||''},
        schedules:options
      },{headers});
    }
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
        bill: user!.role === 'admin' ? excursionFolioBill(order) : undefined,
        billingHistory: user!.role === 'admin' ? (order.billingHistory || []) : undefined};
    });
    bookings.sort((a: any, b: any) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    const manageRequests=(state.excursionChanges||[]).filter((change:any)=>change.status==='Pending').map((change:any)=>{
      const order=(state.orders||[]).find((item:any)=>item.id===change.bookingId&&item.kind==='excursion');
      return {id:change.id,type:change.type,bookingId:change.packageGroupId||change.bookingId,internalBookingId:change.bookingId,packageGroupId:change.packageGroupId||'',requestedAt:change.requestedAt,current:change.current||null,proposed:change.proposed||null,guest:order?.guest||change.current?.guest||'',excursion:change.packageGroupId?(order?.packageName||'Special Package'):(order?.name||change.current?.name||''),date:order?.date||change.current?.date||'',time:order?.time||order?.schedule?.time||'',quantity:Number(order?.quantity||change.current?.quantity||0),hotel:order?.hotel||'',email:order?.email||'',phone:order?.phone||''};
    });
    return Response.json({bookings,manageRequests, revision, canAdjustBilling: user!.role === 'admin',canReviewManageRequests:true,canReassign}, {headers});
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
    if(input?.action==='mark-whatsapp-notified'){
      if(!hasPermission(user,'excursions_manager'))return Response.json({error:'Only Admin or Excursions Manager can confirm walk-in guest notification.'},{status:403,headers});
      const bookingId=String(input.id||''),packageGroupId=String(input.packageGroupId||''),notified=input.notified===true;
      if(!bookingId||!Number.isSafeInteger(input.revision)||input.revision<0)return Response.json({error:'Refresh excursion bookings and try again.'},{status:400,headers});
      const {state,revision}=await loadStays();
      if(input.revision!==revision)return Response.json({error:'Excursion bookings changed. Refresh and try again.'},{status:409,headers});
      const selected=(state.orders||[]).find((item:any)=>item.id===bookingId&&item.kind==='excursion');
      if(!selected)return Response.json({error:'Excursion booking not found.'},{status:404,headers});
      if(selected.stayId)return Response.json({error:'This action is for walk-in excursion guests.'},{status:409,headers});
      if(!String(selected.phone||'').trim())return Response.json({error:'Walk-in guest WhatsApp number is missing.'},{status:409,headers});
      const targets=packageGroupId
       ?(state.orders||[]).filter((item:any)=>item.kind==='excursion'&&item.packageGroupId===packageGroupId&&item.status!=='Cancelled'&&item.approvalStatus!=='Cancelled')
       :[selected];
      const now=new Date().toISOString();
      for(const order of targets){
       order.guestNotified=notified;
       order.guestNotifiedAt=notified?now:null;
       order.guestNotifiedBy=notified?user.username:null;
       order.guestNotificationChannel=notified?'WhatsApp':'';
       order.notificationHistory=Array.isArray(order.notificationHistory)?order.notificationHistory:[];
       order.notificationHistory.push({at:now,by:user.username,channel:'WhatsApp',status:notified?'Sent':'Reset',bookingId:order.id,packageGroupId:order.packageGroupId||''});
      }
      const saved=await saveStayAccess(state,revision,user.userId);
      if(!saved)return Response.json({error:'Another excursion update was saved. Refresh and try again.'},{status:409,headers});
      return Response.json({ok:true,revision:revision+1,notified,notifiedAt:notified?now:'',notifiedBy:notified?user.username:'',count:targets.length},{headers});
    }
    if(input?.action==='reassign-booking'){
      if(!hasPermission(user,'excursions_manager'))return Response.json({error:'Only Admin or Excursions Manager can reassign confirmed excursion bookings.'},{status:403,headers});
      const bookingId=String(input.id||''),scheduleId=String(input.scheduleId||''),scheduleDate=String(input.scheduleDate||''),note=String(input.note||'').trim().slice(0,500);
      if(!bookingId||!scheduleId||!validDate(scheduleDate)||scheduleDate<islandToday()||!Number.isSafeInteger(input.revision)||input.revision<0)return Response.json({error:'Choose a valid booking and target trip.'},{status:400,headers});
      const {state,revision}=await loadStays();
      if(input.revision!==revision)return Response.json({error:'Excursion bookings changed. Refresh and choose the trip again.'},{status:409,headers});
      const order=(state.orders||[]).find((item:any)=>item.id===bookingId&&item.kind==='excursion');
      if(!order)return Response.json({error:'Excursion booking not found.'},{status:404,headers});
      if(!isConfirmedExcursion(order))return Response.json({error:'Only confirmed excursion bookings can be reassigned.'},{status:409,headers});
      if(['Departed','Completed','Cancelled'].includes(String(order.status||'')))return Response.json({error:'Departed, completed or cancelled excursions cannot be reassigned.'},{status:409,headers});
      if(order.date&&order.time&&excursionDeparturePassed(order.date,order.time))return Response.json({error:'This booking departure time has already passed and cannot be reassigned here.'},{status:409,headers});
      if(order.serviceType==='romantic-beach-dinner')return Response.json({error:'Romantic Beach Dinner does not use excursion trip assignment.'},{status:409,headers});
      if(order.privateBoatRequested===true||order.separateVessel===true)return Response.json({error:'Private or separate-vessel bookings must be managed from the schedule/vessel assignment screen.'},{status:409,headers});
      const schedules=(await schedulesForDate(scheduleDate)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
      const target=schedules.find((schedule:any)=>String(schedule.id||'')===scheduleId);
      if(!target)return Response.json({error:'That trip is no longer open. Refresh available trips.'},{status:409,headers});
      const quantity=Math.max(1,Number(order.quantity)||1),load=excursionScheduleLoadForOrder(target,schedules,state.orders||[],order.id);
      if(load.remaining<quantity)return Response.json({error:'That trip no longer has enough seats for all '+quantity+' guests.'},{status:409,headers});
      const compatible=scheduleCanServeRequest(order.name,target.name);
      if(!compatible&&input.allowIncompatible!==true)return Response.json({error:'This trip does not normally serve '+String(order.name||'this excursion')+'. Confirm a manual override to move the guests there.'},{status:409,headers});
      const resources=excursionResources(state),now=new Date().toISOString();
      const moved=applyExcursionReassignment(order,target,resources,user.username,note,compatible,now);
      const vessel=moved.after.vessel;
      if(order.accountId)addGuestNotification(state,{
        accountId:String(order.accountId),type:'excursion-time-change',title:'Excursion time changed',
        message:String(order.packageName||order.name||'Excursion')+' departure changed from '+(moved.before.time||'the previous time')+' to '+moved.after.time+' on '+moved.after.date+'.',
        url:'/stay?service=excursion',bookingId:String(order.packageGroupId||order.id||''),metadata:{from:{date:moved.before.date,time:moved.before.time},to:{date:moved.after.date,time:moved.after.time},scheduleId:target.id}
      });
      const saved=await saveStayAccess(state,revision,user.userId);
      if(!saved)return Response.json({error:'Another excursion update was saved. Refresh and try again.'},{status:409,headers});
      let email:any=null,push:any=null;
      if(order.source==='External guest website'&&order.email&&order.manageToken)try{
        email=await sendExternalExcursionUpdatedEmail({email:order.email,guest:order.guest,reference:order.packageGroupId||order.id,excursion:order.packageName||order.name,date:order.date,time:order.time,endTime:order.endTime,quantity:Number(order.quantity)||0,quotedCents:Math.max(0,Number(order.cents)||Number(order.quotedCents)||0),hotel:order.hotel,manageToken:order.manageToken,eventId:'manual-reassign-'+order.id+'-'+now});
      }catch{email={sent:false,error:'Booking moved, but the guest email could not be sent.'};}
      if(order.accountId)try{push=await sendGuestPushForExcursionTimeChange(order,{date:moved.before.date,time:moved.before.time},{date:moved.after.date,time:moved.after.time});}catch{push={sent:0,total:0};}
      return Response.json({ok:true,revision:revision+1,assignment:{id:order.id,date:order.date,time:order.time,endTime:order.endTime,scheduleId:order.scheduleId,scheduleName:target.name,vessel:vessel||target.vessel||'',compatible,manualOverride:!compatible},email,push},{headers});
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
        decision=change.packageGroupId?approveExternalExcursionPackageCancellation(state,order,change,user.username):approveExternalExcursionCancellation(order,change,user.username);
      }else{
        decision=approveExternalExcursionChange(order,change,user.username);
        if(decision.logisticsChanged&&order.approvalStatus==='Pending'&&!order.privateBoatRequested&&!order.packageGroupId){
          const assignment=await autoAssignExcursionOrder(state,order);
          if(assignment){
            change.autoAssignedScheduleId=order.scheduleId;
            change.autoAssignedScheduleName=order.matchedScheduleName;
            change.autoAssignedAt=new Date().toISOString();
            decision.autoAssigned=true;
            decision.scheduleId=order.scheduleId;
            decision.scheduleName=order.matchedScheduleName;
            decision.time=order.time;
            decision.endTime=order.endTime;
          }else{
            decision.autoAssigned=false;
          }
        }
      }
      const saved=await saveStayAccess(state,revision,user.userId);
      if(!saved)return Response.json({error:'Another excursion update was saved. Refresh and try again.'},{status:409,headers});
      const packageOrders=change.packageGroupId?externalPackageOrders(state,order):[order],first=packageOrders[0]||order;
      const packageEdited=packageOrders.some((item:any)=>Number(item.billingRevision)>0||!!item.billingEditedAt),firstEdited=Number(first.billingRevision)>0||!!first.billingEditedAt;const mailBase={email:first.email,guest:first.guest,reference:change.packageGroupId||first.id,excursion:change.packageGroupId?(first.packageName||'Special Package'):first.name,date:first.date,time:first.time||first.schedule?.time||'',endTime:first.endTime||first.schedule?.endTime||'',quantity:Number(first.quantity)||0,quotedCents:change.packageGroupId?(packageEdited?packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.cents)||0),0):Math.max(0,Number(first.packageTotalCents)||packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.quotedCents)||0),0))):(firstEdited?(Number(first.cents)||0):(Number(first.quotedCents)||Number(first.cents)||0)),hotel:first.hotel,manageToken:first.manageToken,eventId:change.id};
      try{
        if(change.status==='Rejected')mail=await sendExternalExcursionRejectedEmail({...mailBase,requestType:change.type,reason:note});
        else if(change.type==='cancel')mail=await sendExternalExcursionCancelledEmail({...mailBase,refundRequiredCents:Number(change.refundRequiredCents)||0});
        else mail=await sendExternalExcursionUpdatedEmail(mailBase);
      }catch{mail={sent:false,error:'Guest email could not be sent.'};}
      return Response.json({ok:true,revision:revision+1,decision:{id:change.id,type:change.type,status:change.status,logisticsChanged:!!change.logisticsChanged,autoAssigned:!!decision?.autoAssigned,scheduleId:decision?.scheduleId||'',scheduleName:decision?.scheduleName||'',time:decision?.time||'',endTime:decision?.endTime||'',refundRequiredCents:Number(change.refundRequiredCents)||0},email:mail},{headers});
    }
    if(input?.action==='edit-bill'){
      if(user.role!=='admin')return Response.json({error:'Only Admin can edit excursion bills.'},{status:403,headers});
      if(typeof input.id!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0||!Number.isSafeInteger(input.billRevision)||input.billRevision<0){
        return Response.json({error:'Refresh the excursion bill and try again.'},{status:400,headers});
      }
      const {state,revision}=await loadStays();
      if(input.revision!==revision)return Response.json({error:'Booking or billing data changed. Refresh and reopen the bill.'},{status:409,headers});
      let result:any;
      try{result=applyExcursionBillEdit(state,{id:input.id,revision:input.billRevision,date:input.date,status:input.status,items:input.items,requestId:input.requestId},user);}
      catch(error){return Response.json({error:error instanceof Error?error.message:'Check the excursion bill.'},{status:400,headers});}
      let nextRevision=0,primaryAvailable=true;
      try{nextRevision=await saveOperationalRecordPrimary(stayKey,state,revision,user.userId);}catch{primaryAvailable=false;}
      if(primaryAvailable){
        if(!nextRevision)return Response.json({error:'Another user changed the excursion bill. Refresh and try again.'},{status:409,headers});
        try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(stayKey,JSON.stringify(state),nextRevision,user.userId).run();}catch{}
        try{await mirrorHotelState(state);}catch{}
        return Response.json({ok:true,revision:nextRevision,bill:result.bill,pricing:excursionPricing(result.order)},{headers});
      }
      const saved=revision===0
       ?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,JSON.stringify(state),user.userId).run()
       :await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(state),user.userId,stayKey,revision).run();
      if(!saved.meta.changes)return Response.json({error:'Another user changed the excursion bill. Refresh and try again.'},{status:409,headers});
      try{await Promise.all([mirrorHotelState(state),mirrorOperationalRecord(stayKey,state,revision+1,user.userId)]);}catch{}
      return Response.json({ok:true,revision:revision+1,bill:result.bill,pricing:excursionPricing(result.order)},{headers});
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
