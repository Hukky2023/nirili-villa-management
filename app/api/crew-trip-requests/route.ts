import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {excursionDeparturePassed,islandToday} from '../../../lib/guest-catalog';
import {excursionResources} from '../../../lib/excursion-workflow';

const requestPrefix='crew-trip-request:';
const schedulePrefix='excursion-schedule:';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

const text=(value:any,max=500)=>String(value||'').trim().slice(0,max);
const validDate=(value:any)=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));

function sharedKey(schedule:any){
 if(schedule.sharedGroup)return schedule.date+'|'+schedule.time+'|group:'+schedule.sharedGroup;
 if(schedule.vesselId)return schedule.date+'|'+schedule.time+'|vessel:'+schedule.vesselId;
 return schedule.date+'|'+schedule.time+'|schedule:'+schedule.id;
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
 return {
  id:request.id,status:request.status,crewId:request.crewId,crewName:request.crewName,crewUsername:request.crewUsername,
  accountId:request.accountId,date:request.date,time:request.time,tripName:request.tripName,
  tripNames:request.tripNames||[request.tripName],scheduleId:request.scheduleId,reason:request.reason,
  createdAt:request.createdAt,reviewedAt:request.reviewedAt||'',reviewedBy:request.reviewedBy||'',
  decisionNote:request.decisionNote||'',stillAssigned:!!schedule?.crewIds?.includes(request.crewId)
 };
}

export async function GET(){
 const user=await currentUser();
 if(!user)return Response.json({error:'Login required.'},{status:401,headers});
 try{
  const schedules=await allSchedules(),requests=await allRequests();
  if(user.role==='admin'){
   const visible=requests.filter((request:any)=>request.status==='Pending'||Date.parse(request.createdAt||'')>Date.now()-30*86400000).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   return Response.json({mode:'admin',requests:visible.map((request:any)=>requestView(request,schedules)),pendingCount:visible.filter((request:any)=>request.status==='Pending').length},{headers});
  }
  if(!hasPermission(user,'crew_location'))return Response.json({error:'Crew Member access required.'},{status:403,headers});
  const savedState=await state(),crew=excursionResources(savedState).crew.find((member:any)=>!member.removed&&(member.accountId===user.userId||member.id===user.userId));
  if(!crew)return Response.json({error:'Your login is not linked to an excursion crew member.'},{status:409,headers});
  const today=islandToday();
  const assigned=schedules.filter((schedule:any)=>schedule.status!=='Cancelled'&&schedule.date>=today&&Array.isArray(schedule.crewIds)&&schedule.crewIds.includes(crew.id)&&!excursionDeparturePassed(schedule.date,schedule.time));
  const groups=new Map<string,any>();
  for(const schedule of assigned){
   const key=sharedKey(schedule),entry=groups.get(key)||{key,date:schedule.date,time:schedule.time,vesselId:schedule.vesselId||'',scheduleIds:[],tripNames:[],status:schedule.status};
   entry.scheduleIds.push(schedule.id);entry.tripNames.push(schedule.name);groups.set(key,entry);
  }
  const ownRequests=requests.filter((request:any)=>request.accountId===user.userId).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const trips=[...groups.values()].sort((a:any,b:any)=>String(a.date+a.time).localeCompare(String(b.date+b.time))).map((trip:any)=>{
   const related=ownRequests.find((request:any)=>request.status==='Pending'&&request.date===trip.date&&trip.scheduleIds.includes(request.scheduleId));
   return {...trip,request:related?requestView(related,schedules):null};
  });
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
  const savedState=await state(),crew=excursionResources(savedState).crew.find((member:any)=>!member.removed&&(member.accountId===user.userId||member.id===user.userId));
  if(!crew)throw Error('Your login is not linked to an excursion crew member.');
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
 if(!user||user.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access required.'},{status:403,headers});
 try{
  const b=await r.json(),id=text(b.id,100),decision=text(b.decision,20),decisionNote=text(b.decisionNote,500);
  if(!id||!['Approved','Declined'].includes(decision))throw Error('Choose Approve or Decline.');
  const db=authDb(),key=requestPrefix+id,row=await db.prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();
  if(!row)throw Error('Crew request not found.');
  const request=JSON.parse(row.payload||'{}');
  if(request.status!=='Pending')throw Error('This crew request has already been reviewed.');
  const schedules=await allSchedules(),schedule=schedules.find((item:any)=>item.id===request.scheduleId&&item.date===request.date);
  const now=new Date().toISOString();
  request.status=decision;request.reviewedAt=now;request.reviewedBy=user.username;request.decisionNote=decisionNote;
  const statements:any[]=[];
  if(decision==='Approved'){
   if(!schedule)throw Error('The scheduled excursion no longer exists.');
   const targetKey=sharedKey(schedule),targets=schedules.filter((item:any)=>item.status!=='Cancelled'&&sharedKey(item)===targetKey&&item.crewIds?.includes(request.crewId));
   if(!targets.length)throw Error('The crew member is already unassigned from this trip.');
   for(const target of targets){
    const updated={...target,crewIds:(target.crewIds||[]).filter((crewId:string)=>crewId!==request.crewId),guideIds:(target.guideIds||[]).filter((guideId:string)=>guideId!==request.crewId),updatedAt:now,crewReplacementNeeded:true,lastCrewUnavailability:{requestId:request.id,crewId:request.crewId,crewName:request.crewName,reason:request.reason,approvedAt:now,approvedBy:user.username}};
    statements.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(updated),user.userId,target._key,target.revision));
   }
  }
  statements.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(request),user.userId,key,Number(row.revision)||1));
  const results=await db.batch(statements);
  if(results.some((result:any)=>!result.meta.changes))return Response.json({error:'The trip changed elsewhere. Reload and review the request again.'},{status:409,headers});
  return Response.json({ok:true,status:decision,request:requestView(request,schedules),unassigned:decision==='Approved'},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not review crew request.'},{status:400,headers});}
}
