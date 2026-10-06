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
import {clockMinutes,droneConflict,fridayExcursionBlackout,fridayExcursionBlackoutMessage,goproConflict,inferTripEndTime,isDroneRequiredTrip,isSnorkelingTrip,planSpecialPackageSchedules,PRIVATE_BOAT_SURCHARGE_CENTS,scheduleCanServeRequest,scheduleMatchRank,specialPackageCoverage,suggestedTripWindow,timeRangesOverlap,vesselConflict} from '../../../lib/excursion-operations';
import {mirrorExcursionScheduleRecord,mirrorHotelState,readExcursionSchedulesPrimary,readOperationalRecordPrimary,saveOperationalRecordPrimary,saveOperationalPairPrimary} from '../../../lib/supabase-bridge';
import {sendExternalExcursionBookedEmail,sendExternalExcursionDeclinedEmail,sendExternalExcursionUpdatedEmail} from '../../../lib/excursion-email';
import {sendGuestPushForExcursionTimeChange} from '../../../lib/web-push';
import {addGuestNotification} from '../../../lib/guest-notifications';
import {applyExcursionScheduleTimeChange,excursionTimeChangeMessage} from '../../../lib/excursion-time-change';
import {autoAssignExcursionOrder} from '../../../lib/excursion-auto-assignment';
import {buildSpecialPackageOrders} from '../../../lib/special-package-booking';

