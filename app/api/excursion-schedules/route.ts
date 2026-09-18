import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {ensureStandardDailyExcursions} from '../../../lib/excursion-default-schedule';
import {excursionResources} from '../../../lib/excursion-workflow';
import {assertGuideRule,assignedGuideCount,cleanGuideSelection,guideRuleFor,requiredExcursionGuides} from '../../../lib/excursion-guides';

const prefix='excursion-schedule:';
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
const validTime=(v:any)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const clean=async (x:any,state:any)=>{
 if(!x||!validDate(x.date)||!validTime(x.time))throw Error('Choose a valid date and departure time.');
 const name=String(x.name||'').trim().slice(0,180);
 if(!name)throw Error('Excursion name is required.');
 let capacity=Math.max(1,Math.min(100,Number(x.capacity)||1));
 const priceCents=Math.max(0,Math.min(1000000,Math.round(Number(x.priceCents)||0)));
 const vesselId=String(x.vesselId||'').slice(0,100);
 const crewIds=Array.isArray(x.crewIds)?[...new Set(x.crewIds.map((id:any)=>String(id).slice(0,100)).filter(Boolean))].slice(0,20):[];
 const status=x.status==='Closed'?'Closed':'Open';
 const notes=String(x.notes||'').trim().slice(0,1000);
 const sharedGroup=String(x.sharedGroup||'').trim().slice(0,80);
 // Read the saved vessel, not a capacity supplied by the browser. This runs
 // for both Create/Edit and each row in the shared-departure assignment flow.
 // Only raise the scheduled limit; do not change bookings or the vessel record.
 if(vesselId){
  const vessel=excursionResources(state).vessels.find((v:any)=>v.id===vesselId);
  const vesselCapacity=Number(vessel?.capacity);
  if(Number.isSafeInteger(vesselCapacity)&&vesselCapacity>capacity)capacity=vesselCapacity;
 }
 return {date:x.date,time:x.time,name,capacity,priceCents,vesselId,crewIds,status,notes,sharedGroup};
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

async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>({...JSON.parse(row.payload),revision:row.revision})).sort((a:any,b:any)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest')return Response.json({error:'Staff login required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||'';
 if(!validDate(date))return Response.json({error:'Valid schedule date required.'},{status:400});
 try{
  await ensureStandardDailyExcursions(date);
  const raw=await schedulesForDate(date);
  const {state}=await loadStays(),orders=Array.isArray(state.orders)?state.orders:[];
  const schedules=raw.map((s:any)=>{
   const bookedPax=orders.filter((o:any)=>matches(o,s)&&isConfirmed(o)&&!o.separateVessel).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const pendingOrders=orders.filter((o:any)=>matches(o,s)&&isPending(o));
   const pendingPax=pendingOrders.reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const extraVesselBookings=orders.filter((o:any)=>matches(o,s)&&isConfirmed(o)&&o.separateVessel).map((o:any)=>({id:o.id,guest:o.guest,room:o.room||o.externalRoom||'',quantity:o.quantity,vesselId:o.overflowVesselId||o.schedule?.vesselId||'',vessel:o.schedule?.vessel||'',createdAt:o.reviewedAt||o.createdAt}));
   return {...s,priceCents:Number(s.priceCents)||0,bookedPax,pendingPax,sharedBoatKey:sharedKey(s),pendingOrders,extraVesselBookings};
  });
  const groups:Record<string,{scheduleIds:string[],bookedPax:number,pendingPax:number,capacity:number}>={};
  for(const s of schedules){
   if(!s.sharedBoatKey)continue;
   const g=groups[s.sharedBoatKey]||(groups[s.sharedBoatKey]={scheduleIds:[],bookedPax:0,pendingPax:0,capacity:s.capacity});
   g.scheduleIds.push(s.id);g.bookedPax+=s.bookedPax;g.pendingPax+=s.pendingPax;g.capacity=Math.min(g.capacity,s.capacity);
  }
  const enriched=schedules.map((s:any)=>{
   const g=s.sharedBoatKey?groups[s.sharedBoatKey]:null,capacity=g?.capacity??s.capacity;
   const requests=s.pendingOrders.map((o:any)=>({id:o.id,guest:o.guest,room:o.room||o.externalRoom||'',inHouse:!!o.stayId,quantity:o.quantity,name:o.name||s.name,matchedScheduleName:o.matchedScheduleName||s.name,buggyRequested:!!o.buggyRequested,notes:o.notes||'',createdAt:o.createdAt,overCapacity:true}));
   const {pendingOrders,...rest}=s;
   return {...rest,requests,capacity,guideRule:guideRuleFor(s,raw,orders,excursionResources(state).crew)};
  });
  const unscheduledRequests=orders.filter((o:any)=>o.kind==='excursion'&&o.date===date&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled').map((o:any)=>({
   id:o.id,name:o.name,guest:o.guest||'Guest',phone:o.phone||'',hotel:o.hotel||'',room:o.room||o.externalRoom||'',inHouse:!!o.stayId,quantity:Number(o.quantity)||0,date:o.date,
   quotedCents:Math.max(0,Number(o.quotedCents)||0),unitPriceCents:Math.max(0,Number(o.unitPriceCents)||0),pricingUnit:o.pricingUnit||'guest',
   buggyRequested:!!o.buggyRequested,notes:o.notes||'',source:o.source||'',createdAt:o.createdAt||''
  }));
  return Response.json({date,schedules:enriched,sharedBoatGroups:groups,unscheduledRequests,canEdit:hasPermission(user,'edit_excursions')},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load excursion schedules.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const input=await r.json(),{state}=await loadStays();
  const body=await clean(input,state),crew=excursionResources(state).crew;
  const guideIds=cleanGuideSelection(input.guideIds,body.crewIds,crew);
  const id=crypto.randomUUID();
  const record={id,...body,guideIds,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(record.status!=='Closed')assertGuideRule(guideRuleFor(record,await schedulesForDate(body.date),state.orders||[],crew));
  const result=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(prefix+body.date+':'+id,JSON.stringify(record),user.userId).run();
  if(!result.meta.changes)throw Error('Could not create schedule.');
  return Response.json({schedule:{...record,revision:1}},{status:201});
 }catch(e){return Response.json({error:(e as Error).message||'Could not create schedule.'},{status:400});
 }
}

