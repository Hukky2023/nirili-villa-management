import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {loadStays,stayKey} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {excursionGuestMix,excursionPriceCents} from '../../../lib/excursion-children';
import {loadExcursionMenu} from '../../../lib/excursion-menu';
import {ensureStandardDailyExcursions} from '../../../lib/excursion-default-schedule';
import {excursionResources} from '../../../lib/excursion-workflow';
import {buildExcursionManifest} from '../../../lib/excursion-manifest';
import {assertGuideRule,assignedGuideCount,cleanGuideSelection,guideRuleFor,requiredExcursionGuides} from '../../../lib/excursion-guides';
import {excursionDeparturePassed} from '../../../lib/guest-catalog';
import {isPrivateResortVisit,isRomanticBeachDinner,ROMANTIC_BEACH_DINNER_SERVICE,RESORT_VISIT_SERVICE} from '../../../lib/excursion-services';
import {clockMinutes,droneConflict,fridayExcursionBlackout,fridayExcursionBlackoutMessage,goproConflict,inferTripEndTime,isDroneRequiredTrip,isSnorkelingTrip,scheduleCanServeRequest,scheduleMatchRank,suggestedTripWindow,timeRangesOverlap,vesselConflict} from '../../../lib/excursion-operations';
import {mirrorExcursionScheduleRecord,mirrorHotelState} from '../../../lib/supabase-bridge';

const prefix='excursion-schedule:';
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
const validTime=(v:any)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const clean=async (x:any,state:any)=>{
 if(!x||!validDate(x.date)||!validTime(x.time))throw Error('Choose a valid date and departure time.');
 const name=String(x.name||'').trim().slice(0,180);
 if(!name)throw Error('Excursion name is required.');
 const endTime=validTime(x.endTime)?String(x.endTime):inferTripEndTime(name,x.time);
 if(!validTime(endTime)||clockMinutes(endTime)<=clockMinutes(x.time))throw Error('Choose an end time later than the departure time.');
 if(fridayExcursionBlackout(x.date,x.time,endTime))throw Error(fridayExcursionBlackoutMessage);
 let capacity=Math.max(1,Math.min(100,Number(x.capacity)||1));
 const priceCents=Math.max(0,Math.min(1000000,Math.round(Number(x.priceCents)||0)));
 const vesselId=String(x.vesselId||'').slice(0,100);
 const crewIds=Array.isArray(x.crewIds)?[...new Set(x.crewIds.map((id:any)=>String(id).slice(0,100)).filter(Boolean))].slice(0,20):[];
 const status=x.status==='Closed'?'Closed':'Open';
 const notes=String(x.notes||'').trim().slice(0,1000);
 const sharedGroup=String(x.sharedGroup||'').trim().slice(0,80);
 const resources=excursionResources(state);
 const snorkeling=isSnorkelingTrip(name),needsDrone=isDroneRequiredTrip(name);
 let goproId=String(x.goproId||'').slice(0,100),droneId=String(x.droneId||'').slice(0,100);
 if(snorkeling&&status!=='Closed'){
  const gopro=resources.gopros.find((item:any)=>item.id===goproId);
  if(!gopro||gopro.condition!=='Available')throw Error('Every snorkeling trip requires an available GoPro. Assign a GoPro to the vessel before saving.');
 }else if(!snorkeling)goproId='';
 if(needsDrone&&status!=='Closed'){
  const drone=resources.drones.find((item:any)=>item.id===droneId);
  if(!drone||drone.condition!=='Available')throw Error('Shark snorkeling and Sandbank trips require an available drone. Assign a drone before saving.');
 }else if(!needsDrone)droneId='';
 // Read the saved vessel, not a capacity supplied by the browser. This runs
 // for both Create/Edit and each row in the shared-departure assignment flow.
 // Only raise the scheduled limit; do not change bookings or the vessel record.
 if(vesselId){
  const vessel=resources.vessels.find((v:any)=>v.id===vesselId);
  const vesselCapacity=Number(vessel?.capacity);
  if(Number.isSafeInteger(vesselCapacity)&&vesselCapacity>capacity)capacity=vesselCapacity;
 }
 return {date:x.date,time:x.time,endTime,name,capacity,priceCents,vesselId,goproId,droneId,crewIds,status,notes,sharedGroup};
};
function matches(o:any,s:any){
 if(o.kind!=='excursion'||o.status==='Cancelled'||o.approvalStatus==='Declined'||o.approvalStatus==='Cancelled')return false;
 if(o.scheduleId)return o.scheduleId===s.id&&(o.date||o.schedule?.date)===s.date;
 const os=o.schedule||{};
 return (os.date||o.date)===s.date&&os.time===s.time&&(!s.vesselId||os.vesselId===s.vesselId)&&norm(o.name)===norm(s.name);
}
const isConfirmed=(o:any)=>o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled'&&o.status!=='Cancelled';
const isPending=(o:any)=>o.approvalStatus==='Pending'&&o.status!=='Cancelled';
const sharedKey=(s:any)=>s.sharedGroup?s.date+'|'+s.time+'|group:'+s.sharedGroup:s.vesselId?s.date+'|'+s.time+'|vessel:'+s.vesselId:'';
function separateVesselConflict(orders:any[],vesselId:string,date:string,time:string,endTime:string,excludeOrderId=''){
 return orders.find((order:any)=>{
  if(!order||order.id===excludeOrderId||!order.separateVessel||order.status==='Cancelled'||order.approvalStatus==='Cancelled')return false;
  const assignedVessel=String(order.overflowVesselId||order.schedule?.vesselId||'');
  const assignedDate=String(order.date||order.schedule?.date||''),assignedTime=String(order.time||order.schedule?.time||''),assignedEnd=String(order.endTime||order.schedule?.endTime||inferTripEndTime(order.name,assignedTime));
  return assignedVessel===vesselId&&assignedDate===date&&timeRangesOverlap(time,endTime,assignedTime,assignedEnd);
 })||null;
}