const prefix='excursion-schedule:';
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
const validTime=(v:any)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const shiftDate=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
function cleanAdminGuestDetails(input:any,quantity:number,lead:string,excursionName:string,mix:{adults:number;children:number;infants:number}){
 const rawNames=Array.isArray(input?.guestNames)?input.guestNames:[];
 const guestNames=Array.from({length:quantity},(_,index)=>String(rawNames[index]||(index===0?lead:'')).trim().replace(/\s+/g,' ').slice(0,100));
 if(guestNames.some(name=>!name))throw Error('Enter the name of every guest before confirming the excursion.');
 const rawCategories=Array.isArray(input?.guestCategories)?input.guestCategories:[];
 const fallbackCategories=[
  ...Array.from({length:Math.max(0,Number(mix.adults)||0)},()=> 'adult'),
  ...Array.from({length:Math.max(0,Number(mix.children)||0)},()=> 'child'),
  ...Array.from({length:Math.max(0,Number(mix.infants)||0)},()=> 'infant')
 ];
 const guestCategories=(rawCategories.length===quantity?rawCategories:fallbackCategories).slice(0,quantity).map((value:any)=>String(value||'').trim().toLowerCase());
 if(guestCategories.length!==quantity||guestCategories.some(category=>!['adult','child','infant'].includes(category)))throw Error('Choose Adult (12+), Child (3–11), or Under 3 for every guest.');
 const categoryMix={
  adults:guestCategories.filter(category=>category==='adult').length,
  children:guestCategories.filter(category=>category==='child').length,
  infants:guestCategories.filter(category=>category==='infant').length
 };
 if(categoryMix.adults!==mix.adults||categoryMix.children!==mix.children||categoryMix.infants!==mix.infants)throw Error('Guest age categories must match the adult and child totals.');
 let footSizes:number[]=[];
 if(isSnorkelingTrip(excursionName)){
  const rawSizes=Array.isArray(input?.footSizes)?input.footSizes:[];
  if(rawSizes.length<quantity)throw Error('Enter the EU foot size for every guest so snorkeling fins can be prepared.');
  footSizes=rawSizes.slice(0,quantity).map((value:any)=>Number(value));
  if(footSizes.some(size=>!Number.isInteger(size)||size<15||size>50))throw Error('EU foot sizes must be whole numbers from 15 to 50.');
 }
 return {guestNames,guestCategories,footSizes};
}
const makeAdminGuestRoster=(id:string,guestNames:string[],guestCategories:string[])=>guestNames.map((name,index)=>({
 id:id+':'+(index+1),slot:index+1,name,ageCategory:guestCategories[index]||'',boarded:false,boardedAt:''
}));
const clean=async (x:any,state:any)=>{
 if(!x||!validDate(x.date)||!validTime(x.time))throw Error('Choose a valid date and departure time.');
 const name=String(x.name||'').trim().slice(0,180);
 if(!name)throw Error('Excursion name is required.');
 if(norm(name)==='special package')throw Error('Special Package is a package booking, not one scheduled excursion. Schedule its individual package legs instead.');
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
 let goproId=String(x.goproId||'').slice(0,100),goproId2=String(x.goproId2||'').slice(0,100),droneId=String(x.droneId||'').slice(0,100);
 if(snorkeling&&status!=='Closed'){
  const gopro=resources.gopros.find((item:any)=>item.id===goproId);
  if(!gopro||gopro.condition!=='Available')throw Error('Every snorkeling trip requires an available GoPro. Assign a GoPro to the vessel before saving.');
  if(crewIds.length>=3){
   const gopro2=resources.gopros.find((item:any)=>item.id===goproId2);
   if(!gopro2||gopro2.condition!=='Available')throw Error('Trips with 3 or more crew require a second available GoPro.');
   if(goproId2===goproId)throw Error('Choose two different GoPros when 3 or more crew are assigned.');
  }else goproId2='';
 }else if(!snorkeling){goproId='';goproId2='';}
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
 return {date:x.date,time:x.time,endTime,name,capacity,priceCents,vesselId,goproId,goproId2,droneId,crewIds,status,notes,sharedGroup};
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
function crewConflict(schedules:any[],candidate:{date:string;time:string;endTime:string;crewIds:string[];excludeId?:string}){
 const wanted=new Set((candidate.crewIds||[]).map(String).filter(Boolean));
 if(!wanted.size)return null;
 for(const schedule of schedules||[]){
  if(!schedule||schedule.status==='Cancelled'||schedule.id===candidate.excludeId||schedule.date!==candidate.date)continue;
  const assignedStart=String(schedule.time||''),assignedEnd=String(schedule.endTime||inferTripEndTime(schedule.name,assignedStart));
  if(!validTime(assignedStart)||!validTime(assignedEnd)||!timeRangesOverlap(candidate.time,candidate.endTime,assignedStart,assignedEnd))continue;
  const crewId=(schedule.crewIds||[]).map(String).find((id:string)=>wanted.has(id));
  if(crewId)return {crewId,schedule,assignedEnd};
 }
 return null;
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
 try{
  const primary=await readExcursionSchedulesPrimary(date);
  if(primary.length)return primary.map((row:any)=>({...row})).sort((a:any,b:any)=>String(a.time||'').localeCompare(String(b.time||''))||String(a.name||'').localeCompare(String(b.name||'')));
 }catch{}
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
  const loaded=await loadStays(),state=loaded.state;
  const recoveredOrders:any[]=[];
  for(const order of state.orders||[]){
   if(order?.kind!=='excursion'||order.date!==date||order.status==='Cancelled'||order.approvalStatus!=='Pending'||order.unscheduledRequest!==true)continue;
   if(await autoAssignExcursionOrder(state,order))recoveredOrders.push(order);
  }
  if(recoveredOrders.length){
   const saved=await saveStayAccess(state,loaded.revision,'system:excursion-auto-reconcile');
   if(!saved)throw Error('Excursion bookings changed during automatic schedule recovery. Refresh and try again.');
   for(const order of recoveredOrders){
    if(order.source==='External guest website'&&order.email&&order.manageToken)try{
     await sendExternalExcursionUpdatedEmail({
      email:order.email,guest:order.guest,reference:order.packageGroupId||order.id,excursion:order.packageName||order.name,
      date:order.date,time:order.time||'',endTime:order.endTime||'',quantity:Number(order.quantity)||0,
      quotedCents:Number(order.packageTotalCents)||Number(order.quotedCents)||Number(order.cents)||0,
      hotel:order.hotel,manageToken:order.manageToken,eventId:'auto-reconcile-'+order.id+'-'+order.date+'-'+order.scheduleId
     });
    }catch{}
   }
  }
  const orders=Array.isArray(state.orders)?state.orders:[];
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
  const crewClash=crewConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,crewIds:body.crewIds});
  if(crewClash){
   const member=crew.find((item:any)=>item.id===crewClash.crewId);
   throw Error((member?.name||'This crew member')+' is already assigned to '+crewClash.schedule.name+' from '+crewClash.schedule.time+' to '+crewClash.assignedEnd+'. Crew become available again at the trip end time.');
  }
  const conflict=vesselConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(conflict)throw Error('This vessel is already in use for '+conflict.name+' from '+conflict.time+' to '+(conflict.endTime||inferTripEndTime(conflict.name,conflict.time))+'. Choose another vessel or a non-overlapping time.');
  const cameraConflict=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(cameraConflict)throw Error('This GoPro is already assigned to '+cameraConflict.name+' from '+cameraConflict.time+' to '+(cameraConflict.endTime||inferTripEndTime(cameraConflict.name,cameraConflict.time))+'. Choose another GoPro or a non-overlapping time.');
  const cameraConflict2=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId2,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(cameraConflict2)throw Error('The second GoPro is already assigned to '+cameraConflict2.name+' from '+cameraConflict2.time+' to '+(cameraConflict2.endTime||inferTripEndTime(cameraConflict2.name,cameraConflict2.time))+'. Choose another GoPro or a non-overlapping time.');
  const droneClash=droneConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,droneId:body.droneId,vesselId:body.vesselId,sharedGroup:body.sharedGroup});
  if(droneClash)throw Error('This drone is already assigned to '+droneClash.name+' from '+droneClash.time+' to '+(droneClash.endTime||inferTripEndTime(droneClash.name,droneClash.time))+'. Choose another drone or a non-overlapping time.');
  const guideIds=cleanGuideSelection(input.guideIds,body.crewIds,crew);
  const id=crypto.randomUUID();
  const record={id,...body,guideIds,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(record.status!=='Closed')assertGuideRule(guideRuleFor(record,daySchedules,state.orders||[],crew));
  const key=prefix+body.date+':'+id;
  let revision=0;
  try{revision=await saveOperationalRecordPrimary(key,record,0,user.userId);}catch{}
  if(!revision){
   const result=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(record),user.userId).run();
   if(!result.meta.changes)throw Error('Could not create schedule.');
   revision=1;
   try{await mirrorExcursionScheduleRecord(key,{...record,revision,updatedBy:user.userId});}catch{}
  }else{
   try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(record),revision,user.userId).run();}catch{}
  }
  return Response.json({schedule:{...record,revision}},{status:201});
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
  const {state,revision:stayRevision}=await loadStays();
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
  const crewClash=crewConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,crewIds:body.crewIds,excludeId:id});
  if(crewClash){
   const member=crew.find((item:any)=>item.id===crewClash.crewId);
   throw Error((member?.name||'This crew member')+' is already assigned to '+crewClash.schedule.name+' from '+crewClash.schedule.time+' to '+crewClash.assignedEnd+'. Crew become available again at the trip end time.');
  }
  const conflict=vesselConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(conflict)throw Error('This vessel is already in use for '+conflict.name+' from '+conflict.time+' to '+(conflict.endTime||inferTripEndTime(conflict.name,conflict.time))+'. A vessel becomes available only after its trip end time.');
  const cameraConflict=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(cameraConflict)throw Error('This GoPro is already assigned to '+cameraConflict.name+' from '+cameraConflict.time+' to '+(cameraConflict.endTime||inferTripEndTime(cameraConflict.name,cameraConflict.time))+'. Choose another GoPro or wait until that trip ends.');
  const cameraConflict2=goproConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,goproId:body.goproId2,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(cameraConflict2)throw Error('The second GoPro is already assigned to '+cameraConflict2.name+' from '+cameraConflict2.time+' to '+(cameraConflict2.endTime||inferTripEndTime(cameraConflict2.name,cameraConflict2.time))+'. Choose another GoPro or wait until that trip ends.');
  const droneClash=droneConflict(daySchedules,{date:body.date,time:body.time,endTime:body.endTime,droneId:body.droneId,vesselId:body.vesselId,excludeId:id,sharedGroup:body.sharedGroup});
  if(droneClash)throw Error('This drone is already assigned to '+droneClash.name+' from '+droneClash.time+' to '+(droneClash.endTime||inferTripEndTime(droneClash.name,droneClash.time))+'. Choose another drone or wait until that trip ends.');
  // Closing an unsafe/understaffed trip must remain possible; departure is guarded separately.
  if(record.status!=='Closed')assertGuideRule(guideRuleFor(record,daySchedules,state.orders||[],crew,old));
  const departureChanged=String(old.date||'')!==String(record.date||'')||String(old.time||'')!==String(record.time||'');
  const timeChangeNotices:any[]=[];
  if(departureChanged){
   const resources=excursionResources(state);
   state.guestNotifications??=[];
   const affected=(state.orders||[]).filter((order:any)=>order.kind==='excursion'&&order.status!=='Cancelled'&&order.approvalStatus!=='Cancelled'&&(String(order.scheduleId||'')===id||matches(order,old)));
   const changedAt=new Date().toISOString();
   for(const order of affected){
    const moved=applyExcursionScheduleTimeChange(order,record,user.username,resources,changedAt),before=moved.before,after=moved.after;
    const message=excursionTimeChangeMessage(order,before,after);
    if(order.accountId)addGuestNotification(state,{accountId:String(order.accountId),type:'excursion-time-change',title:'Excursion time changed',message,url:'/stay?service=excursion',bookingId:String(order.packageGroupId||order.id||''),metadata:{from:before,to:after,scheduleId:id}});
    timeChangeNotices.push({order,before,after});
   }
  }

  let nextRevision=0;
  if(departureChanged&&timeChangeNotices.length){
   let pair:any=null,primaryAvailable=true,primaryConflict=false;
   try{pair=await saveOperationalPairPrimary(key,record,revision,stayKey,state,stayRevision,user.userId);}catch(error){
    const message=error instanceof Error?error.message:String(error||'');
    if(message.includes('CAS_CONFLICT'))primaryConflict=true;else primaryAvailable=false;
   }
   if(primaryConflict)return Response.json({error:'The excursion or assigned guest bookings changed elsewhere. Reload and try again.'},{status:409});
   if(primaryAvailable&&pair?.revisionA&&pair?.revisionB){
    nextRevision=pair.revisionA;
    try{
     await authDb().batch([
      authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(record),pair.revisionA,user.userId),
      authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(stayKey,JSON.stringify(state),pair.revisionB,user.userId)
     ]);
    }catch{}
    try{await Promise.all([mirrorExcursionScheduleRecord(key,{...record,revision:pair.revisionA,updatedBy:user.userId}),mirrorHotelState(state)]);}catch{}
   }else{
    const statements:any[]=[
     authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(record),user.userId,key,revision)
    ];
    const stayPayload=JSON.stringify(state);
    if(stayRevision===0)statements.push(authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,stayPayload,user.userId));
    else statements.push(authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(stayPayload,user.userId,stayKey,stayRevision));
    const results=await authDb().batch(statements);
    if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:'The excursion or assigned guest bookings changed elsewhere. Reload and try again.'},{status:409});
    nextRevision=revision+1;
    try{await mirrorExcursionScheduleRecord(key,{...record,revision:nextRevision,updatedBy:user.userId});await mirrorHotelState(state);}catch{}
   }
  }else{
   try{nextRevision=await saveOperationalRecordPrimary(key,record,revision,user.userId);}catch{}
   if(!nextRevision){
    const result=await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(record),user.userId,key,revision).run();
    if(!result.meta.changes)return Response.json({error:'Schedule changed elsewhere. Reload and try again.'},{status:409});
    nextRevision=revision+1;
    try{await mirrorExcursionScheduleRecord(key,{...record,revision:nextRevision,updatedBy:user.userId});}catch{}
   }else{
    try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(record),nextRevision,user.userId).run();}catch{}
   }
  }

  let notified=0;
  if(timeChangeNotices.length){
   const results=await Promise.allSettled(timeChangeNotices.map(async({order,before,after}:any)=>{
    const tasks:Promise<any>[]=[];
    if(order.source==='External guest website'&&order.email&&order.manageToken)tasks.push(sendExternalExcursionUpdatedEmail({
     email:order.email,guest:order.guest,reference:order.packageGroupId||order.id,excursion:order.packageName||order.name,
     date:after.date,time:after.time,endTime:record.endTime||'',quantity:Number(order.quantity)||0,
     quotedCents:Number(order.packageTotalCents)||Number(order.quotedCents)||Number(order.cents)||0,
     hotel:order.hotel,manageToken:order.manageToken,eventId:'schedule-time-'+id+'-'+nextRevision+'-'+order.id
    }));
    if(order.accountId)tasks.push(sendGuestPushForExcursionTimeChange(order,before,after));
    await Promise.allSettled(tasks);
    return true;
   }));
   notified=results.filter(result=>result.status==='fulfilled').length;
  }
  return Response.json({schedule:{...record,revision:nextRevision},timeChange:{changed:departureChanged,affectedBookings:timeChangeNotices.length,notificationsAttempted:notified}});
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
   // The schedule list is Supabase-primary during the migration. A schedule can
   // therefore be visible in the UI even when its D1 mirror is missing or stale.
   // Resolve the exact record from the primary store first, then fall back to D1.
   let primaryRow:any=null;
   try{primaryRow=await readOperationalRecordPrimary(key);}catch{}
   const d1Row=await db.prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();
   const row=primaryRow||d1Row;
   if(!row)throw Error('Scheduled excursion not found. Reload the schedule and try again.');
   const schedule=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
   const scheduleRevision=Number(row.revision)||0;
   if(!schedule||schedule.id!==id||schedule.date!==date)throw Error('Scheduled excursion record does not match this trip. Reload and try again.');
   if(schedule.status==='Cancelled')return Response.json({ok:true,alreadyCancelled:true,reason:schedule.cancellationReason||''});
   const {state,revision}=await loadStays();
   const now=new Date().toISOString();
   const affected=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&o.status!=='Cancelled'&&o.approvalStatus!=='Cancelled'&&matches(o,schedule));
   let rescheduledPackageSegments=0,cancelledBookings=0;
   for(const order of affected){
    if(order.specialPackage===true&&order.packageGroupId){
     order.previousPackageSchedule={id:schedule.id,date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',name:schedule.name};
     order.status='Awaiting scheduling';order.approvalStatus='Pending';order.cents=0;order.unscheduledRequest=true;order.seatRequest=false;order.autoConfirmed=false;order.scheduleCancelled=true;order.rescheduleReason=reason;order.guestNotified=false;
     delete order.scheduleId;delete order.schedule;delete order.time;delete order.endTime;delete order.returnTime;
     rescheduledPackageSegments++;
    }else{
     order.status='Cancelled';
     order.approvalStatus='Cancelled';
     order.cents=0;
     order.cancelledAt=now;
     order.cancelledBy=user.username;
     order.cancellationReason=reason;
     order.scheduleCancelled=true;
     order.guestNotified=false;
     cancelledBookings++;
    }
   }
   const cancelledSchedule={...schedule,status:'Cancelled',cancellationReason:reason,cancelledAt:now,cancelledBy:user.username,updatedAt:now};
   let pair:any=null,primaryAvailable=true,primaryConflict=false;
   try{
    pair=await saveOperationalPairPrimary(key,cancelledSchedule,scheduleRevision,stayKey,state,revision,user.userId);
   }catch(error){
    const message=error instanceof Error?error.message:String(error||'');
    if(message.includes('CAS_CONFLICT'))primaryConflict=true;else primaryAvailable=false;
   }
   if(primaryConflict)return Response.json({error:'The excursion changed elsewhere. Reload and try again.'},{status:409});
   if(primaryAvailable&&pair?.revisionA&&pair?.revisionB){
    try{
     await db.batch([
      db.prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(cancelledSchedule),pair.revisionA,user.userId),
      db.prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(stayKey,JSON.stringify(state),pair.revisionB,user.userId)
     ]);
    }catch{}
    try{await Promise.all([mirrorExcursionScheduleRecord(key,{...cancelledSchedule,revision:pair.revisionA,updatedBy:user.userId}),mirrorHotelState(state)]);}catch{}
    return Response.json({ok:true,cancelledBookings,rescheduledPackageSegments,reason,status:'Cancelled'});
   }
   if(!d1Row)return Response.json({error:'The excursion could not be saved to the primary database. Reload and try again.'},{status:503});
   const stayPayload=JSON.stringify(state);
   const statements:any[]=[
    db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(cancelledSchedule),user.userId,key,Number(d1Row.revision))
   ];
   if(revision===0)statements.push(db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,stayPayload,user.userId));
   else statements.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(stayPayload,user.userId,stayKey,revision));
   const results=await db.batch(statements);
   if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:'The excursion changed elsewhere. Reload and try again.'},{status:409});
   try{await mirrorExcursionScheduleRecord(key,{...cancelledSchedule,revision:Number(d1Row.revision)+1,updatedBy:user.userId});await mirrorHotelState(state);}catch{}
   return Response.json({ok:true,cancelledBookings,rescheduledPackageSegments,reason,status:'Cancelled'});
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
   if(order.source==='External guest website'&&order.email&&order.manageToken)try{await sendExternalExcursionUpdatedEmail({email:order.email,guest:order.guest,reference:order.id,excursion:order.name,date:order.date,time:order.time,quantity:Number(order.quantity)||0,quotedCents:Number(order.quotedCents)||0,hotel:order.hotel,manageToken:order.manageToken,eventId:'schedule-'+now});}catch{}
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
   if(order.source==='External guest website'&&order.email&&order.manageToken)try{await sendExternalExcursionUpdatedEmail({email:order.email,guest:order.guest,reference:order.packageGroupId||order.id,excursion:order.packageName||order.name,date:order.date,time:order.time,endTime:order.endTime,quantity:Number(order.quantity)||0,quotedCents:Number(order.packageTotalCents)||Number(order.quotedCents)||0,hotel:order.hotel,manageToken:order.manageToken,eventId:'schedule-'+scheduleId});}catch{}
   return Response.json({ok:true,booking:{id:order.id,status:'Confirmed'},schedule:{...record,revision:1}},{status:201});
  }

  if(b.action==='reject-unscheduled-request'){
   const requestId=String(b.requestId||'').slice(0,100);
   if(!requestId)throw Error('Choose a valid excursion request.');
   const {state,revision}=await loadStays();
   const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled');
   if(!order)throw Error('This scheduling request has already been handled.');

   // Package requests appear as multiple unscheduled excursion legs. Rejecting any
   // one of those rows means rejecting the complete package request so no orphan
   // legs remain in "Trips waiting to be scheduled".
   const packageGroupId=String(order.packageGroupId||'');
   const targets=packageGroupId
    ?(state.orders||[]).filter((item:any)=>
      item.kind==='excursion'&&String(item.packageGroupId||'')===packageGroupId&&
      item.unscheduledRequest===true&&item.approvalStatus==='Pending'&&item.status!=='Cancelled'
     )
    :[order];

   if(!targets.length)throw Error('This scheduling request has already been handled.');
   const now=new Date().toISOString();
   const rejectedSnapshots=targets.map((target:any)=>({
    ...target,
    approvalStatus:'Declined',
    status:'Cancelled',
    unscheduledRequest:false,
    seatRequest:false,
    requestedOverCapacity:false,
    cents:0,
    rejectedAt:now,
    rejectedBy:user.username,
    guestNotified:false
   }));

   // Keep an audit trail, but remove rejected waiting requests from the active
   // excursion order list completely so they can never be projected back into
   // "Trips waiting to be scheduled" after refresh.
   state.rejectedExcursionRequests=Array.isArray(state.rejectedExcursionRequests)?state.rejectedExcursionRequests:[];
   state.rejectedExcursionRequests.push(...rejectedSnapshots);
   const rejectedIdSet=new Set(rejectedSnapshots.map((item:any)=>String(item.id)));
   state.orders=(state.orders||[]).filter((item:any)=>!rejectedIdSet.has(String(item.id)));

   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another update was saved at the same time. Reload and try again.'},{status:409});

   // One decline email is enough for a package; do not send one email per leg.
   const emailOrder=targets[0];
   if(emailOrder.source==='External guest website'&&emailOrder.email&&emailOrder.manageToken)try{
    await sendExternalExcursionDeclinedEmail({
     email:emailOrder.email,
     guest:emailOrder.guest,
     reference:packageGroupId||emailOrder.id,
     excursion:packageGroupId?(emailOrder.packageName||'Excursion package'):emailOrder.name,
     date:emailOrder.date,
     time:emailOrder.time||'',
     quantity:Number(emailOrder.quantity)||0,
     quotedCents:packageGroupId?Math.max(0,Number(emailOrder.packageTotalCents)||0):Math.max(0,Number(emailOrder.quotedCents)||0),
     hotel:emailOrder.hotel,
     manageToken:emailOrder.manageToken,
     eventId:'decline-'+now
    });
   }catch{}

   const rejectedIds=targets.map((item:any)=>String(item.id));
   return Response.json({
    ok:true,
    requestId,
    rejectedIds,
    packageGroupId:packageGroupId||null,
    rejectedCount:rejectedIds.length,
    status:'Rejected'
   });
  }

  if(b.action==='admin-booking-auto'){
   const date=String(b.date||''),menuItemId=String(b.menuItemId||'').slice(0,100),guestType=String(b.guestType||''),mix=excursionGuestMix(b,Number(b.quantity)||1,100),quantity=mix.total,notes=String(b.notes||'').trim().slice(0,1000),groupName=String(b.groupName||'').trim().replace(/\s+/g,' ').slice(0,100);
   const privateBoatRequested=quantity>=4&&b.privateBoatRequested===true;
   if(!validDate(date)||!menuItemId||!['inhouse','walkin'].includes(guestType))throw Error('Check the excursion, date, guest type and number of guests.');
   const {state,revision}=await loadStays();
   await ensureStandardDailyExcursions(date);
   const menu=await loadExcursionMenu(),item=menu.find((x:any)=>x.id===menuItemId&&x.kind==='excursion'&&x.active!==false);
   if(!item)throw Error('This excursion is no longer available.');
   const allSchedules=(await schedulesForDate(date)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
   const candidates=allSchedules
    .filter((schedule:any)=>scheduleCanServeRequest(item.scheduleName||item.name,schedule.name))
    .map((schedule:any)=>{
      const key=sharedKey(schedule),groupSchedules=key?allSchedules.filter((x:any)=>sharedKey(x)===key):[schedule],groupIds=new Set(groupSchedules.map((x:any)=>x.id));
      const capacity=Math.min(...groupSchedules.map((x:any)=>Math.max(1,Number(x.capacity)||1)));
      const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&isConfirmed(o)&&(groupIds.has(o.scheduleId)||groupSchedules.some((x:any)=>matches(o,x)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
      return {schedule,capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax),rank:scheduleMatchRank(item.scheduleName||item.name,schedule.name)};
    })
    .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||String(a.schedule.time).localeCompare(String(b.schedule.time))||a.rank-b.rank||b.remaining-a.remaining);
   const preferred=candidates.find((candidate:any)=>candidate.remaining>=quantity)?.schedule;
   const chosen=b.forceUnscheduled===true||privateBoatRequested?undefined:candidates.find((candidate:any)=>candidate.remaining>=quantity);
   let stay:any=null,guest='',phone='',email='',hotel='',room='',accountId:any=undefined,stayId:any=undefined;
   if(guestType==='inhouse'){
    stay=(state.stays||[]).find((x:any)=>x.id===String(b.stayId||'')&&x.status==='In House');
    if(!stay)throw Error('Choose a valid in-house guest.');
    guest=stay.guest;phone=stay.whatsapp||'';hotel='Nirili Villa';room=stay.room;accountId=stay.accountId;stayId=stay.id;
   }else{
    guest=String(b.guest||'').trim().slice(0,100);phone=String(b.phone||'').replace(/[ ()-]/g,'');email=String(b.email||'').trim().toLowerCase().slice(0,200);hotel=String(b.hotel||'').trim().slice(0,150)||'Walk-in guest';room=String(b.externalRoom||'').trim().slice(0,50);
    if(!guest||!/^\+[1-9]\d{7,14}$/.test(phone)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('Enter the walk-in guest name, phone number with country code and a valid email address.');
   }
   const details=cleanAdminGuestDetails(b,quantity,guest,item.name,mix);
   const unitPriceCents=Math.max(0,Number(item.cents)||0),pricingUnit=item.pricingUnit==='couple'?'couple':'guest';
   const baseQuotedCents=excursionPriceCents(unitPriceCents,pricingUnit,mix),privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0,quotedCents=baseQuotedCents+privateBoatSurchargeCents,id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
   const guestData={groupName,guestNames:details.guestNames,guestCategories:details.guestCategories,excursionGuestRoster:makeAdminGuestRoster(id,details.guestNames,details.guestCategories),footSizes:details.footSizes};
   state.orders??=[];
   if(item.id==='special-package'){
    let packagePlan:any[]|null=null;
    if(b.forceUnscheduled!==true&&!privateBoatRequested){
     const packageCandidates:any[]=[];
     for(let offset=0;offset<7;offset++){
      const candidateDate=shiftDate(date,offset);
      await ensureStandardDailyExcursions(candidateDate);
      const daySchedules=(await schedulesForDate(candidateDate)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
      for(const schedule of daySchedules){
       if(norm(schedule.name)==='special package')continue;
       const coverage=specialPackageCoverage(schedule.name);
       if(!coverage.length)continue;
       const key=sharedKey(schedule),groupSchedules=key?daySchedules.filter((x:any)=>sharedKey(x)===key):[schedule],groupIds=new Set(groupSchedules.map((x:any)=>x.id));
       const capacity=Math.min(...groupSchedules.map((x:any)=>Math.max(1,Number(x.capacity)||1)));
       const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&isConfirmed(o)&&(groupIds.has(o.scheduleId)||groupSchedules.some((x:any)=>matches(o,x)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
       const remaining=Math.max(0,capacity-confirmedPax);
       if(remaining<quantity)continue;
       packageCandidates.push({...schedule,date:candidateDate,coverage,remaining});
      }
     }
     packagePlan=planSpecialPackageSchedules(packageCandidates,quantity);
    }
    const resources=excursionResources(state);
    const packageBase={
     kind:'excursion',menuItemId:item.id,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,...guestData,
     pricingUnit,privateBoatRequested,privateBoatSurchargeCents,guest,phone,email:guestType==='walkin'?email:undefined,hotel,room,externalRoom:guestType==='walkin'?room:undefined,
     stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,notes,adminCreated:true,
     source:guestType==='inhouse'?(privateBoatRequested?'Admin · In-house private boat':'Admin · In-house package'):(privateBoatRequested?'Admin · Walk-in private boat':'Admin · Walk-in package'),
     createdBy:user.username,createdAt
    };
    const built=buildSpecialPackageOrders({base:packageBase,totalCents:quotedCents,plan:packagePlan,resources,sourceDate:date,pendingPrivateBoat:privateBoatRequested});
    state.orders.push(...built.orders);
    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
    const allConfirmed=built.orders.every((order:any)=>order.approvalStatus==='Approved');
    if(guestType==='walkin'&&email)try{await sendExternalExcursionBookedEmail({email,guest,reference:built.packageGroupId,excursion:item.name,date,quantity,quotedCents,hotel,status:allConfirmed?'Confirmed':'Pending',packageSegments:built.orders.map((order:any)=>({name:order.packageSegmentName||order.name,date:order.date,time:order.time||'',endTime:order.endTime||'',matchedScheduleName:order.matchedScheduleName||''}))});}catch{}
    return Response.json({booking:{
     id:built.packageGroupId,packageGroupId:built.packageGroupId,status:allConfirmed?'Confirmed':'Pending',requiresScheduling:!allConfirmed,
     privateBoatRequested,privateBoatSurchargeCents,quotedCents,
     packageSegments:built.orders.map((order:any)=>({id:order.id,name:order.packageSegmentName,date:order.date,time:order.time||'',status:order.approvalStatus==='Approved'?'Confirmed':'Pending',scheduleId:order.scheduleId||''}))
    }},{status:201});
   }
   if(chosen){
    const schedule=chosen.schedule,resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
    state.orders.push({id,kind:'excursion',menuItemId:item.id,name:item.name,scheduleName:item.scheduleName||item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,...guestData,cents:quotedCents,quotedCents,baseQuotedCents,unitPriceCents,pricingUnit,privateBoatRequested:false,privateBoatSurchargeCents:0,guest,phone,email:guestType==='walkin'?email:undefined,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),notes,status:'Scheduled',approvalStatus:'Approved',seatRequest:false,unscheduledRequest:false,autoConfirmed:true,adminCreated:true,matchedFromMenu:true,matchedScheduleName:schedule.name,scheduleId:schedule.id,source:guestType==='inhouse'?'Admin · In-house':'Admin · Walk-in',schedule:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId||'',vessel:vessel?.name||'',...(schedule.goproId?{goproId:schedule.goproId,gopro:resources.gopros.find((g:any)=>g.id===schedule.goproId)?.name||schedule.goproId}:{}),...(schedule.droneId?{droneId:schedule.droneId,drone:resources.drones.find((d:any)=>d.id===schedule.droneId)?.name||schedule.droneId}:{}),crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name)},guestNotified:false,createdBy:user.username,createdAt});
   }else{
    const fallback=suggestedTripWindow(item.scheduleName||item.name),preferredTime=preferred?.time||fallback.time,preferredEndTime=preferred?.endTime||fallback.endTime;
    state.orders.push({id,kind:'excursion',menuItemId:item.id,name:item.name,scheduleName:item.scheduleName||item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,...guestData,cents:0,quotedCents,baseQuotedCents,unitPriceCents,pricingUnit,privateBoatRequested,privateBoatSurchargeCents,guest,phone,email:guestType==='walkin'?email:undefined,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date,time:'',preferredTime,preferredEndTime,preferredScheduleId:preferred?.id||'',notes,status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:false,unscheduledRequest:true,autoConfirmed:false,adminCreated:true,requestedSchedule:true,guestNotified:false,source:guestType==='inhouse'?(privateBoatRequested?'Admin · In-house private boat':'Admin · In-house request'):(privateBoatRequested?'Admin · Walk-in private boat':'Admin · Walk-in request'),createdBy:user.username,createdAt});
   }
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   const fallback=suggestedTripWindow(item.scheduleName||item.name);
   if(guestType==='walkin'&&email)try{await sendExternalExcursionBookedEmail({email,guest,reference:id,excursion:item.name,date,time:chosen?.schedule.time||'',endTime:chosen?.schedule.endTime||'',quantity,quotedCents,hotel,status:chosen?'Confirmed':'Pending'});}catch{}
   return Response.json({booking:{id,status:chosen?'Confirmed':'Pending',requiresScheduling:!chosen,matchedScheduleId:chosen?.schedule.id||'',matchedScheduleName:chosen?.schedule.name||'',time:chosen?.schedule.time||'',suggestedTime:chosen?'':(preferred?.time||fallback.time),privateBoatRequested,privateBoatSurchargeCents}},{status:201});
  }

  if(b.action==='admin-booking'){
   const date=String(b.date||''),scheduleId=String(b.scheduleId||'').slice(0,100),guestType=String(b.guestType||''),mix=excursionGuestMix(b,Number(b.quantity)||1,100),quantity=mix.total,notes=String(b.notes||'').trim().slice(0,1000),requestedVesselId=String(b.vesselId||'').slice(0,100),groupName=String(b.groupName||'').trim().replace(/\s+/g,' ').slice(0,100);
   const privateBoatRequested=quantity>=4&&b.privateBoatRequested===true;
   if(!validDate(date)||!scheduleId||!['inhouse','walkin'].includes(guestType))throw Error('Check the excursion, guest type and number of guests.');
   const {state,revision}=await loadStays();
   // The booking screen is populated by schedulesForDate(), which may read the
   // primary Supabase schedule mirror before falling back to D1. Confirming a
   // booking must resolve the selected schedule through the exact same reader.
   // Reading D1 directly here caused visible trips to fail with
   // "This scheduled excursion no longer exists" whenever the primary copy had
   // already synced but the D1 fallback row was missing/stale.
   const sameDay=(await schedulesForDate(date)).filter((s:any)=>s.status!=='Cancelled');
   const schedule=sameDay.find((s:any)=>String(s.id||'')===scheduleId);
   if(!schedule)throw Error('This scheduled excursion is no longer available. Refresh the trip list and choose it again.');
   if(norm(schedule.name)==='special package')throw Error('Special Package cannot be booked as one scheduled trip. Use the Special Package booking option so its excursion legs are created separately.');
   if(schedule.status!=='Open')throw Error('This excursion is closed for bookings.');
   if(excursionDeparturePassed(schedule.date,schedule.time))throw Error('This excursion departure time has already passed. A booking cannot be created for it.');
   const resources=excursionResources(state);
   const key=sharedKey(schedule),groupSchedules=key?sameDay.filter((s:any)=>sharedKey(s)===key):[schedule];
   const capacity=Math.min(...groupSchedules.map((s:any)=>Math.max(1,Number(s.capacity)||1)));
   // Use the exact same manifest calculation used by the schedule screen.
   // This prevents the booking API from counting stale/legacy orders that the
   // visible trip capacity does not count. If the screen says 3/6, confirming
   // two more guests must evaluate as 5/6, not "at capacity".
   const confirmedPax=groupSchedules.reduce((total:number,groupSchedule:any)=>{
    const manifest=buildExcursionManifest(groupSchedule,sameDay,state,resources,()=>false);
    return total+Math.max(0,Number(manifest.totals.mainVesselPax)||0);
   },0);
   const needsExtraVessel=!privateBoatRequested&&confirmedPax+quantity>capacity;
   let vessel:any=null;
   if(needsExtraVessel){
    if(!requestedVesselId)throw Error('This departure is at capacity. Assign a new vessel for this booking.');
    vessel=resources.vessels.find((v:any)=>v.id===requestedVesselId);
    if(!vessel||vessel.condition!=='Available')throw Error('Choose an available vessel.');
    const vesselCapacity=Number(vessel.capacity);
    if(Number.isSafeInteger(vesselCapacity)&&vesselCapacity<quantity)throw Error(vessel.name+' only has '+vesselCapacity+' passenger seats. Choose a vessel that can carry all '+quantity+' guests.');
    const originalVesselIds=new Set(groupSchedules.map((s:any)=>String(s.vesselId||'')).filter(Boolean));
    if(originalVesselIds.has(vessel.id))throw Error('Choose a different vessel from the vessel already assigned to this departure.');
    const endTime=schedule.endTime||inferTripEndTime(schedule.name,schedule.time);
    const scheduledConflict=vesselConflict(sameDay,{date:schedule.date,time:schedule.time,endTime,vesselId:vessel.id});
    if(scheduledConflict)throw Error(vessel.name+' is already in use for '+scheduledConflict.name+' from '+scheduledConflict.time+' to '+(scheduledConflict.endTime||inferTripEndTime(scheduledConflict.name,scheduledConflict.time))+'.');
    const bookingConflict=separateVesselConflict(state.orders||[],vessel.id,schedule.date,schedule.time,endTime);
    if(bookingConflict)throw Error(vessel.name+' is already assigned to another private/extra-vessel booking during this time.');
   }else vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId);
   let stay:any=null,guest='',phone='',email='',hotel='',room='',accountId:any=undefined,stayId:any=undefined;
   if(guestType==='inhouse'){
    stay=(state.stays||[]).find((s:any)=>s.id===String(b.stayId||'')&&s.status==='In House');
    if(!stay)throw Error('Choose a valid in-house guest.');
    guest=stay.guest;phone=stay.whatsapp||'';hotel='Nirili Villa';room=stay.room;accountId=stay.accountId;stayId=stay.id;
   }else{
    guest=String(b.guest||'').trim().slice(0,100);phone=String(b.phone||'').replace(/[ ()-]/g,'');email=String(b.email||'').trim().toLowerCase().slice(0,200);hotel=String(b.hotel||'').trim().slice(0,150)||'Walk-in guest';room=String(b.externalRoom||'').trim().slice(0,50);
    if(!guest||!/^\+[1-9]\d{7,14}$/.test(phone)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('Enter the walk-in guest name, phone number with country code and a valid email address.');
   }
   const details=cleanAdminGuestDetails(b,quantity,guest,schedule.name,mix);
   const crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id)),unitPriceCents=Math.max(0,Number(schedule.priceCents)||0),baseQuotedCents=excursionPriceCents(unitPriceCents,'guest',mix),privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0,cents=baseQuotedCents+privateBoatSurchargeCents,id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
   const guestData={groupName,guestNames:details.guestNames,guestCategories:details.guestCategories,excursionGuestRoster:makeAdminGuestRoster(id,details.guestNames,details.guestCategories),footSizes:details.footSizes};
   state.orders??=[];
   if(privateBoatRequested){
    state.orders.push({id,kind:'excursion',scheduleId:undefined,name:schedule.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,...guestData,cents:0,quotedCents:cents,baseQuotedCents,unitPriceCents,privateBoatRequested:true,privateBoatSurchargeCents,guest,phone,email:guestType==='walkin'?email:undefined,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date:schedule.date,time:'',preferredTime:schedule.time,preferredEndTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),preferredScheduleId:schedule.id,matchedScheduleName:schedule.name,notes,status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:false,unscheduledRequest:true,autoConfirmed:false,adminCreated:true,requestedSchedule:true,guestNotified:false,source:guestType==='inhouse'?'Admin · In-house private boat':'Admin · Walk-in private boat',createdBy:user.username,createdAt});
   }else{
    state.orders.push({id,kind:'excursion',scheduleId:schedule.id,name:schedule.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,...guestData,cents,quotedCents:cents,baseQuotedCents,unitPriceCents,privateBoatRequested:false,privateBoatSurchargeCents:0,guest,phone,email:guestType==='walkin'?email:undefined,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse'||b.buggyRequested===true,date:schedule.date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),returnTime:schedule.returnTime||'',notes,status:'Scheduled',approvalStatus:'Approved',seatRequest:false,autoConfirmed:true,adminCreated:true,separateVessel:needsExtraVessel,overflowVesselId:needsExtraVessel?vessel?.id:undefined,source:guestType==='inhouse'?'Admin · In-house':'Admin · Walk-in',schedule:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||inferTripEndTime(schedule.name,schedule.time),...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:vessel?.id||schedule.vesselId||'',vessel:vessel?.name||'',...(schedule.goproId&&!needsExtraVessel?{goproId:schedule.goproId,gopro:resources.gopros.find((g:any)=>g.id===schedule.goproId)?.name||schedule.goproId}:{}),...(schedule.droneId&&!needsExtraVessel?{droneId:schedule.droneId,drone:resources.drones.find((d:any)=>d.id===schedule.droneId)?.name||schedule.droneId}:{}),crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name),extraVessel:needsExtraVessel},guestNotified:false,createdBy:user.username,createdAt});
   }
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   const savedBooking=state.orders.find((order:any)=>order.id===id);
   if(guestType==='walkin'&&email)try{await sendExternalExcursionBookedEmail({email,guest,reference:id,excursion:schedule.name,date:schedule.date,time:privateBoatRequested?'':schedule.time,endTime:privateBoatRequested?'':(schedule.endTime||inferTripEndTime(schedule.name,schedule.time)),quantity,quotedCents:cents,hotel,status:privateBoatRequested?'Pending':'Confirmed'});}catch{}
   return Response.json({booking:{id,guest,guestType,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents:privateBoatRequested?0:cents,quotedCents:cents,status:privateBoatRequested?'Pending':'Confirmed',requiresScheduling:privateBoatRequested,scheduleId:savedBooking.scheduleId||'',extraVesselTrip:!!savedBooking.extraVesselTrip,separateVessel:!!savedBooking.separateVessel,vessel:savedBooking.schedule?.vessel||vessel?.name||'',privateBoatRequested,privateBoatSurchargeCents}},{status:201});
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