export async function PUT(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
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
  const crew=excursionResources(state).crew;
  // Older clients retain recorded guides, but a removed crew member is no longer a guide.
  const selection=raw.guideIds===undefined?(old.guideIds||[]).filter((guide:string)=>body.crewIds.includes(guide)):raw.guideIds;
  const guideIds=cleanGuideSelection(selection,body.crewIds,crew);
  const record={...old,...body,guideIds,id,updatedAt:new Date().toISOString()};
  // Closing an unsafe/understaffed trip must remain possible; departure is guarded separately.
  if(record.status!=='Closed')assertGuideRule(guideRuleFor(record,await schedulesForDate(body.date),state.orders||[],crew,old));
  const result=await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(record),user.userId,key,revision).run();
  if(!result.meta.changes)return Response.json({error:'Schedule changed elsewhere. Reload and try again.'},{status:409});
  return Response.json({schedule:{...record,revision:revision+1}});
 }catch(e){return Response.json({error:(e as Error).message||'Could not update schedule.'},{status:400});
 }
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const b=await r.json();
  if(b.action==='schedule-request'){
   const requestId=String(b.requestId||'').slice(0,100),time=String(b.time||''),vesselId=String(b.vesselId||'').slice(0,100);
   const capacity=Math.max(1,Math.min(100,Math.round(Number(b.capacity)||1)));
   const crewIds=Array.isArray(b.crewIds)?b.crewIds:[],guideIdsInput=Array.isArray(b.guideIds)?b.guideIds:[];
   if(!requestId||!validTime(time)||!vesselId)throw Error('Choose a departure time and vessel.');
   const {state,revision}=await loadStays();
   const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.unscheduledRequest===true&&o.approvalStatus==='Pending'&&o.status!=='Cancelled');
   if(!order)throw Error('This scheduling request has already been handled.');
   const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===vesselId);
   if(!vessel||vessel.condition!=='Available')throw Error('Choose an available vessel.');
   const priceCents=Math.max(0,Number(order.operationalPriceCents)||Number(order.unitPriceCents)||Math.round((Number(order.quotedCents)||0)/Math.max(1,Number(order.quantity)||1)));
   const body=await clean({date:order.date,time,name:order.name,capacity,priceCents,vesselId,crewIds,status:'Open',notes:'Created from booking request '+order.id,sharedGroup:''},state);
   if(body.capacity<Math.max(1,Number(order.quantity)||1))throw Error('Boat capacity must cover all guests in this booking.');
   const guides=cleanGuideSelection(guideIdsInput,body.crewIds,resources.crew);
   const requiredGuides=requiredExcursionGuides(Math.max(0,Number(order.quantity)||0));
   const assignedGuides=assignedGuideCount(guides,body.crewIds,resources.crew);
   if(assignedGuides<requiredGuides)throw Error('This booking has '+order.quantity+' guests. Assign at least '+requiredGuides+' guides before scheduling.');
   const scheduleId='req-'+crypto.randomUUID(),now=new Date().toISOString();
   const record={id:scheduleId,...body,guideIds:guides,createdFromRequest:order.id,createdAt:now,updatedAt:now};
   const key=prefix+body.date+':'+scheduleId;
   const inserted=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(record),user.userId).run();
   if(!inserted.meta.changes)throw Error('Could not create the requested trip.');
   const crew=resources.crew.filter((c:any)=>body.crewIds.includes(c.id));
   order.scheduleId=scheduleId;order.time=body.time;order.approvalStatus='Approved';order.status='Scheduled';order.cents=Math.max(0,Number(order.quotedCents)||0);
   order.seatRequest=false;order.unscheduledRequest=false;order.autoConfirmed=false;order.adminScheduled=true;order.requestedOverCapacity=false;
   order.reviewedAt=now;order.reviewedBy=user.username;order.guestNotified=false;
   order.schedule={date:body.date,time:body.time,vesselId:body.vesselId,vessel:vessel.name,crewIds:body.crewIds,guideIds:guides,crew:crew.map((c:any)=>c.name)};
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved){
    await authDb().prepare('DELETE FROM operation_records WHERE key=?').bind(key).run();
    return Response.json({error:'Another update was saved at the same time. Reload and try again.'},{status:409});
   }
   return Response.json({ok:true,booking:{id:order.id,status:'Confirmed'},schedule:{...record,revision:1}},{status:201});
  }

  if(b.action==='admin-booking'){
   const date=String(b.date||''),scheduleId=String(b.scheduleId||'').slice(0,100),guestType=String(b.guestType||''),mix=excursionGuestMix(b,Number(b.quantity)||1,100),quantity=mix.total,notes=String(b.notes||'').trim().slice(0,1000),requestedVesselId=String(b.vesselId||'').slice(0,100);
   if(!validDate(date)||!scheduleId||!['inhouse','walkin'].includes(guestType))throw Error('Check the excursion, guest type and number of guests.');
   const {state,revision}=await loadStays();
   const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+date+':'+scheduleId).first<any>();
   if(!row)throw Error('This scheduled excursion no longer exists.');
   const schedule=JSON.parse(row.payload);
   if(schedule.status!=='Open')throw Error('This excursion is closed for bookings.');
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
   state.orders.push({id,kind:'excursion',scheduleId:schedule.id,name:schedule.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents,unitPriceCents,quotedCents:cents,guest,phone,hotel,room,externalRoom:guestType==='walkin'?room:undefined,stayId,accountId,buggyRequested:guestType==='inhouse',date:schedule.date,time:schedule.time,notes,status:'Scheduled',approvalStatus:'Approved',seatRequest:false,autoConfirmed:true,adminCreated:true,separateVessel:needsExtraVessel,overflowVesselId:needsExtraVessel?vessel?.id:undefined,source:guestType==='inhouse'?'Admin · In-house':'Admin · Walk-in',schedule:{date:schedule.date,time:schedule.time,vesselId:vessel?.id||schedule.vesselId||'',vessel:vessel?.name||'',crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name),extraVessel:needsExtraVessel},guestNotified:false,createdBy:user.username,createdAt});
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   return Response.json({booking:{id,guest,guestType,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,cents,separateVessel:needsExtraVessel,vessel:vessel?.name||''}},{status:201});
  }

  const requestId=String(b.requestId||''),decision=String(b.decision||''),vesselId=String(b.vesselId||'').slice(0,100);
  if(!requestId||!['Approved','Declined'].includes(decision))throw Error('Choose Approve or Decline.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.seatRequest===true);
  if(!order||order.approvalStatus!=='Pending')throw Error('This seat request has already been handled.');
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+order.date+':'+order.scheduleId).first<any>();
  if(!row)throw Error('The scheduled excursion no longer exists.');
  const schedule=JSON.parse(row.payload);
  order.approvalStatus=decision;order.reviewedAt=new Date().toISOString();order.reviewedBy=user.username;
  if(decision==='Approved'){
   if(!vesselId)throw Error('Assign a new vessel before approving this over-capacity request.');
   const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===vesselId);
   if(!vessel)throw Error('Choose a valid vessel.');
   if(vessel.condition!=='Available')throw Error('The selected vessel is not available.');
   const sameDay=await schedulesForDate(order.date),key=sharedKey(schedule);
   const originalVesselIds=new Set((key?sameDay.filter((s:any)=>sharedKey(s)===key):[schedule]).map((s:any)=>String(s.vesselId||'')).filter(Boolean));
   if(originalVesselIds.has(vessel.id))throw Error('Choose a different vessel from the vessel already assigned to this departure.');
   const crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
   order.cents=Math.max(0,Number(order.quotedCents)||0);
   order.status='Scheduled';order.separateVessel=true;order.overflowVesselId=vessel.id;order.originalScheduleId=schedule.id;
   order.schedule={date:schedule.date,time:schedule.time,vesselId:vessel.id,vessel:vessel.name,crewIds:schedule.crewIds||[],guideIds:schedule.guideIds||[],crew:crew.map((c:any)=>c.name),extraVessel:true};order.guestNotified=false;
  }else{order.cents=0;order.status='Cancelled';}
  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another update was saved. Reload and try again.'},{status:409});
  return Response.json({ok:true,decision,vesselId:decision==='Approved'?vesselId:undefined});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not review seat request.'},{status:400});
 }
}

export async function DELETE(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const body=await r.json(),id=String(body.id||'').slice(0,100),date=String(body.date||'');
  if(!id||!validDate(date))throw Error('Invalid schedule record.');
  await authDb().prepare('DELETE FROM operation_records WHERE key=?').bind(prefix+date+':'+id).run();
  return Response.json({ok:true});
 }catch(e){return Response.json({error:(e as Error).message||'Could not delete schedule.'},{status:400});
 }
}