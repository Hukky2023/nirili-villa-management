import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {excursionDeparturePassed,islandToday} from '../../../lib/guest-catalog';
import {excursionResources} from '../../../lib/excursion-workflow';
import {inferTripEndTime,timeRangesOverlap} from '../../../lib/excursion-operations';

const requestPrefix='crew-trip-request:';
const schedulePrefix='excursion-schedule:';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

const text=(value:any,max=500)=>String(value||'').trim().slice(0,max);
const normal=(value:any)=>text(value).replace(/\s+/g,' ').toLowerCase();
function linkedCrew(resources:any,user:any){
 const crew=(resources?.crew||[]).filter((member:any)=>!member.removed);
 const direct=crew.find((member:any)=>member.accountId===user.userId||member.id===user.userId);
 if(direct)return direct;
 const username=normal(user.username),displayName=normal(user.displayName);
 const byUsername=username?crew.filter((member:any)=>normal(member.username)===username):[];
 if(byUsername.length===1)return byUsername[0];
 const byName=displayName?crew.filter((member:any)=>normal(member.name)===displayName):[];
 return byName.length===1?byName[0]:null;
}
async function ensureLinkedCrew(savedState:any,user:any){
 const resources=excursionResources(savedState);
 const existing=linkedCrew(resources,user);
 if(existing){
  // Repair older crew records that matched by name/username but never stored the account link.
  if(existing.accountId!==user.userId||existing.username!==user.username){
   existing.accountId=user.userId;existing.username=user.username;existing.active=true;
   savedState.excursionResources=resources;
   const db=authDb(),row=await db.prepare("SELECT revision FROM operation_records WHERE key='hotel-stays-v1'").first<any>();
   if(row)await db.prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key='hotel-stays-v1' AND revision=?").bind(JSON.stringify(savedState),user.userId,Number(row.revision)||1).run();
  }
  return existing;
 }
 // A staff login with Crew Member access must always have a corresponding excursion crew resource.
 const created={id:'crew:'+user.userId,accountId:user.userId,username:user.username,name:text(user.displayName||user.username,100)||user.username,active:true};
 resources.crew.push(created);savedState.excursionResources=resources;
 const db=authDb(),row=await db.prepare("SELECT revision FROM operation_records WHERE key='hotel-stays-v1'").first<any>();
 if(row){
  const result=await db.prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key='hotel-stays-v1' AND revision=?").bind(JSON.stringify(savedState),user.userId,Number(row.revision)||1).run();
  if(!result.meta.changes){
   const fresh=await db.prepare("SELECT payload FROM operation_records WHERE key='hotel-stays-v1'").first<any>();
   if(fresh){const nextState=JSON.parse(fresh.payload||'{}'),next=linkedCrew(excursionResources(nextState),user);if(next)return next;}
   throw Error('Crew profile changed elsewhere. Refresh and try again.');
  }
 }else{
  await db.prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES('hotel-stays-v1',?,1,?)").bind(JSON.stringify(savedState),user.userId).run();
 }
 return created;
}
const validDate=(value:any)=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));