const requestScheduleCleanupMarker='excursion-request-created-schedules-cleared-2026-09-19';
async function clearExistingRequestCreatedSchedulesOnce(){
 const db=authDb();
 const marker=await db.prepare('SELECT key FROM operation_records WHERE key=?').bind(requestScheduleCleanupMarker).first<any>();
 if(marker)return;
 await db.batch([
  db.prepare("DELETE FROM operation_records WHERE key LIKE ? AND (json_extract(payload,'$.createdFromRequest') IS NOT NULL OR json_extract(payload,'$.id') LIKE 'req-%')").bind(prefix+'%'),
  db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)')
   .bind(requestScheduleCleanupMarker,JSON.stringify({at:new Date().toISOString(),action:'Removed booking-request-created schedules; kept regular schedule only.'}),'system:'+requestScheduleCleanupMarker)
 ]);
}
async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>({...JSON.parse(row.payload),revision:row.revision})).sort((a:any,b:any)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!hasPermission(user,'edit_excursions')&&!hasPermission(user,'excursions_manager'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||'';
 if(!validDate(date))return Response.json({error:'Valid schedule date required.'},{status:400});
 try{
  await clearExistingRequestCreatedSchedulesOnce();
  await ensureStandardDailyExcursions(date);
  const rawAll=await schedulesForDate(date);
  // Cancelled trips remain stored for history/audit, but are removed from the live admin schedule screen.
  const raw=rawAll.filter((schedule:any)=>schedule.status!=='Cancelled');
  const {state}=await loadStays(),orders=Array.isArray(state.orders)?state.orders:[];
  const resources=excursionResources(state);
  const schedules=raw.map((s:any)=>{
   // Use the same manifest resolver as View Guests and Share Timetable so schedule
   // occupancy, guest names and shared timetable can never disagree for the same trip.
   const manifest=buildExcursionManifest(s,raw,state,resources,()=>false);
   const mainBookings=manifest.bookings.filter((booking:any)=>!booking.separateVessel);
   const bookedPax=manifest.totals.mainVesselPax;
   const confirmedPax=manifest.totals.pax;
   const guestNames=mainBookings.flatMap((booking:any)=>
    (booking.people||[]).map((person:any)=>String(person?.name||'').trim()||('Guest '+person.slot+' · name not entered'))
   );
   const pendingOrders=orders.filter((o:any)=>matches(o,s)&&isPending(o));
   const pendingPax=pendingOrders.reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const extraVesselBookings=manifest.bookings.filter((booking:any)=>booking.separateVessel).map((booking:any)=>({
    id:booking.id,guest:booking.guest,room:booking.room||'',quantity:booking.guests,
    vessel:booking.vessel||'',createdAt:booking.createdAt||''
   }));
   return {...s,priceCents:Number(s.priceCents)||0,bookedPax,confirmedPax,guestNames,pendingPax,sharedBoatKey:sharedKey(s),pendingOrders,extraVesselBookings};
  });
  const groups:Record<string,{scheduleIds:string[],bookedPax:number,pendingPax:number,capacity:number}>={};
  for(const s of schedules){
   if(s.status==='Cancelled'||!s.sharedBoatKey)continue;
   const g=groups[s.sharedBoatKey]||(groups[s.sharedBoatKey]={scheduleIds:[],bookedPax:0,pendingPax:0,capacity:s.capacity});
   g.scheduleIds.push(s.id);g.bookedPax+=s.bookedPax;g.pendingPax+=s.pendingPax;g.capacity=Math.min(g.capacity,s.capacity);
  }
  const enriched=schedules.map((s:any)=>{
   const g=s.sharedBoatKey?groups[s.sharedBoatKey]:null,capacity=g?.capacity??s.capacity;
   const requests=s.pendingOrders.map((o:any)=>({id:o.id,guest:o.guest,room:o.room||o.externalRoom||'',inHouse:!!o.stayId,quantity:o.quantity,adults:Number(o.adults??o.quantity)||0,children:Number(o.children)||0,infants:Number(o.infants)||0,name:o.name||s.name,matchedScheduleName:o.matchedScheduleName||s.name,buggyRequested:!!o.buggyRequested,notes:o.notes||'',createdAt:o.createdAt,overCapacity:true}));
   const {pendingOrders,...rest}=s;
   return {...rest,requests,capacity,remainingSeats:Math.max(0,capacity-(g?.bookedPax??s.bookedPax)),isFull:(g?.bookedPax??s.bookedPax)>=capacity,guideRule:guideRuleFor(s,raw,orders,resources.crew)};
  });
  const unscheduledRequests=orders.filter((o:any)=>o.kind==='excursion'&&o.date===date&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled').map((o:any)=>({
   id:o.id,name:o.name,guest:o.guest||'Guest',phone:o.phone||'',hotel:o.hotel||'',room:o.room||o.externalRoom||'',inHouse:!!o.stayId,quantity:Number(o.quantity)||0,adults:Number(o.adults??o.quantity)||0,children:Number(o.children)||0,infants:Number(o.infants)||0,date:o.date,
   quotedCents:Math.max(0,Number(o.quotedCents)||0),unitPriceCents:Math.max(0,Number(o.unitPriceCents)||0),pricingUnit:o.pricingUnit||'guest',
   buggyRequested:!!o.buggyRequested,privateBoatRequested:!!o.privateBoatRequested,privateBoatSurchargeCents:Number(o.privateBoatSurchargeCents)||0,preferredTime:o.preferredTime||'',preferredEndTime:o.preferredEndTime||'',serviceType:o.serviceType||'',serviceRequest:!!o.serviceRequest,notes:o.notes||'',source:o.source||'',createdAt:o.createdAt||''
  }));
  return Response.json({date,schedules:enriched,sharedBoatGroups:groups,unscheduledRequests,canEdit:hasPermission(user,'edit_excursions')||hasPermission(user,'excursions_manager')},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load excursion schedules.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions')&&!hasPermission(user,'excursions_manager'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const input=await r.json(),{state}=await loadStays();
  const body=await clean(input,state),crew=excursionResources(state).crew;
  const daySchedules=await schedulesForDate(body.date);
  const conflict=vesselConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(conflict)throw Error('This vessel is already in use for '+conflict.name+' from '+conflict.time+' to '+(conflict.endTime||inferTripEndTime(conflict.name,conflict.time))+'. Choose another vessel or a non-overlapping time.');
  const cameraConflict=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(cameraConflict)throw Error('This GoPro is already assigned to '+cameraConflict.name+' from '+cameraConflict.time+' to '+(cameraConflict.endTime||inferTripEndTime(cameraConflict.name,cameraConflict.time))+'. Choose another GoPro or a non-overlapping time.');
  const droneClash=droneConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,droneId:body.droneId,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(droneClash)throw Error('This drone is already assigned to '+droneClash.name+' from '+droneClash.time+' to '+(droneClash.endTime||inferTripEndTime(droneClash.name,droneClash.time))+'. Choose another drone or a non-overlapping time.');
  const guideIds=cleanGuideSelection(input.guideIds,body.crewIds,crew);
  const id=crypto.randomUUID();
  const record={id,...body,guideIds,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(record.status!=='Closed')assertGuideRule(guideRuleFor(record,daySchedules,state.orders||[],crew));
  const result=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(prefix+body.date+':'+id,JSON.stringify(record),user.userId).run();
  if(!result.meta.changes)throw Error('Could not create schedule.');
  try{await mirrorExcursionScheduleRecord(prefix+body.date+':'+id,{...record,revision:1,updatedBy:user.userId});}catch{}
  return Response.json({schedule:{...record,revision:1}},{status:201});
 }catch(e){return Response.json({error:(e as Error).message||'Could not create schedule.'},{status:400});
 }
}

export async function PUT(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions')&&!hasPermission(user,'excursions_manager'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const raw=await r.json();
  const id=String(raw.id||'').slice(0,100),revision=Number(raw.revision);
  if(!id||!Number.isInteger(revision)||revision<1)throw Error('Invalid schedule record.');
  const {state}=await loadStays();
  const body=await clean(raw,state);
  const key=prefix+body.date+':'+id;
  const existing=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(key).first<any>();
  if(!existing)throw Error('Schedule not found.');
  const old=JSON.parse(existing.payload);
  if(old.status==='Cancelled')throw Error('Cancelled excursions cannot be edited. Create a new schedule instead.');
  const crew=excursionResources(state).crew;
  // Older clients retain recorded guides, but a removed crew member is no longer a guide.
  const selection=raw.guideIds===undefined?(old.guideIds||[]).filter((guide:string)=>body.crewIds.includes(guide)):raw.guideIds;
  const guideIds=cleanGuideSelection(selection,body.crewIds,crew);
  const crewChanged=raw.crewIds!==undefined&&JSON.stringify([...(old.crewIds||[])].sort())!==JSON.stringify([...(body.crewIds||[])].sort());
  const record={...old,...body,guideIds,id,updatedAt:new Date().toISOString()};
  if(crewChanged){delete record.crewReplacementNeeded;delete record.lastCrewUnavailability;}
  const daySchedules=await schedulesForDate(body.date);
  const conflict=vesselConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(conflict)throw Error('This vessel is already in use for '+conflict.name+' from '+conflict.time+' to '+(conflict.endTime||inferTripEndTime(conflict.name,conflict.time))+'. A vessel becomes available only after its trip end time.');
  const cameraConflict=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(cameraConflict)throw Error('This GoPro is already assigned to '+cameraConflict.name+' from '+cameraConflict.time+' to '+(cameraConflict.endTime||inferTripEndTime(cameraConflict.name,cameraConflict.time))+'. Choose another GoPro or wait until that trip ends.');
  const droneClash=droneConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,droneId:body.droneId,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(droneClash)throw Error('This drone is already assigned to '+droneClash.name+' from '+droneClash.time+' to '+(droneClash.endTime||inferTripEndTime(droneClash.name,droneClash.time))+'. Choose another drone or wait until that trip ends.');
  // Closing an unsafe/understaffed trip must remain possible; departure is guarded separately.
  if(record.status!=='Closed')assertGuideRule(guideRuleFor(record,daySchedules,state.orders||[],crew,old));
  const result=await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(record),user.userId,key,revision).run();
  if(!result.meta.changes)return Response.json({error:'Schedule changed elsewhere. Reload and try again.'},{status:409});
  try{await mirrorExcursionScheduleRecord(key,{...record,revision:revision+1,updatedBy:user.userId});}catch{}
  return Response.json({schedule:{...record,revision:revision+1}});
 }catch(e){return Response.json({error:(e as Error).message||'Could not update schedule.'},{status:400});
 }
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions')&&!hasPermission(user,'excursions_manager'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const b=await r.json();
  if(b.action==='cancel-schedule'){
   const id=String(b.id||'').slice(0,100),date=String(b.date||''),reason=String(b.reason||'').trim().slice(0,500);
   if(!id||!validDate(date))throw Error('Choose a valid scheduled excursion.');
   if(!reason)throw Error('Enter a reason for cancelling this excursion.');
   const db=authDb(),key=prefix+date+':'+id;
   const row=await db.prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();
   if(!row)throw Error('Scheduled excursion not found.');
   const schedule=JSON.parse(row.payload);
   if(schedule.status==='Cancelled')return Response.json({ok:true,alreadyCancelled:true,reason:schedule.cancellationReason||''});
   const {state,revision}=await loadStays();
   const now=new Date().toISOString();
   const affected=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&o.status!=='Cancelled'&&o.approvalStatus!=='Cancelled'&&matches(o,schedule));
   for(const order of affected){
    order.status='Cancelled';
    order.approvalStatus='Cancelled';
    order.cents=0;
    order.cancelledAt=now;
    order.cancelledBy=user.username;
    order.cancellationReason=reason;
    order.scheduleCancelled=true;
    order.guestNotified=false;
   }
   const cancelledSchedule={...schedule,status:'Cancelled',cancellationReason:reason,cancelledAt:now,cancelledBy:user.username,updatedAt:now};
   const stayPayload=JSON.stringify(state);
   const statements:any[]=[
    db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(cancelledSchedule),user.userId,key,Number(row.revision))
   ];
   if(revision===0)statements.push(db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,stayPayload,user.userId));
   else statements.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(stayPayload,user.userId,stayKey,revision));
   const results=await db.batch(statements);
   if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:'The excursion changed elsewhere. Reload and try again.'},{status:409});
   try{await mirrorExcursionScheduleRecord(key,{...cancelledSchedule,revision:Number(row.revision)+1,updatedBy:user.userId});await mirrorHotelState(state);}catch{}
   return Response.json({ok:true,cancelledBookings:affected.length,reason,status:'Cancelled'});
  }

  if(b.action==='confirm-romantic-dinner'){
   const requestId=String(b.requestId||'').slice(0,100),time=String(b.time||'');
   if(!requestId)throw Error('Choose a dinner booking request.');
   if(!validTime(time))throw Error('Choose a valid dinner time.');
   const {state,revision}=await loadStays();
   const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled'&&isRomanticBeachDinner(o));
   if(!order)throw Error('This romantic dinner request has already been handled.');
   if(excursionDeparturePassed(order.date,time))throw Error('This dinner time is already in the past. Choose a future time.');
   const now=new Date().toISOString();
   order.time=time;order.dinnerTime=time;order.approvalStatus='Approved';order.status='Confirmed';order.cents=Math.max(0,Number(order.quotedCents)||0);
   order.unscheduledRequest=false;order.seatRequest=false;order.autoConfirmed=false;order.adminScheduled=false;order.serviceRequest=false;
   order.serviceType=ROMANTIC_BEACH_DINNER_SERVICE;order.buggyRoundTrip=!!order.buggyRequested;
   order.reviewedAt=now;order.reviewedBy=user.username;order.guestNotified=false;
   delete order.scheduleId;delete order.schedule;delete order.vesselId;delete order.crewIds;delete order.guideIds;
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another update was saved at the same time. Reload and try again.'},{status:409});
   return Response.json({ok:true,booking:{id:order.id,status:'Confirmed',time:order.time,serviceType:order.serviceType,buggyRoundTrip:order.buggyRoundTrip}});
  }

  if(b.action==='schedule-request'){
   const requestId=String(b.requestId||'').slice(0,100),time=String(b.time||''),requestedEndTime=String(b.endTime||''),returnTime=String(b.returnTime||''),vesselId=String(b.vesselId||'').slice(0,100),goproId=String(b.goproId||'').slice(0,100),droneId=String(b.droneId||'').slice(0,100);
   const capacity=Math.max(1,Math.min(100,Math.round(Number(b.capacity)||1)));
   const crewIds=Array.isArray(b.crewIds)?b.crewIds:[],guideIdsInput=Array.isArray(b.guideIds)?b.guideIds:[];
   if(!requestId||!validTime(time)||!vesselId)throw Error('Choose a departure time and vessel.');
   const {state,revision}=await loadStays();
   const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled');
   if(!order)throw Error('This scheduling request has already been handled.');
   const resortVisit=isPrivateResortVisit(order);
   if(resortVisit){
    if(!validTime(returnTime))throw Error('Choose a valid return pickup time for the resort visit.');
    if(returnTime<=time)throw Error('Return pickup time must be later than the departure time.');
   }
   const endTime=resortVisit?returnTime:(validTime(requestedEndTime)?requestedEndTime:(order.preferredEndTime||inferTripEndTime(order.name,time)));
   if(!validTime(endTime)||clockMinutes(endTime)<=clockMinutes(time))throw Error('Choose an end time later than the departure time.');
   const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===vesselId);
   if(!vessel||vessel.condition!=='Available')throw Error('Choose an available vessel.');
   const priceCents=Math.max(0,Number(order.operationalPriceCents)||Number(order.unitPriceCents)||Math.round((Number(order.quotedCents)||0)/Math.max(1,Number(order.quantity)||1)));
   const body=await clean({date:order.date,time,endTime,name:order.name,capacity,priceCents,vesselId,goproId,droneId,crewIds,status:'Open',notes:'Created from booking request '+order.id,sharedGroup:''},state);
   const daySchedules=await schedulesForDate(body.date);
   const conflict=vesselConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,vesselId:body.vesselId});
   if(conflict)throw Error('This vessel is already in use for '+conflict.name+' from '+conflict.time+' to '+(conflict.endTime||inferTripEndTime(conflict.name,conflict.time))+'. Choose another vessel or a non-overlapping time.');
   const cameraConflict=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId,vesselId:body.vesselId});
   if(cameraConflict)throw Error('This GoPro is already assigned to '+cameraConflict.name+' during this time. Choose another GoPro.');
   const droneClash=droneConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,droneId:body.droneId,vesselId:body.vesselId});
   if(droneClash)throw Error('This drone is already assigned to '+droneClash.name+' during this time. Choose another drone.');
   if(excursionDeparturePassed(body.date,body.time))throw Error('This departure time is already in the past. Choose a future departure time.');
   if(body.capacity<Math.max(1,Number(order.quantity)||1))throw Error('Boat capacity must cover all guests in this booking.');
   const guides=cleanGuideSelection(guideIdsInput,body.crewIds,resources.crew);
   const requiredGuides=requiredExcursionGuides(Math.max(0,Number(order.quantity)||0));
   const assignedGuides=assignedGuideCount(guides,body.crewIds,resources.crew);
   if(assignedGuides<requiredGuides)throw Error('This booking has '+order.quantity+' guests. Assign at least '+requiredGuides+' guides before scheduling.');
   const scheduleId='req-'+crypto.randomUUID(),now=new Date().toISOString();
   const record={id:scheduleId,...body,...(resortVisit?{returnTime,serviceType:RESORT_VISIT_SERVICE}:{}),guideIds:guides,privateTrip:!!order.privateBoatRequested,createdFromRequest:order.id,createdAt:now,updatedAt:now};
   const key=prefix+body.date+':'+scheduleId;
   const inserted=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(record),user.userId).run();
   if(!inserted.meta.changes)throw Error('Could not create the requested trip.');
   const crew=resources.crew.filter((c:any)=>body.crewIds.includes(c.id));
   order.scheduleId=scheduleId;order.time=body.time;order.endTime=body.endTime;if(resortVisit){order.returnTime=returnTime;order.serviceType=RESORT_VISIT_SERVICE;}order.approvalStatus='Approved';order.status='Scheduled';order.cents=Math.max(0,Number(order.quotedCents)||0);
   order.seatRequest=false;order.unscheduledRequest=false;order.autoConfirmed=false;order.adminScheduled=true;order.requestedOverCapacity=false;
   order.reviewedAt=now;order.reviewedBy=user.username;order.guestNotified=false;
   order.schedule={date:body.date,time:body.time,endTime:body.endTime,...(resortVisit?{returnTime}:{}),vesselId:body.vesselId,vessel:vessel.name,...(body.goproId?{goproId:body.goproId,gopro:resources.gopros.find((g:any)=>g.id===body.goproId)?.name||body.goproId}:{}),...(body.droneId?{droneId:body.droneId,drone:resources.drones.find((d:any)=>d.id===body.droneId)?.name||body.droneId}:{}),crewIds:body.crewIds,guideIds:guides,crew:crew.map((c:any)=>c.name),privateBoat:!!order.privateBoatRequested};
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved){
    await authDb().prepare('DELETE FROM operation_records WHERE key=?').bind(key).run();
    return Response.json({error:'Another update was saved at the same time. Reload and try again.'},{status:409});
   }
   try{await mirrorExcursionScheduleRecord(key,{...record,revision:1,updatedBy:user.userId});}catch{}
   return Response.json({ok:true,booking:{id:order.id,status:'Confirmed'},schedule:{...record,revision:1}},{status:201});
  }

  if(b.action==='reject-unscheduled-request'){
   const requestId=String(b.requestId||'').slice(0,100);
   if(!requestId)throw Error('Choose a valid excursion request.');
   const {state,revision}=await loadStays();
   const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled');
   if(!order)throw Error('This scheduling request has already been handled.');
   order.approvalStatus='Declined';
   order.status='Cancelled';
   order.unscheduledRequest=false;
   order.seatRequest=false;
   order.cents=0;
   order.rejectedAt=new Date().toISOString();
   order.rejectedBy=user.username;
   order.guestNotified=false;
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another update was saved at the same time. Reload and try again.'},{status:409});
   return Response.json({ok:true,requestId,status:'Rejected'});
  }

  if(b.action==='admin-booking-auto'){
   const date=String(b.date||''),menuItemId=String(b.menuItemId||'').slice(0,100),guestType=String(b.guestType||''),mix=excursionGuestMix(b,Number(b.quantity)||1,100),quantity=mix.total,notes=String(b.notes||'').trim().slice(0,1000);
   if(!validDate(date)||!menuItemId||!['inhouse','walkin'].includes(guestType))throw Error('Check the excursion, date, guest type and number of guests.');
   const {state,revision}=await loadStays();
   await ensureStandardDailyExcursions(date);
   const menu=await loadExcursionMenu(),item=menu.find((x:any)=>x.id===menuItemId&&x.kind==='excursion'&&x.active!==false);
   if(!item)throw Error('This excursion is no longer available.');
   const allSchedules=(await schedulesForDate(date)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
   const candidates=allSchedules
    .filter((schedule:any)=>scheduleCanServeRequest(item.name,schedule.name))
    .map((schedule:any)=>{
      const key=sharedKey(schedule),groupSchedules=key?allSchedules.filter((x:any)=>sharedKey(x)===key):[schedule],groupIds=new Set(groupSchedules.map((x:any)=>x.id));
      const capacity=Math.min(...groupSchedules.map((x:any)=>Math.max(1,Number(x.capacity)||1)));
      const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&isConfirmed(o)&&(groupIds.has(o.scheduleId)||groupSchedules.some((x:any)=>matches(o,x)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
      return {schedule,capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax),rank:scheduleMatchRank(item.name,schedule.name)};
    })
    .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));
   const chosen=b.forceUnscheduled===true?undefined:candidates.find((candidate:any)=>candidate.remaining>=quantity);
   let stay:any=null,guest='',phone='',hotel='',room='',accountId:any=undefined,stayId:any=undefined;
   if(guestType==='inhouse'){
    stay=(state.stays||[]).find((x:any)=>x.id===String(b.stayId||'')&&x.status==='In House');
    if(!stay)throw Error('Choose a valid in-house guest.');
    guest=stay.guest;phone=stay.whatsapp||'';hotel='Nirili Villa';room=stay.room;accountId=stay.accountId;stayId=stay.id;
   }else{
    guest=String(b.guest||'').trim().slice(0,100);phone=String(b.phone||'').replace(/[ ()-]/g,'');hotel=String(b.hotel||'').trim().slice(0,150);room=String(b.externalRoom||'').trim().slice(0,50);
    if(!guest||!hotel||!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('Enter the walk-in guest name, hotel and WhatsApp number with country code.');
   }
   const unitPriceCents=Math.max(0,Number(item.cents)||0),pricingUnit=item.pricingUnit==='couple'?'couple':'guest',quotedCents=excursionPriceCents(unitPriceCents,pricingUnit,mix),id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
   state.orders??=[];
   if(chosen){
    const schedule=chosen.schedule,resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
    state.orders.push({id,kind:'excursion',menuItemId:item.id,name:item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents:quotedCents,quotedCents,unitPriceCents,pricingUnit,guest,phone,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),notes,status:'Scheduled',approvalStatus:'Approved',seatRequest:false,unscheduledRequest:false,autoConfirmed:true,adminCreated:true,matchedFromMenu:true,matchedScheduleName:schedule.name,scheduleId:schedule.id,source:guestType==='inhouse'?'Admin · In-house':'Admin · Walk-in',schedule:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId||'',vessel:vessel?.name||'',...(schedule.goproId?{goproId:schedule.goproId,gopro:resources.gopros.find((g:any)=>g.id===schedule.goproId)?.name||schedule.goproId}:{}),...(schedule.droneId?{droneId:schedule.droneId,drone:resources.drones.find((d:any)=>d.id===schedule.droneId)?.name||schedule.droneId}:{}),crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name)},guestNotified:false,createdBy:user.username,createdAt});
   }else{
    const fallback=suggestedTripWindow(item.name);
    state.orders.push({id,kind:'excursion',menuItemId:item.id,name:item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents:0,quotedCents,unitPriceCents,pricingUnit,guest,phone,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date,time:'',preferredTime:fallback.time,preferredEndTime:fallback.endTime,notes,status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:false,unscheduledRequest:true,autoConfirmed:false,adminCreated:true,requestedSchedule:true,guestNotified:false,source:guestType==='inhouse'?'Admin · In-house request':'Admin · Walk-in request',createdBy:user.username,createdAt});
   }
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   return Response.json({booking:{id,status:chosen?'Confirmed':'Pending',requiresScheduling:!chosen,matchedScheduleId:chosen?.schedule.id||'',matchedScheduleName:chosen?.schedule.name||'',time:chosen?.schedule.time||'',suggestedTime:chosen?'':suggestedTripWindow(item.name).time}},{status:201});
  }

  if(b.action==='admin-booking'){
   const date=String(b.date||''),scheduleId=String(b.scheduleId||'').slice(0,100),guestType=String(b.guestType||''),mix=excursionGuestMix(b,Number(b.quantity)||1,100),quantity=mix.total,notes=String(b.notes||'').trim().slice(0,1000),requestedVesselId=String(b.vesselId||'').slice(0,100);
   if(!validDate(date)||!scheduleId||!['inhouse','walkin'].includes(guestType))throw Error('Check the excursion, guest type and number of guests.');
   const {state,revision}=await loadStays();
   const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+date+':'+scheduleId).first<any>();
   if(!row)throw Error('This scheduled excursion no longer exists.');
   const schedule=JSON.parse(row.payload);
   if(schedule.status!=='Open')throw Error('This excursion is closed for bookings.');
   if(excursionDeparturePassed(schedule.date,schedule.time))throw Error('This excursion departure time has already passed. A booking cannot be created for it.');
   const sameDay=await schedulesForDate(date),key=sharedKey(schedule),groupSchedules=key?sameDay.filter((s:any)=>sharedKey(s)===key):[schedule],groupIds=new Set(groupSchedules.map((s:any)=>s.id));
   const capacity=Math.min(...groupSchedules.map((s:any)=>Math.max(1,Number(s.capacity)||1)));
   const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&isConfirmed(o)&&(groupIds.has(o.scheduleId)||groupSchedules.some((s:any)=>matches(o,s)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const needsExtraVessel=confirmedPax+quantity>capacity;
   const resources=excursionResources(state);
   let vessel:any=null;
   if(needsExtraVessel){
    if(!requestedVesselId)throw Error('This departure is at capacity. Assign a new vessel for this booking.');
    vessel=resources.vessels.find((v:any)=>v.id===requestedVesselId);
    if(!vessel||vessel.condition!=='Available')throw Error('Choose an available vessel.');
    const originalVesselIds=new Set(groupSchedules.map((s:any)=>String(s.vesselId||'')).filter(Boolean));
    if(originalVesselIds.has(vessel.id))throw Error('Choose a different vessel from the vessel already assigned to this departure.');
    const endTime=schedule.endTime||inferTripEndTime(schedule.name,schedule.time);
    const scheduledConflict=vesselConflict(sameDay,{date:schedule.date,time:schedule.time,endTime,vesselId:vessel.id});
    if(scheduledConflict)throw Error(vessel.name+' is already in use for '+scheduledConflict.name+' from '+scheduledConflict.time+' to '+(scheduledConflict.endTime||inferTripEndTime(scheduledConflict.name,scheduledConflict.time))+'.');
    const bookingConflict=separateVesselConflict(state.orders||[],vessel.id,schedule.date,schedule.time,endTime);
    if(bookingConflict)throw Error(vessel.name+' is already assigned to another private/extra-vessel booking during this time.');
   }else vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId);
   let stay:any=null,guest='',phone='',hotel='',room='',accountId:any=undefined,stayId:any=undefined;
   if(guestType==='inhouse'){
    stay=(state.stays||[]).find((s:any)=>s.id===String(b.stayId||'')&&s.status==='In House');
    if(!stay)throw Error('Choose a valid in-house guest.');
    guest=stay.guest;phone=stay.whatsapp||'';hotel='Nirili Villa';room=stay.room;accountId=stay.accountId;stayId=stay.id;
   }else{
    guest=String(b.guest||'').trim().slice(0,100);phone=String(b.phone||'').replace(/[ ()-]/g,'');hotel=String(b.hotel||'').trim().slice(0,150);room=String(b.externalRoom||'').trim().slice(0,50);
    if(!guest||!hotel||!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('Enter the walk-in guest name, hotel and WhatsApp number with country code.');
   }
   const crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id)),unitPriceCents=Math.max(0,Number(schedule.priceCents)||0),cents=excursionPriceCents(unitPriceCents,'guest',mix),id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
   state.orders??=[];
   state.orders.push({id,kind:'excursion',scheduleId:schedule.id,name:schedule.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents,unitPriceCents,quotedCents:cents,guest,phone,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date:schedule.date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),returnTime:schedule.returnTime||'',notes,status:'Scheduled',approvalStatus:'Approved',seatRequest:false,autoConfirmed:true,adminCreated:true,separateVessel:needsExtraVessel,overflowVesselId:needsExtraVessel?vessel?.id:undefined,source:guestType==='inhouse'?'Admin · In-house':'Admin · Walk-in',schedule:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:vessel?.id||schedule.vesselId||'',vessel:vessel?.name||'',...(schedule.goproId&&!needsExtraVessel?{goproId:schedule.goproId,gopro:resources.gopros.find((g:any)=>g.id===schedule.goproId)?.name||schedule.goproId}:{}),...(schedule.droneId&&!needsExtraVessel?{droneId:schedule.droneId,drone:resources.drones.find((d:any)=>d.id===schedule.droneId)?.name||schedule.droneId}:{}),crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name),extraVessel:needsExtraVessel},guestNotified:false,createdBy:user.username,createdAt});
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   const savedBooking=state.orders.find((order:any)=>order.id===id);
   return Response.json({booking:{id,guest,guestType,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents,scheduleId:savedBooking.scheduleId,extraVesselTrip:!!savedBooking.extraVesselTrip,separateVessel:!!savedBooking.separateVessel,vessel:savedBooking.schedule?.vessel||vessel?.name||''}},{status:201});
  }

  const requestId=String(b.requestId||''),decision=String(b.decision||''),vesselId=String(b.vesselId||'').slice(0,100);
  if(!requestId||!['Approved','Declined'].includes(decision))throw Error('Choose Approve or Decline.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.seatRequest===true);
  if(!order||order.approvalStatus!=='Pending')throw Error('This seat request has already been handled.');
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+order.date+':'+order.scheduleId).first<any>();
  if(!row)throw Error('The scheduled excursion no longer exists.');
  const schedule=JSON.parse(row.payload);
  if(decision==='Approved'&&excursionDeparturePassed(schedule.date,schedule.time))throw Error('This excursion departure time has already passed. Move the booking to a future trip instead.');
  order.approvalStatus=decision;order.reviewedAt=new Date().toISOString();order.reviewedBy=user.username;
  if(decision==='Approved'){
   if(!vesselId)throw Error('Assign a new vessel before approving this over-capacity request.');
   const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===vesselId);
   if(!vessel)throw Error('Choose a valid vessel.');
   if(vessel.condition!=='Available')throw Error('The selected vessel is not available.');
   const sameDay=await schedulesForDate(order.date),key=sharedKey(schedule);
   const originalVesselIds=new Set((key?sameDay.filter((s:any)=>sharedKey(s)===key):[schedule]).map((s:any)=>String(s.vesselId||'')).filter(Boolean));
   if(originalVesselIds.has(vessel.id))throw Error('Choose a different vessel from the vessel already assigned to this departure.');
   const endTime=schedule.endTime||inferTripEndTime(schedule.name,schedule.time);
   const scheduledConflict=vesselConflict(sameDay,{date:schedule.date,time:schedule.time,endTime,vesselId:vessel.id});
   if(scheduledConflict)throw Error(vessel.name+' is already in use for '+scheduledConflict.name+' from '+scheduledConflict.time+' to '+(scheduledConflict.endTime||inferTripEndTime(scheduledConflict.name,scheduledConflict.time))+'.');
   const bookingConflict=separateVesselConflict(state.orders||[],vessel.id,schedule.date,schedule.time,endTime,order.id);
   if(bookingConflict)throw Error(vessel.name+' is already assigned to another private/extra-vessel booking during this time.');
   const crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
   order.cents=Math.max(0,Number(order.quotedCents)||0);
   order.status='Scheduled';order.separateVessel=true;order.overflowVesselId=vessel.id;order.originalScheduleId=schedule.id;
   order.endTime=endTime;order.returnTime=schedule.returnTime||'';order.schedule={date:schedule.date,time:schedule.time,endTime,...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:vessel.id,vessel:vessel.name,crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name),extraVessel:true};order.guestNotified=false;
  }else{order.cents=0;order.status='Cancelled';}
  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another update was saved. Reload and try again.'},{status:409});
  return Response.json({ok:true,decision,scheduleId:order.scheduleId,extraVesselTrip:!!order.extraVesselTrip,vesselId:decision==='Approved'?vesselId:undefined});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not review seat request.'},{status:400});
 }
}

export async function DELETE(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions')&&!hasPermission(user,'excursions_manager'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 return Response.json({error:'Scheduled excursions are not deleted. Use Cancel excursion and provide a reason.'},{status:400});
}
