import {currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {islandToday,validDate} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {isRomanticBeachDinner} from '../../../lib/excursion-services';

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
  &&(!!(order.time||order.schedule?.time)||isRomanticBeachDinner(order));
}
function manualPickupFor(item:any,state:any){
 const guestRide=item.bookingType==='guest-ride',buggy=(state.buggyFleet||[]).find((x:any)=>x.id===item.buggyId);
 return {...item,manual:true,guestRide,excursion:guestRide?'Guest buggy ride':item.excursion||'Manual buggy booking',excursionTime:item.pickupTime||'',pickupTimingNote:guestRide?'Requested now':'Manual booking',inHouse:guestRide||!!item.stayId,hotel:guestRide?'Nirili Villa':'',room:item.room||'',buggyRequested:true,roundTrip:false,romanticDinner:false,status:item.cancelled?'Cancelled':guestRide?(item.buggyStatus||'Requested'):(item.buggyBoardedAt?'Boarded':item.buggyArrivedAt?'Arrived':'Pending pickup'),buggyName:buggy?.name||'',driver:item.buggyDriver||buggy?.driver||'',fareCents:Math.max(0,Number(item.fareCents)||0),chargeToRoom:item.chargeToRoom===true,arrivedAt:item.buggyArrivedAt||'',arrivedBy:item.buggyArrivedBy||'',boardedAt:item.buggyBoardedAt||'',boardedBy:item.buggyBoardedBy||''};
}
function activeGuestRide(item:any){return item?.bookingType==='guest-ride'&&item.cancelled!==true&&!['Completed','Cancelled'].includes(String(item.buggyStatus||''));}
function releaseBuggy(state:any,item:any){
 if(!item?.buggyId)return;
 const busy=(state.buggyBookings||[]).some((x:any)=>x.id!==item.id&&x.buggyId===item.buggyId&&activeGuestRide(x));
 if(!busy){const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===item.buggyId);if(buggy&&buggy.status==='Assigned'){buggy.status='Available';buggy.updatedAt=new Date().toISOString();}}
}
function removeGuestRideBill(state:any,item:any){
 if(item?.bookingType!=='guest-ride'||!item.stayId)return;
 const stay=(state.stays||[]).find((s:any)=>s.id===item.stayId);if(!stay)return;
 stay.posBills=Array.isArray(stay.posBills)?stay.posBills:[];
 stay.posBills=stay.posBills.filter((bill:any)=>!(bill?.department==='Buggy'&&String(bill?.id||'')===String(item.id)));
}