function sharedKey(schedule:any){
 if(schedule.sharedGroup)return schedule.date+'|'+schedule.time+'|group:'+schedule.sharedGroup;
 if(schedule.vesselId)return schedule.date+'|'+schedule.time+'|vessel:'+schedule.vesselId;
 return schedule.date+'|'+schedule.time+'|schedule:'+schedule.id;
}
function orderMatchesSchedule(order:any,schedule:any){
 if(!order||order.kind!=='excursion'||order.status==='Cancelled'||order.approvalStatus==='Declined'||order.approvalStatus==='Cancelled')return false;
 if(order.scheduleId)return order.scheduleId===schedule.id&&(order.date||order.schedule?.date)===schedule.date;
 const saved=order.schedule||{};
 return (saved.date||order.date)===schedule.date&&saved.time===schedule.time&&(!schedule.vesselId||saved.vesselId===schedule.vesselId)&&normal(order.name)===normal(schedule.name);
}
function confirmedOrder(order:any){
 return order&&order.kind==='excursion'&&order.status!=='Cancelled'&&order.approvalStatus!=='Pending'&&order.approvalStatus!=='Declined'&&order.approvalStatus!=='Cancelled';
}
function combinedTripStatus(value:any){
 const status=text(value,80);
 if(status==='Guests boarded'||status==='Departed'||status==='Guests boarded & Departed')return 'Guests boarded & Departed';
 if(status==='Arrived'||status==='Completed'||status==='Arrived & Completed')return 'Arrived & Completed';
 return status||'Excursion scheduled';
}
async function allSchedules(){
 const rows=(await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(schedulePrefix+'%').all<any>()).results||[];
 return rows.map((row:any)=>{try{return {...JSON.parse(row.payload||'{}'),revision:Number(row.revision)||1,_key:row.key}}catch{return null}}).filter(Boolean);
}
async function allRequests(){
 const rows=(await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(requestPrefix+'%').all<any>()).results||[];
 return rows.map((row:any)=>{try{return {...JSON.parse(row.payload||'{}'),revision:Number(row.revision)||1,_key:row.key}}catch{return null}}).filter(Boolean);
}
async function state(){
 const row=await authDb().prepare("SELECT payload FROM operation_records WHERE key='hotel-stays-v1'").first<any>();
 return row?JSON.parse(row.payload||'{}'):{};
}
function requestView(request:any,schedules:any[]){
 const schedule=schedules.find((item:any)=>item.id===request.scheduleId&&item.date===request.date);
 const group=schedule?schedules.filter((item:any)=>item.status!=='Cancelled'&&sharedKey(item)===sharedKey(schedule)):[];
 const assignedCrewIds=[...new Set(group.flatMap((item:any)=>Array.isArray(item.crewIds)?item.crewIds:[]).map(String))];
 return {
  id:request.id,status:request.status,crewId:request.crewId,crewName:request.crewName,crewUsername:request.crewUsername,
  accountId:request.accountId,date:request.date,time:request.time,endTime:schedule?.endTime||'',tripName:request.tripName,
  tripNames:request.tripNames||[request.tripName],scheduleId:request.scheduleId,reason:request.reason,
  assignedCrewIds,createdAt:request.createdAt,reviewedAt:request.reviewedAt||'',reviewedBy:request.reviewedBy||'',
  decisionNote:request.decisionNote||'',replacementCrewId:request.replacementCrewId||'',replacementCrewName:request.replacementCrewName||'',
  stillAssigned:!!schedule?.crewIds?.includes(request.crewId)
 };
}

