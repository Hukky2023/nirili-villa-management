import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {islandToday,validDate} from '../../../lib/guest-catalog';
import {excursionResources} from '../../../lib/excursion-workflow';

const prefix='excursion-schedule:';
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();

function matches(o:any,s:any){
 if(o.kind!=='excursion'||o.status==='Cancelled'||o.approvalStatus==='Declined')return false;
 if(o.scheduleId)return o.scheduleId===s.id;
 const os=o.schedule||{};
 return (os.date||o.date)===s.date&&os.time===s.time&&(!s.vesselId||os.vesselId===s.vesselId)&&norm(o.name)===norm(s.name);
}
function confirmed(o:any){return o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.status!=='Cancelled';}
function pending(o:any){return o.approvalStatus==='Pending'&&o.status!=='Cancelled';}

async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>JSON.parse(row.payload)).sort((a:any,b:any)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!user||user.role!=='guest')return Response.json({error:'Guest login required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||islandToday();
 if(!validDate(date))return Response.json({error:'Choose a valid date.'},{status:400});
 try{
  const {state}=await loadStays();
  const stays=(state.stays||[]).filter((s:any)=>s.accountId===user.userId&&s.status==='In House');
  const eligibleStays=stays.filter((s:any)=>s.checkIn<=date&&date<s.checkOut).map((s:any)=>({id:s.id,room:s.room,guest:s.guest,checkIn:s.checkIn,checkOut:s.checkOut}));
  const raw=await schedulesForDate(date);
  const orders=Array.isArray(state.orders)?state.orders:[];
  const groups:Record<string,{capacity:number,confirmedPax:number,pendingPax:number,scheduleIds:string[]}>={};
  const schedules=raw.map((s:any)=>{
   const own=orders.filter((o:any)=>o.accountId===user.userId&&o.scheduleId===s.id&&o.kind==='excursion').sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
   const confirmedPax=orders.filter((o:any)=>matches(o,s)&&confirmed(o)).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const pendingPax=orders.filter((o:any)=>matches(o,s)&&pending(o)).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const sharedBoatKey=s.vesselId?`${s.date}|${s.time}|${s.vesselId}`:'';
   if(sharedBoatKey){const g=groups[sharedBoatKey]||(groups[sharedBoatKey]={capacity:s.capacity,confirmedPax:0,pendingPax:0,scheduleIds:[]});g.capacity=Math.min(g.capacity,s.capacity);g.confirmedPax+=confirmedPax;g.pendingPax+=pendingPax;g.scheduleIds.push(s.id);}
   return {id:s.id,date:s.date,time:s.time,name:s.name,status:s.status,capacity:s.capacity,notes:s.notes||'',sharedBoatKey,confirmedPax,pendingPax,ownBooking:own?{id:own.id,quantity:own.quantity,status:own.approvalStatus==='Approved'?'Confirmed':own.approvalStatus||own.status,createdAt:own.createdAt}:null};
  });
  const enriched=schedules.map((s:any)=>{const g=s.sharedBoatKey?groups[s.sharedBoatKey]:null;const capacity=g?.capacity??s.capacity,confirmedPax=g?.confirmedPax??s.confirmedPax,pendingPax=g?.pendingPax??s.pendingPax;return {...s,capacity,confirmedPax,pendingPax,remainingSeats:Math.max(0,capacity-confirmedPax),isFull:confirmedPax>=capacity,sharedBoat:!!g&&g.scheduleIds.length>1};});
  return Response.json({date,stays:eligibleStays,schedules:enriched},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load scheduled excursions.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role!=='guest'||!sameOrigin(r))return Response.json({error:'Guest login required.'},{status:403});
 try{
  const b=await r.json();
  const scheduleId=String(b.scheduleId||'').slice(0,100),date=String(b.date||''),stayId=String(b.stayId||''),token=String(b.token||'');
  const quantity=Number(b.quantity),notes=String(b.notes||'').trim().slice(0,1000);
  if(!scheduleId||!validDate(date)||!stayId||!/^[-a-zA-Z0-9]{12,80}$/.test(token)||!Number.isInteger(quantity)||quantity<1||quantity>20)throw Error('Check the date, room and number of seats.');
  const {state,revision}=await loadStays();
  const old=(state.orders||[]).find((o:any)=>o.token===token&&o.accountId===user.userId);
  if(old)return Response.json({booking:{id:old.id,status:old.approvalStatus==='Approved'?'Confirmed':old.approvalStatus||old.status,requiresApproval:old.approvalStatus==='Pending'}});
  const stay=(state.stays||[]).find((s:any)=>s.id===stayId&&s.accountId===user.userId&&s.status==='In House');
  if(!stay)throw Error('This room is not available for excursion booking.');
  if(date<islandToday()||date<stay.checkIn||date>=stay.checkOut)throw Error('Choose a scheduled excursion during your current stay.');
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+date+':'+scheduleId).first<any>();
  if(!row)throw Error('This excursion is no longer scheduled.');
  const schedule=JSON.parse(row.payload);
  if(schedule.status!=='Open')throw Error('This excursion is closed for bookings.');
  const allSchedules=await schedulesForDate(date);
  const groupSchedules=schedule.vesselId?allSchedules.filter((s:any)=>s.time===schedule.time&&s.vesselId===schedule.vesselId):[schedule];
  const groupIds=new Set(groupSchedules.map((s:any)=>s.id));
  const capacity=Math.min(...groupSchedules.map((s:any)=>Number(s.capacity)||1));
  const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&o.status!=='Cancelled'&&o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&(groupIds.has(o.scheduleId)||groupSchedules.some((s:any)=>matches(o,s)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
  const requiresApproval=confirmedPax+quantity>capacity;
  const id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
  state.orders??=[];
  state.orders.push({
   id,token,accountId:user.userId,stayId:stay.id,guest:stay.guest,room:stay.room,kind:'excursion',name:schedule.name,quantity,cents:0,notes,date,time:schedule.time,scheduleId:schedule.id,
   seatRequest:requiresApproval,approvalStatus:requiresApproval?'Pending':'Approved',status:requiresApproval?'Awaiting scheduling':'Scheduled',requestedOverCapacity:requiresApproval,autoConfirmed:!requiresApproval,
   schedule:requiresApproval?undefined:{date:schedule.date,time:schedule.time,vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)},
   guestNotified:requiresApproval?undefined:false,createdAt:new Date().toISOString(),source:'Guest schedule'
  });
  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
  return Response.json({booking:{id,status:requiresApproval?'Pending':'Confirmed',requiresApproval,overCapacity:requiresApproval,remainingBefore:Math.max(0,capacity-confirmedPax)}},{status:201});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not book excursion seats.'},{status:400});}
}