function pickupFor(order:any,state:any){
 const stay=order.stayId?(state.stays||[]).find((s:any)=>s.id===order.stayId):null;
 const inHouse=!!stay||!!order.stayId;
 const time=String(order.time||order.schedule?.time||''),romanticDinner=isRomanticBeachDinner(order),roundTrip=romanticDinner&&!!order.buggyRoundTrip;
 const location=inHouse?'Nirili Villa':String(order.hotel||'').trim()||'Guest meeting location';
 const room=inHouse?String(stay?.room||order.room||''):String(order.externalRoom||order.room||'');
 const status=roundTrip
  ? order.buggyReturnCompleteAt?'Round trip complete'
    : order.buggyReturnBoardedAt?'Returning'
    : order.buggyReturnArrivedAt?'Return pickup arrived'
    : order.buggyDinnerDropoffAt?'Waiting for dinner to finish'
    : order.buggyBoardedAt?'Going to dinner'
    : order.buggyArrivedAt?'Arrived'
    :'Pending pickup'
  : order.buggyBoardedAt?'Boarded':order.buggyArrivedAt?'Arrived':'Pending pickup';
 return {
  id:order.id,
  guest:order.guest||stay?.guest||'Guest',
  phone:order.phone||stay?.whatsapp||'',
  inHouse,
  hotel:inHouse?'Nirili Villa':order.hotel||'',
  room,
  location,
  destination:romanticDinner?'Romantic Beach Dinner location':'Excursion meeting point',
  date:order.date||order.schedule?.date||'',
  excursion:order.name||'Excursion',
  excursionTime:time,
  pickupTime:minusMinutes(time,15),
  pickupTimingNote:romanticDinner?'15 minutes before dinner':'15 minutes before excursion',
  quantity:Math.max(1,Number(order.quantity)||1),
  buggyRequested:inHouse||!!order.buggyRequested,
  roundTrip,
  romanticDinner,
  status,
  arrivedAt:order.buggyArrivedAt||'',
  arrivedBy:order.buggyArrivedBy||'',
  boardedAt:order.buggyBoardedAt||'',
  boardedBy:order.buggyBoardedBy||'',
  dinnerDropoffAt:order.buggyDinnerDropoffAt||'',
  returnArrivedAt:order.buggyReturnArrivedAt||'',
  returnBoardedAt:order.buggyReturnBoardedAt||'',
  returnCompleteAt:order.buggyReturnCompleteAt||'',
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
  const pickups=[...(state.orders||[])
   .filter((o:any)=>confirmed(o)&&(o.date||o.schedule?.date)===date&&(!!o.stayId||o.buggyRequested===true))
   .map((o:any)=>pickupFor(o,state)),...((state.buggyBookings||[]).filter((b:any)=>b.date===date&&b.cancelled!==true).map((b:any)=>manualPickupFor(b,state)))]
   .sort((a:any,b:any)=>(a.pickupTime||a.excursionTime).localeCompare(b.pickupTime||b.excursionTime)||a.guest.localeCompare(b.guest));
  return Response.json({date,driver:user?.displayName||user?.username||'Buggy Driver',pickups},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load buggy pickups.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!hasPermission(user,'buggy_driver')||!sameOrigin(r))return Response.json({error:'Buggy Driver access required.'},{status:403});
 try{
  const b=await r.json(),bookingType=String(b.bookingType||'').trim().slice(0,30),guest=String(b.guest||'').trim().slice(0,100),phone=String(b.phone||'').trim().slice(0,30),date=String(b.date||''),pickupTime=String(b.pickupTime||''),departureTime=String(b.departureTime||'').trim().slice(0,10),location=String(b.location||'').trim().slice(0,150),destination=String(b.destination||'').trim().slice(0,150),quantity=Math.max(1,Math.min(20,Number(b.quantity)||1)),notes=String(b.notes||'').trim().slice(0,500);
  if(!guest||!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(pickupTime)||!location||!destination)throw Error('Enter guest name, date, buggy time, pickup point and drop-off point.');
  const {state,revision}=await loadStays();state.buggyBookings??=[];
  const item={id:'buggy-'+crypto.randomUUID(),guest,phone,date,pickupTime,departureTime,location,destination,quantity,notes,excursion:bookingType==='checkout'?'Check-out buggy':'Manual buggy booking',bookingType,createdAt:new Date().toISOString(),createdBy:user?.username||user?.displayName||'buggy-driver'};
  state.buggyBookings.push(item);
  const saved=await saveStayAccess(state,revision,user?.userId||'buggy-driver');
  if(!saved)return Response.json({error:'Another update was saved. Please try again.'},{status:409});
  return Response.json({ok:true,pickup:manualPickupFor(item,state)},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not book buggy.'},{status:400});}
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(!hasPermission(user,'buggy_driver')||!sameOrigin(r))return Response.json({error:'Buggy Driver access required.'},{status:403});
 try{
  const b=await r.json(),id=String(b.id||'').slice(0,120),action=String(b.action||'');
  if(!id||!['arrived','boarded','complete','cancel','dinner-dropoff','return-arrived','return-boarded','return-complete'].includes(action))throw Error('Choose a valid pickup action.');
  const {state,revision}=await loadStays();
  const manual=(state.buggyBookings||[]).find((o:any)=>o.id===id&&o.cancelled!==true);
  const order=manual||(state.orders||[]).find((o:any)=>o.id===id&&confirmed(o)&&(!!o.stayId||o.buggyRequested===true));
  if(!order)throw Error('Pickup booking not found or no longer active.');
  const now=new Date().toISOString();
  const roundTrip=!manual&&isRomanticBeachDinner(order)&&!!order.buggyRoundTrip,guestRide=!!manual&&order.bookingType==='guest-ride';
  if(action==='cancel'){
   if(!manual)throw Error('Only manual buggy bookings can be cancelled from the Buggy Driver screen.');
   order.cancelled=true;order.cancelledAt=now;order.cancelledBy=user?.username||user?.displayName||'buggy-driver';order.buggyStatus='Cancelled';if(guestRide){removeGuestRideBill(state,order);releaseBuggy(state,order);}
  }else if(action==='arrived'){
   if(guestRide&&!order.buggyId)throw Error('This guest ride is waiting for buggy assignment.');
   if(!order.buggyArrivedAt){
    order.buggyArrivedAt=now;
    order.buggyArrivedBy=user?.username||user?.displayName||'buggy-driver';
    order.buggyStatus='Arrived';
    order.buggyGuestNotifiedAt=now;
   }
  }else if(action==='boarded'){
   if(!order.buggyArrivedAt)throw Error('Notify the guest that you have arrived before marking them onboard.');
   if(!order.buggyBoardedAt){
    order.buggyBoardedAt=now;
    order.buggyBoardedBy=user?.username||user?.displayName||'buggy-driver';
    order.buggyStatus=guestRide?'On trip':roundTrip?'Going to dinner':'Boarded';
   }
  }else if(action==='complete'){
   if(!guestRide)throw Error('Complete is only used for in-house guest rides.');
   if(!order.buggyBoardedAt)throw Error('Mark the guest onboard before completing the ride.');
   order.buggyCompletedAt=order.buggyCompletedAt||now;order.buggyCompletedBy=user?.username||user?.displayName||'buggy-driver';order.buggyStatus='Completed';releaseBuggy(state,order);
   state.buggyTripHistory??=[];const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===order.buggyId);state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Completed',buggyId:order.buggyId||'',buggyName:buggy?.name||'',bookingId:order.id,guest:order.guest||'',driver:order.buggyDriver||user?.displayName||user?.username||'',by:user?.username||user?.displayName||'buggy-driver'});
  }else if(action==='dinner-dropoff'){
   if(!roundTrip)throw Error('This is not a romantic dinner round-trip booking.');
   if(!order.buggyBoardedAt)throw Error('Mark the guests onboard before recording dinner drop-off.');
   order.buggyDinnerDropoffAt=order.buggyDinnerDropoffAt||now;order.buggyStatus='Waiting for dinner to finish';
  }else if(action==='return-arrived'){
   if(!roundTrip||!order.buggyDinnerDropoffAt)throw Error('Record the dinner drop-off before starting the return pickup.');
   order.buggyReturnArrivedAt=order.buggyReturnArrivedAt||now;order.buggyReturnGuestNotifiedAt=now;order.buggyStatus='Return pickup arrived';
  }else if(action==='return-boarded'){
   if(!roundTrip||!order.buggyReturnArrivedAt)throw Error('Notify the guests that you arrived for the return pickup first.');
   order.buggyReturnBoardedAt=order.buggyReturnBoardedAt||now;order.buggyStatus='Returning';
  }else{
   if(!roundTrip||!order.buggyReturnBoardedAt)throw Error('Mark the guests onboard for the return trip first.');
   order.buggyReturnCompleteAt=order.buggyReturnCompleteAt||now;order.buggyStatus='Round trip complete';
  }
  const saved=await saveStayAccess(state,revision,user?.userId||'buggy-driver');
  if(!saved)return Response.json({error:'Another update was saved. Please refresh and try again.'},{status:409});
  return Response.json(action==='cancel'?{ok:true,cancelled:true,id}:{ok:true,pickup:manual?manualPickupFor(order,state):pickupFor(order,state)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update pickup.'},{status:400});}
}
