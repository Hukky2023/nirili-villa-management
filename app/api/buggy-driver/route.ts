import {currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {islandToday,validDate} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';

function minusMinutes(time:string,minutes:number){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return '';
 const [h,m]=time.split(':').map(Number),total=(h*60+m-minutes+1440)%1440;
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function confirmed(order:any){
 return order?.kind==='excursion'
  &&order.status!=='Cancelled'
  &&order.status!=='Completed'
  &&order.approvalStatus!=='Pending'
  &&order.approvalStatus!=='Declined'
  &&order.approvalStatus!=='Cancelled'
  &&!!(order.time||order.schedule?.time);
}
function pickupFor(order:any,state:any){
 const stay=order.stayId?(state.stays||[]).find((s:any)=>s.id===order.stayId):null;
 const inHouse=!!stay||!!order.stayId;
 const time=String(order.time||order.schedule?.time||'');
 const location=inHouse?'Nirili Villa':String(order.hotel||'').trim()||'Guest meeting location';
 const room=inHouse?String(stay?.room||order.room||''):String(order.externalRoom||order.room||'');
 return {
  id:order.id,
  guest:order.guest||stay?.guest||'Guest',
  phone:order.phone||stay?.whatsapp||'',
  inHouse,
  hotel:inHouse?'Nirili Villa':order.hotel||'',
  room,
  location,
  date:order.date||order.schedule?.date||'',
  excursion:order.name||'Excursion',
  excursionTime:time,
  pickupTime:minusMinutes(time,15),
  quantity:Math.max(1,Number(order.quantity)||1),
  buggyRequested:inHouse||!!order.buggyRequested,
  status:order.buggyBoardedAt?'Boarded':order.buggyArrivedAt?'Arrived':'Pending pickup',
  arrivedAt:order.buggyArrivedAt||'',
  arrivedBy:order.buggyArrivedBy||'',
  boardedAt:order.buggyBoardedAt||'',
  boardedBy:order.buggyBoardedBy||'',
  notes:order.notes||''
 };
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!hasPermission(user,'buggy_driver'))return Response.json({error:'Buggy Driver access required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||islandToday();
 if(!validDate(date))return Response.json({error:'Choose a valid pickup date.'},{status:400});
 try{
  const {state}=await loadStays();
  const pickups=(state.orders||[])
   .filter((o:any)=>confirmed(o)&&(o.date||o.schedule?.date)===date&&(!!o.stayId||o.buggyRequested===true))
   .map((o:any)=>pickupFor(o,state))
   .sort((a:any,b:any)=>(a.pickupTime||a.excursionTime).localeCompare(b.pickupTime||b.excursionTime)||a.guest.localeCompare(b.guest));
  return Response.json({date,driver:user?.displayName||user?.username||'Buggy Driver',pickups},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load buggy pickups.'},{status:503});}
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(!hasPermission(user,'buggy_driver')||!sameOrigin(r))return Response.json({error:'Buggy Driver access required.'},{status:403});
 try{
  const b=await r.json(),id=String(b.id||'').slice(0,120),action=String(b.action||'');
  if(!id||!['arrived','boarded'].includes(action))throw Error('Choose a valid pickup action.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===id&&confirmed(o)&&(!!o.stayId||o.buggyRequested===true));
  if(!order)throw Error('Pickup booking not found or no longer active.');
  const now=new Date().toISOString();
  if(action==='arrived'){
   if(!order.buggyArrivedAt){
    order.buggyArrivedAt=now;
    order.buggyArrivedBy=user?.username||user?.displayName||'buggy-driver';
    order.buggyStatus='Arrived';
    order.buggyGuestNotifiedAt=now;
   }
  }else{
   if(!order.buggyArrivedAt)throw Error('Notify the guest that you have arrived before marking them onboard.');
   if(!order.buggyBoardedAt){
    order.buggyBoardedAt=now;
    order.buggyBoardedBy=user?.username||user?.displayName||'buggy-driver';
    order.buggyStatus='Boarded';
   }
  }
  const saved=await saveStayAccess(state,revision,user?.userId||'buggy-driver');
  if(!saved)return Response.json({error:'Another update was saved. Please refresh and try again.'},{status:409});
  return Response.json({ok:true,pickup:pickupFor(order,state)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update pickup.'},{status:400});}
}