export async function GET(){
 const user=await currentUser();
 if(!user)return Response.json({error:'Login required.'},{status:401,headers});
 try{
  const schedules=await allSchedules(),requests=await allRequests();
  if(user.role==='admin'||hasPermission(user,'excursions_manager')){
   const visible=requests.filter((request:any)=>request.status==='Pending'||Date.parse(request.createdAt||'')>Date.now()-30*86400000).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   return Response.json({mode:'admin',requests:visible.map((request:any)=>requestView(request,schedules)),pendingCount:visible.filter((request:any)=>request.status==='Pending').length},{headers});
  }
  if(!hasPermission(user,'crew_location'))return Response.json({error:'Crew Member access required.'},{status:403,headers});
  const savedState=await state(),crew=await ensureLinkedCrew(savedState,user),resources=excursionResources(savedState);
  const today=islandToday();
  const assigned=schedules.filter((schedule:any)=>{
   if(schedule.status==='Cancelled'||schedule.date<today||!Array.isArray(schedule.crewIds)||!schedule.crewIds.includes(crew.id))return false;
   // Keep today's active trip visible after departure so crew can still see its live status.
   if(schedule.date===today&&combinedTripStatus(schedule.tripStatus)==='Arrived & Completed')return false;
   return schedule.date>today||!excursionDeparturePassed(schedule.date,schedule.time)||combinedTripStatus(schedule.tripStatus)!=='Excursion scheduled';
  });
  const groups=new Map<string,any>();
  for(const schedule of assigned){
   const key=sharedKey(schedule),entry=groups.get(key)||{key,date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',vesselId:schedule.vesselId||'',scheduleIds:[],tripNames:[],status:schedule.status,tripStatus:combinedTripStatus(schedule.tripStatus),schedules:[]};
   entry.scheduleIds.push(schedule.id);entry.tripNames.push(schedule.name);entry.schedules.push(schedule);
   if(!entry.endTime&&schedule.endTime)entry.endTime=schedule.endTime;
   const nextTripStatus=combinedTripStatus(schedule.tripStatus);
   const rank=(value:string)=>['Excursion scheduled','Guests boarded & Departed','Arrived & Completed'].indexOf(value);
   if(rank(nextTripStatus)>rank(entry.tripStatus))entry.tripStatus=nextTripStatus;
   groups.set(key,entry);
  }
  const orders=Array.isArray(savedState.orders)?savedState.orders:[];
  const ownRequests=requests.filter((request:any)=>request.accountId===user.userId).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const trips=[...groups.values()].sort((a:any,b:any)=>String(a.date+a.time).localeCompare(String(b.date+b.time))).map((trip:any)=>{
   const related=ownRequests.find((request:any)=>request.status==='Pending'&&request.date===trip.date&&trip.scheduleIds.includes(request.scheduleId));
   const tripOrders=orders.filter((order:any)=>confirmedOrder(order)&&trip.schedules.some((schedule:any)=>orderMatchesSchedule(order,schedule))&&!order.separateVessel);
   const pax=tripOrders.reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quantity)||0),0);
   const assignedCrewIds=[...new Set(trip.schedules.flatMap((schedule:any)=>Array.isArray(schedule.crewIds)?schedule.crewIds:[]).map(String))];
   const otherCrew=assignedCrewIds.filter((id:string)=>id!==crew.id).map((id:string)=>text(resources.crew.find((member:any)=>member.id===id)?.name,100)||'Unknown crew member');
   const vessel=text(resources.vessels.find((item:any)=>item.id===trip.vesselId)?.name,100)||text(trip.schedules.find((schedule:any)=>schedule.vessel)?.vessel,100)||'Not assigned';
   const {schedules:groupSchedules,...view}=trip;
   return {...view,vessel,pax,otherCrew,request:related?requestView(related,schedules):null};
  }).filter((trip:any)=>Number(trip.pax)>0);
  return Response.json({mode:'crew',crew:{id:crew.id,name:crew.name,username:user.username},trips,requests:ownRequests.slice(0,30).map((request:any)=>requestView(request,schedules))},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not load crew trip requests.'},{status:503,headers});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role==='admin'||!hasPermission(user,'crew_location')||!sameOrigin(r))return Response.json({error:'Crew Member access required.'},{status:403,headers});
 try{
  const b=await r.json(),scheduleId=text(b.scheduleId,100),date=text(b.date,10),reason=text(b.reason,500);
  if(!scheduleId||!validDate(date)||!reason)throw Error('Choose an assigned trip and enter a reason.');
  if(reason.length<3)throw Error('Enter a little more detail about why you cannot go on this trip.');
  const savedState=await state(),crew=await ensureLinkedCrew(savedState,user);
  const schedules=await allSchedules(),schedule=schedules.find((item:any)=>item.id===scheduleId&&item.date===date);
  if(!schedule||schedule.status==='Cancelled')throw Error('This assigned trip is no longer available.');
  if(!schedule.crewIds?.includes(crew.id))throw Error('You are no longer assigned to this trip.');
  if(excursionDeparturePassed(schedule.date,schedule.time))throw Error('This trip has already started or passed.');
  const existing=(await allRequests()).find((request:any)=>request.accountId===user.userId&&request.scheduleId===scheduleId&&request.date===date&&request.status==='Pending');
  if(existing)return Response.json({request:requestView(existing,schedules),duplicate:true},{headers});
  const group=schedules.filter((item:any)=>item.status!=='Cancelled'&&sharedKey(item)===sharedKey(schedule)&&item.crewIds?.includes(crew.id));
  const now=new Date().toISOString(),id='CTR-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const record={id,status:'Pending',accountId:user.userId,crewId:crew.id,crewName:crew.name,crewUsername:user.username,date:schedule.date,time:schedule.time,scheduleId:schedule.id,tripName:schedule.name,tripNames:group.map((item:any)=>item.name),reason,createdAt:now};
  await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(requestPrefix+id,JSON.stringify(record),user.userId).run();
  return Response.json({request:requestView(record,schedules)},{status:201,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not send unavailability request.'},{status:400,headers});}
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(!user||(user.role!=='admin'&&!hasPermission(user,'excursions_manager'))||!sameOrigin(r))return Response.json({error:'Excursions manager access required.'},{status:403,headers});
 try{
  const b=await r.json(),id=text(b.id,100),decision=text(b.decision,20),decisionNote=text(b.decisionNote,500),replacementCrewId=text(b.replacementCrewId,120);
  if(!id||!['Approved','Declined'].includes(decision))throw Error('Choose Approve or Decline.');
  const db=authDb(),key=requestPrefix+id,row=await db.prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();
  if(!row)throw Error('Crew request not found.');
  const request=JSON.parse(row.payload||'{}');
  if(request.status!=='Pending')throw Error('This crew request has already been reviewed.');
  const schedules=await allSchedules(),schedule=schedules.find((item:any)=>item.id===request.scheduleId&&item.date===request.date);
  const now=new Date().toISOString();
  const statements:any[]=[];
  if(decision==='Approved'){
   if(!schedule)throw Error('The scheduled excursion no longer exists.');
   if(!replacementCrewId)throw Error('Assign a replacement crew member before approving this request.');
   if(replacementCrewId===request.crewId)throw Error('Choose a different crew member as the replacement.');
   const savedState=await state(),resources=excursionResources(savedState);
   const replacement=resources.crew.find((member:any)=>member.id===replacementCrewId&&!member.removed&&member.active!==false&&member.active!==0);
   if(!replacement)throw Error('Choose an active replacement crew member.');

   const targetKey=sharedKey(schedule),targets=schedules.filter((item:any)=>item.status!=='Cancelled'&&sharedKey(item)===targetKey&&item.crewIds?.includes(request.crewId));
   if(!targets.length)throw Error('The crew member is already unassigned from this trip.');
   if(targets.some((target:any)=>(target.crewIds||[]).includes(replacementCrewId)))throw Error(replacement.name+' is already assigned to this trip. Choose another replacement.');

   const targetIds=new Set(targets.map((target:any)=>target.id+'|'+target.date));
   for(const target of targets){
    const start=text(target.time,10),end=text(target.endTime,10)||inferTripEndTime(target.name,start);
    const clash=schedules.find((other:any)=>{
     if(!other||other.status==='Cancelled'||other.date!==target.date||targetIds.has(other.id+'|'+other.date))return false;
     if(!Array.isArray(other.crewIds)||!other.crewIds.includes(replacementCrewId))return false;
     const otherEnd=text(other.endTime,10)||inferTripEndTime(other.name,other.time);
     return timeRangesOverlap(start,end,other.time,otherEnd);
    });
    if(clash)throw Error(replacement.name+' is already assigned to '+clash.name+' from '+clash.time+' to '+(clash.endTime||inferTripEndTime(clash.name,clash.time))+'. Choose another replacement.');
   }

   for(const target of targets){
    const nextCrewIds=[...new Set((target.crewIds||[]).map((crewId:string)=>crewId===request.crewId?replacementCrewId:crewId))];
    const nextGuideIds=[...new Set((target.guideIds||[]).map((guideId:string)=>guideId===request.crewId?replacementCrewId:guideId))];
    const updated={...target,crewIds:nextCrewIds,guideIds:nextGuideIds,updatedAt:now,crewReplacementNeeded:false,lastCrewUnavailability:{requestId:request.id,crewId:request.crewId,crewName:request.crewName,reason:request.reason,approvedAt:now,approvedBy:user.username,replacementCrewId,replacementCrewName:replacement.name}};
    statements.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(updated),user.userId,target._key,target.revision));
   }
   request.replacementCrewId=replacementCrewId;request.replacementCrewName=replacement.name;
  }
  request.status=decision;request.reviewedAt=now;request.reviewedBy=user.username;request.decisionNote=decisionNote;
  statements.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(request),user.userId,key,Number(row.revision)||1));
  const results=await db.batch(statements);
  if(results.some((result:any)=>!result.meta.changes))return Response.json({error:'The trip changed elsewhere. Reload and review the request again.'},{status:409,headers});
  return Response.json({ok:true,status:decision,request:requestView(request,schedules),replaced:decision==='Approved',replacementCrewId:request.replacementCrewId||'',replacementCrewName:request.replacementCrewName||''},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not review crew request.'},{status:400,headers});}
}
