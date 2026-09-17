import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';

const prefix='excursion-schedule:';
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
const validTime=(v:any)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const clean=(x:any)=>{
 if(!x||!validDate(x.date)||!validTime(x.time))throw Error('Choose a valid date and departure time.');
 const name=String(x.name||'').trim().slice(0,180);
 if(!name)throw Error('Excursion name is required.');
 const capacity=Math.max(1,Math.min(100,Number(x.capacity)||1));
 const vesselId=String(x.vesselId||'').slice(0,100);
 const crewIds=Array.isArray(x.crewIds)?[...new Set(x.crewIds.map((id:any)=>String(id).slice(0,100)).filter(Boolean))].slice(0,20):[];
 const status=x.status==='Closed'?'Closed':'Open';
 const notes=String(x.notes||'').trim().slice(0,1000);
 return {date:x.date,time:x.time,name,capacity,vesselId,crewIds,status,notes};
};
function matches(o:any,s:any){
 if(o.kind!=='excursion'||o.status==='Cancelled'||o.approvalStatus==='Declined')return false;
 if(o.scheduleId)return o.scheduleId===s.id;
 const os=o.schedule||{};
 return (os.date||o.date)===s.date&&os.time===s.time&&(!s.vesselId||os.vesselId===s.vesselId)&&norm(o.name)===norm(s.name);
}
const isConfirmed=(o:any)=>o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.status!=='Cancelled';
const isPending=(o:any)=>o.approvalStatus==='Pending'&&o.status!=='Cancelled';

export async function GET(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest')return Response.json({error:'Staff login required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||'';
 if(!validDate(date))return Response.json({error:'Valid schedule date required.'},{status:400});
 try{
  const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
  const raw=(rows.results||[]).map((row:any)=>({...JSON.parse(row.payload),revision:row.revision})).sort((a:any,b:any)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
  const {state}=await loadStays(),orders=Array.isArray(state.orders)?state.orders:[];
  const schedules=raw.map((s:any)=>{
   const bookedPax=orders.filter((o:any)=>matches(o,s)&&isConfirmed(o)).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const pendingOrders=orders.filter((o:any)=>matches(o,s)&&isPending(o));
   const pendingPax=pendingOrders.reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   return {...s,bookedPax,pendingPax,sharedBoatKey:s.vesselId?s.date+'|'+s.time+'|'+s.vesselId:'',pendingOrders};
  });
  const groups:Record<string,{scheduleIds:string[],bookedPax:number,pendingPax:number,capacity:number}>={};
  for(const s of schedules){
   if(!s.sharedBoatKey)continue;
   const g=groups[s.sharedBoatKey]||(groups[s.sharedBoatKey]={scheduleIds:[],bookedPax:0,pendingPax:0,capacity:s.capacity});
   g.scheduleIds.push(s.id);g.bookedPax+=s.bookedPax;g.pendingPax+=s.pendingPax;g.capacity=Math.min(g.capacity,s.capacity);
  }
  const enriched=schedules.map((s:any)=>{
   const g=s.sharedBoatKey?groups[s.sharedBoatKey]:null,baseConfirmed=g?.bookedPax??s.bookedPax,capacity=g?.capacity??s.capacity;
   const requests=s.pendingOrders.map((o:any)=>({id:o.id,guest:o.guest,room:o.room,quantity:o.quantity,notes:o.notes||'',createdAt:o.createdAt,overCapacity:baseConfirmed+Math.max(0,Number(o.quantity)||0)>capacity}));
   const {pendingOrders,...rest}=s;
   return {...rest,requests};
  });
  return Response.json({date,schedules:enriched,sharedBoatGroups:groups,canEdit:hasPermission(user,'edit_excursions')},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load excursion schedules.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const body=clean(await r.json());
  const id=crypto.randomUUID();
  const record={id,...body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
  const body=clean(raw);
  const key=prefix+body.date+':'+id;
  const existing=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(key).first<any>();
  if(!existing)throw Error('Schedule not found.');
  const old=JSON.parse(existing.payload);
  const record={...old,...body,id,updatedAt:new Date().toISOString()};
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
  const b=await r.json(),requestId=String(b.requestId||''),decision=String(b.decision||'');
  if(!requestId||!['Approved','Declined'].includes(decision))throw Error('Choose Approve or Decline.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===requestId&&o.kind==='excursion'&&o.seatRequest===true);
  if(!order||order.approvalStatus!=='Pending')throw Error('This seat request has already been handled.');
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+order.date+':'+order.scheduleId).first<any>();
  if(!row)throw Error('The scheduled excursion no longer exists.');
  const schedule=JSON.parse(row.payload);
  order.approvalStatus=decision;order.reviewedAt=new Date().toISOString();order.reviewedBy=user.username;
  if(decision==='Approved'){
   const vessel=(state.excursionResources?.vessels||[]).find((v:any)=>v.id===schedule.vesselId);
   const crew=(state.excursionResources?.crew||[]).filter((c:any)=>schedule.crewIds?.includes(c.id));
   order.status='Scheduled';order.schedule={date:schedule.date,time:schedule.time,vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)};order.guestNotified=false;
  }else{order.status='Cancelled';}
  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another update was saved. Reload and try again.'},{status:409});
  return Response.json({ok:true,decision});
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
