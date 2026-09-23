import {toggleTransferPayment} from '../../../lib/transport-payment';
import {loadStays,stayKey} from '../../../lib/stays';
import {canTransport,isTransportAgent,transportRole} from '../../../lib/transport-access';
import {authDb,currentUser,currentGuestUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {restaurantOnly} from '../../../lib/pos-access';
import {createTransfer,initialTransport,TransportState,Sailing} from '../../../lib/transport';
import {minutes,syncTransportBuggy} from '../../../lib/transport-plan';
import {syncTransportPlanBill} from '../../../lib/transport-plan-billing';
import {sendTransportScheduleEmail} from '../../../lib/booking-email';
import {mirrorTransportState,mirrorHotelState,mirrorOperationalRecord,readOperationalRecordPrimary,saveOperationalRecordPrimary,saveOperationalPairPrimary} from '../../../lib/supabase-bridge';
const key='transport-bookings-v1';
async function transportUser(){return (await currentUser())||(await currentGuestUser());}
async function load(){const row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();return {state:row?JSON.parse(row.payload) as TransportState:initialTransport(),revision:row?.revision||0};}
async function loadForRead(){
 try{
  const row=await readOperationalRecordPrimary(key);
  if(row)return {state:(row.payload||initialTransport()) as TransportState,revision:Number(row.revision)||0};
 }catch{}
 return load();
}
async function loadHotelPrimary(){
 try{
  const row=await readOperationalRecordPrimary(stayKey);
  if(row?.payload){
   const state=row.payload;state.stays??=[];state.orders??=[];state.rooms??=[];
   return {state,revision:Number(row.revision)||0};
  }
 }catch{}
 return loadStays();
}
function canonicalLocation(value:any){
 const raw=String(value||'').trim(),lower=raw.toLowerCase();
 if(lower.includes('velana')||lower==='mle'||lower.includes('airport'))return 'Velana Airport';
 if(lower==='male'||lower==="male'"||lower==='malé')return "Male'";
 if(lower.includes('dhiffushi'))return 'Dhiffushi';
 return raw;
}
function bookedPax(state:TransportState,scheduleId:string,date:string,excludeId=''){
 return state.bookings.filter(b=>b.id!==excludeId&&b.status!=='Cancelled'&&b.journeys.some(j=>j.scheduleId===scheduleId&&j.date===date)).reduce((sum,b)=>sum+b.adults+b.children+b.infants,0);
}
function planRows(state:TransportState,hotelState:any){
 const rows:any[]=[];
 for(const stay of hotelState.stays||[]){
  if(!['Confirmed','In House'].includes(String(stay.status||'')))continue;
  for(const leg of ['arrival','departure'] as const){
   const plan=stay.transportPlan?.[leg];if(!plan)continue;
   const linkedBill=(hotelState.orders||[]).find((order:any)=>order.kind==='transfer'&&order.id===plan.transportBookingId);
   const from=leg==='arrival'?canonicalLocation(plan.from||'Velana Airport'):'Dhiffushi';
   const to=leg==='arrival'?'Dhiffushi':canonicalLocation(plan.destination||'Velana Airport');
   const date=String(plan.date||(leg==='arrival'?stay.checkIn:stay.checkOut)||'');
   const pax=Math.max(1,Number(stay.pax)||1);
   const eligible=state.sailings.filter(s=>s.active&&Number.isInteger(s.roomFare)&&Number(s.roomFare)>=0&&canonicalLocation(s.from)===from&&canonicalLocation(s.to)===to&&s.capacity-bookedPax(state,s.id,date,plan.transportBookingId||plan.previousTransportBookingId||'')>=pax).sort((a,b)=>a.depart.localeCompare(b.depart));
   const flight=minutes(String(plan.flightTime||''));let recommended:Sailing|undefined;
   if(eligible.length){
    if(leg==='arrival'&&flight!=null)recommended=eligible.find(s=>(minutes(s.depart)??0)>=flight+90);
    else if(leg==='departure'&&flight!=null)recommended=[...eligible].reverse().find(s=>(minutes(s.arrive)??1440)<=flight-120);
    else recommended=leg==='arrival'?eligible[0]:eligible[eligible.length-1];
   }
   rows.push({stayId:stay.id,leg,guest:stay.guest,phone:stay.whatsapp||'',room:stay.room||'',pax,adults:Number(stay.adults??stay.pax??1),children:Number(stay.children??0),date,needTransfer:plan.needTransfer||'later',from,to,flightNumber:plan.flightNumber||'',flightTime:plan.flightTime||'',ownTransport:plan.ownTransport||'',ownTime:leg==='arrival'?plan.dhiffushiArrivalTime||'':plan.ownDepartureTime||'',status:plan.status||'',launch:plan.launch||null,transportBookingId:plan.transportBookingId||'',needsReview:!!plan.needsReview,billing:plan.billing||null,roomChargeCents:linkedBill?.status==='Cancelled'?0:Number(linkedBill?.cents??plan.billing?.cents??0),roomBaseCents:Number(linkedBill?.baseCents??plan.billing?.baseCents??0),recommendedScheduleId:recommended?.id||'',eligibleScheduleIds:eligible.map(s=>s.id)});
  }
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.leg.localeCompare(b.leg)||String(a.guest).localeCompare(String(b.guest)));
}
async function visible(state:TransportState,revision:number,u:any){
 const canEdit=hasPermission(u,'edit_transfers'),hotel=await loadHotelPrimary();
 const eligible=u.role==='guest'&&!isTransportAgent(u)?hotel.state.stays.filter((s:any)=>s.accountId===u.userId&&['In House','Confirmed'].includes(s.status)&&s.checkOut>=new Date(Date.now()+5*3600000).toISOString().slice(0,10)):[];
 const ownRoom=eligible.length===1?{id:eligible[0].id,room:eligible[0].room,checkIn:eligible[0].checkIn,checkOut:eligible[0].checkOut}:null;
 const guestStays=u.role==='admin'?(hotel.state.stays||[]).filter((s:any)=>['Confirmed','In House'].includes(String(s.status||''))).map((s:any)=>({id:s.id,guest:s.guest,room:s.room,phone:s.whatsapp||'',email:s.email||'',checkIn:s.checkIn,checkOut:s.checkOut,pax:Number(s.pax)||1,adults:Number(s.adults??s.pax??1),children:Number(s.children??0),transportPlan:s.transportPlan||null})):[];
 return {revision,canEdit,isAdmin:u.role==='admin',role:transportRole(u),ownRoom,guestStays,transportPlans:canEdit?planRows(state,hotel.state):[],sailings:canEdit?state.sailings:state.sailings.filter(s=>s.active),bookings:state.bookings.filter(b=>canEdit||b.owner===u.userId).map(({token,owner,...b})=>b),availability:state.bookings.filter(b=>b.status!=='Cancelled').flatMap(b=>b.journeys.map(j=>({scheduleId:j.scheduleId,date:j.date,seats:j.seats,pax:b.adults+b.children+b.infants}))) };
}
export async function GET(){const u=await transportUser();if(!u||!canTransport(u))return Response.json({error:'Sign in to access transfers.'},{status:403});try{const {state,revision}=await loadForRead();return Response.json(await visible(state,revision,u),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Unable to load transfers. Please retry.'},{status:503});}}
export async function POST(r:Request){const u=await transportUser();if(!u||!canTransport(u)||!sameOrigin(r))return Response.json({error:'Not allowed.'},{status:403});try{
 const b=await r.json();const {state,revision}=await loadForRead();const canEdit=hasPermission(u,'edit_transfers');
 if(b.action==='book'&&state.bookings.some(x=>x.token===b.token&&x.owner===u.userId))return Response.json(await visible(state,revision,u));
 if(b.revision!==revision)return Response.json({error:'Transfers changed on another device. Refresh and review before saving.'},{status:409});
 let hotelWrite:any=null,transportMail:any=null;
 if(b.action==='plan-schedule'){
  if(!canEdit)return Response.json({error:'Transfer editing permission required.'},{status:403});
  const hotel=await loadHotelPrimary(),stay=hotel.state.stays.find((item:any)=>item.id===String(b.stayId||'')&&['Confirmed','In House'].includes(String(item.status||'')));
  const leg=b.leg==='arrival'||b.leg==='departure'?b.leg:null;if(!stay||!leg)throw Error('Guest transport plan not found.');
  const plan=stay.transportPlan?.[leg];if(!plan||plan.needTransfer!=='yes')throw Error('This guest has not asked Nirili Villa to arrange this launch.');
  const sailing=state.sailings.find(s=>s.id===String(b.scheduleId||'')&&s.active);if(!sailing)throw Error('Choose an active speedboat departure.');
  if(!Number.isInteger(sailing.roomFare)||Number(sailing.roomFare)<0)throw Error('Set the USD room fare for this launch before assigning it to a room transport plan.');
  const date=String(plan.date||(leg==='arrival'?stay.checkIn:stay.checkOut)||''),expectedFrom=leg==='arrival'?canonicalLocation(plan.from||'Velana Airport'):'Dhiffushi',expectedTo=leg==='arrival'?'Dhiffushi':canonicalLocation(plan.destination||'Velana Airport');
  if(canonicalLocation(sailing.from)!==expectedFrom||canonicalLocation(sailing.to)!==expectedTo)throw Error('That launch does not match the guest transport route.');
  if(Date.parse(date+'T'+sailing.depart+':00+05:00')<=Date.now())throw Error('Choose a future launch departure.');
  const oldId=String(plan.transportBookingId||plan.previousTransportBookingId||''),old=oldId?state.bookings.find(item=>item.id===oldId):undefined,wasScheduled=!!old&&!!plan.launch;
  const adults=Math.max(1,Number(stay.adults??stay.pax??1)),children=Math.max(0,Number(stay.children??0)),infants=0,seatCount=adults+children;
  const used=state.bookings.filter(item=>item.id!==oldId&&item.status!=='Cancelled').flatMap(item=>item.journeys.filter(j=>j.scheduleId===sailing.id&&j.date===date).flatMap(j=>j.seats));
  const seats=Array.from({length:sailing.capacity},(_,i)=>i+1).filter(n=>!used.includes(n)).slice(0,seatCount);if(seats.length!==seatCount)throw Error('This launch no longer has enough seats. Choose another departure.');
  const journey={scheduleId:sailing.id,date,seats,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,fare:sailing.fare},total=sailing.fare*adults+Math.round(sailing.fare/2)*children,now=new Date().toISOString();
  const booking:any=old||{id:'NT-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:crypto.randomUUID(),owner:'stay:'+stay.id,created:now,paid:false};
  Object.assign(booking,{name:stay.guest,phone:stay.whatsapp||'',traveller:'Tourist',adults,children,infants,journeys:[journey],total,status:'Confirmed',checked:[],notes:'Room transport plan · '+leg+(plan.flightNumber?' · Flight '+plan.flightNumber:'')+(plan.flightTime?' · '+plan.flightTime:''),stayId:stay.id,room:stay.room,transportPlanLeg:leg});
  if(!old)state.bookings.push(booking);
  plan.launch={scheduleId:sailing.id,date,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,seats};plan.transportBookingId=booking.id;plan.status='Scheduled';delete plan.needsReview;delete plan.previousTransportBookingId;
  syncTransportBuggy(hotel.state,stay,leg,journey);const roomBill=syncTransportPlanBill(hotel.state,stay,booking,sailing,leg,u.username);stay.history??=[];stay.history.unshift({date:now,by:u.username,detail:(leg==='arrival'?'Arrival':'Departure')+' transport scheduled · '+sailing.depart+' '+sailing.boat+' · USD '+(roomBill.cents/100).toFixed(2)+' added to room bill · Buggy linked automatically'});if(stay.email)transportMail={email:stay.email,guest:stay.guest,reference:stay.id,room:stay.room,manageToken:stay.manageToken,leg,boat:sailing.boat,from:sailing.from,to:sailing.to,date,depart:sailing.depart,arrive:sailing.arrive,seats,chargeCents:roomBill.cents,changed:wasScheduled};
  hotelWrite=hotel;
 }
 else if(b.action==='manual-guest-transfer'){
  if(u.role!=='admin')return Response.json({error:'Only Admin can create a linked guest transfer manually.'},{status:403});
  const hotel=await loadHotelPrimary(),stay=hotel.state.stays.find((item:any)=>item.id===String(b.stayId||'')&&['Confirmed','In House'].includes(String(item.status||'')));
  const leg=b.leg==='arrival'||b.leg==='departure'?b.leg:null;if(!stay||!leg)throw Error('Choose a confirmed or in-house guest and Arrival or Departure.');
  const sailing=state.sailings.find(s=>s.id===String(b.scheduleId||'')&&s.active);if(!sailing)throw Error('Choose an active speedboat departure.');
  if(!Number.isInteger(sailing.roomFare)||Number(sailing.roomFare)<0)throw Error('Set the USD room fare for this launch before assigning it to a guest.');
  const date=String(b.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Choose a valid travel date.');
  if(Date.parse(date+'T'+sailing.depart+':00+05:00')<=Date.now())throw Error('Choose a future launch departure.');
  if(leg==='arrival'&&canonicalLocation(sailing.to)!=='Dhiffushi')throw Error('Arrival transfers must arrive in Dhiffushi.');
  if(leg==='departure'&&canonicalLocation(sailing.from)!=='Dhiffushi')throw Error('Departure transfers must leave Dhiffushi.');
  stay.transportPlan??={};
  const plan=stay.transportPlan[leg]||{};
  const oldId=String(plan.transportBookingId||plan.previousTransportBookingId||''),old=oldId?state.bookings.find(item=>item.id===oldId):undefined,wasScheduled=!!old&&!!plan.launch;
  const adults=Math.max(1,Number(stay.adults??stay.pax??1)),children=Math.max(0,Number(stay.children??0)),infants=0,seatCount=adults+children;
  const requestedSeats=Array.isArray(b.seats)?b.seats.map(Number):[];
  if(requestedSeats.length!==seatCount||new Set(requestedSeats).size!==seatCount||requestedSeats.some((n:number)=>!Number.isInteger(n)||n<1||n>sailing.capacity))throw Error('Select one valid seat for every adult and child.');
  const used=state.bookings.filter(item=>item.id!==oldId&&item.status!=='Cancelled').flatMap(item=>item.journeys.filter(j=>j.scheduleId===sailing.id&&j.date===date).flatMap(j=>j.seats));
  if(requestedSeats.some((n:number)=>used.includes(n)))throw Error('One or more selected seats were just booked. Choose available seats.');
  const free=b.free===true,discountPercent=Math.max(0,Math.min(100,Number(b.discountPercent)||0));let priceCents:any=undefined;
  if(b.priceCents!==undefined&&b.priceCents!==null&&b.priceCents!==''){const value=Number(b.priceCents);if(!Number.isInteger(value)||value<0||value>1000000)throw Error('Enter a valid custom USD total.');priceCents=value;}
  const now=new Date().toISOString(),journey={scheduleId:sailing.id,date,seats:requestedSeats,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,fare:sailing.fare},total=sailing.fare*adults+Math.round(sailing.fare/2)*children;
  const booking:any=old||{id:'NT-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:crypto.randomUUID(),owner:'stay:'+stay.id,created:now,paid:false};
  Object.assign(booking,{name:stay.guest,phone:stay.whatsapp||'',traveller:'Tourist',adults,children,infants,journeys:[journey],total,status:'Confirmed',checked:[],notes:'Admin manual room transfer · '+leg,stayId:stay.id,room:stay.room,transportPlanLeg:leg});
  if(!old)state.bookings.push(booking);
  const nextPlan:any={...plan,needTransfer:'yes',date,status:'Scheduled',launch:{scheduleId:sailing.id,date,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,seats:requestedSeats},transportBookingId:booking.id,billing:{...plan.billing,free,discountPercent,...(priceCents===undefined?{}:{priceCents})}};
  if(leg==='arrival')nextPlan.from=sailing.from;else nextPlan.destination=sailing.to;
  delete nextPlan.needsReview;delete nextPlan.previousTransportBookingId;delete nextPlan.cancelTransportBookingId;
  stay.transportPlan[leg]=nextPlan;
  syncTransportBuggy(hotel.state,stay,leg,journey);const roomBill=syncTransportPlanBill(hotel.state,stay,booking,sailing,leg,u.username);
  stay.history??=[];stay.history.unshift({date:now,by:u.username,detail:'Admin manually assigned '+leg+' transfer · '+date+' '+sailing.depart+' '+sailing.boat+' · seats '+requestedSeats.join(', ')+' · USD '+(roomBill.cents/100).toFixed(2)});
  if(stay.email)transportMail={email:stay.email,guest:stay.guest,reference:stay.id,room:stay.room,manageToken:stay.manageToken,leg,boat:sailing.boat,from:sailing.from,to:sailing.to,date,depart:sailing.depart,arrive:sailing.arrive,seats:requestedSeats,chargeCents:roomBill.cents,changed:wasScheduled};
  hotelWrite=hotel;
 }
 else if(b.action==='plan-billing'){
  if(u.role!=='admin')return Response.json({error:'Only Admin can change room transport charges.'},{status:403});
  const hotel=await loadHotelPrimary(),stay=hotel.state.stays.find((item:any)=>item.id===String(b.stayId||'')&&['Confirmed','In House'].includes(String(item.status||'')));
  const leg=b.leg==='arrival'||b.leg==='departure'?b.leg:null;if(!stay||!leg)throw Error('Guest transport plan not found.');
  const plan=stay.transportPlan?.[leg],booking=state.bookings.find(item=>item.id===plan?.transportBookingId&&item.status!=='Cancelled');if(!plan||!booking)throw Error('Schedule the guest launch before changing its room charge.');
  const journey=booking.journeys?.[0],sailing=state.sailings.find(s=>s.id===journey?.scheduleId);if(!sailing)throw Error('Linked launch schedule not found.');
  const free=b.free===true,discountPercent=Math.max(0,Math.min(100,Number(b.discountPercent)||0));
  let priceCents:any=undefined;if(b.priceCents!==undefined&&b.priceCents!==null&&b.priceCents!==''){const value=Number(b.priceCents);if(!Number.isInteger(value)||value<0||value>1000000)throw Error('Enter a valid USD transport price.');priceCents=value;}
  plan.billing={...plan.billing,free,discountPercent,...(priceCents===undefined?{priceCents:undefined}:{priceCents}),updatedAt:new Date().toISOString(),updatedBy:u.username};
  if(priceCents===undefined)delete plan.billing.priceCents;
  const bill=syncTransportPlanBill(hotel.state,stay,booking,sailing,leg,u.username);
  stay.history??=[];stay.history.unshift({date:new Date().toISOString(),by:u.username,detail:(leg==='arrival'?'Arrival':'Departure')+' transfer room charge updated · USD '+(bill.cents/100).toFixed(2)+(free?' · Marked free':discountPercent?' · '+discountPercent+'% discount':'')});
  hotelWrite=hotel;

 }
 else if(b.action==='book'){
 const booking=createTransfer(state,b,u.userId);
 if(b.payment==='room'){
 if(u.role!=='guest'||isTransportAgent(u))return Response.json({error:'Only a linked guest login can charge transport to a room.'},{status:403});
 const hotel=await loadHotelPrimary();const eligible=hotel.state.stays.filter((s:any)=>s.accountId===u.userId&&['In House','Confirmed'].includes(s.status)&&booking.journeys.every(j=>j.date>=s.checkIn&&j.date<=s.checkOut));
 if(eligible.length!==1)throw Error('An eligible room must be linked to your guest login for all travel dates. Ask reception for help.');
 const stay=eligible[0];let cents=0;
 for(const j of booking.journeys){const fare=state.sailings.find(s=>s.id===j.scheduleId)?.roomFare;if(!Number.isInteger(fare)||fare!<0)throw Error('Reception must set the USD room fare before this departure can be charged to your room.');cents+=fare!*b.adults+Math.round(fare!/2)*b.children;}
 if(cents!==b.expectedRoomCents)throw Error('The room fare changed. Review the USD total before booking.');
 booking.stayId=stay.id;booking.room=stay.room;booking.roomCents=cents;
 hotel.state.orders.push({id:booking.id,token:booking.token,accountId:u.userId,stayId:stay.id,guest:stay.guest,room:stay.room,kind:'transfer',name:booking.journeys.map(j=>j.from+' → '+j.to+' · '+j.date+' '+j.depart+' · '+j.boat+' · seats '+j.seats.join(', ')).join(' / '),quantity:1,cents,notes:booking.notes,date:booking.journeys[0].date,time:booking.journeys[0].depart,status:'Confirmed',createdAt:booking.created,transportBooking:true});
 hotelWrite=hotel;
 }else if(b.payment!==undefined&&b.payment!=='later')throw Error('Choose a payment method.');
 state.bookings.push(booking);
 }
 else if(b.action==='sailing'){
 if(!canEdit)return Response.json({error:'Transfer editing permission required.'},{status:403});const s=b.sailing;
 if(!s||['boat','from','to'].some(k=>typeof s[k]!=='string'||!s[k].trim()||s[k].length>100)||s.from===s.to||!['depart','arrive'].every(k=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k]))||s.arrive<=s.depart||!Number.isInteger(s.capacity)||s.capacity<1||s.capacity>100||!Number.isInteger(s.fare)||s.fare<0||s.fare>10000000||typeof s.active!=='boolean')throw Error('Check route, same-day departure and arrival times, fare and capacity.');
 if(s.roomFare!==undefined&&(!Number.isInteger(s.roomFare)||s.roomFare<0||s.roomFare>10000000))throw Error('Enter a valid USD room fare.');
 const previous=state.sailings.find(x=>x.id===s.id);if(s.id&&!previous)throw Error('Departure not found.');
 if(previous&&state.bookings.some(x=>x.status!=='Cancelled'&&x.journeys.some(j=>j.scheduleId===s.id&&Date.parse(j.date+'T'+j.depart+':00+05:00')>Date.now()))&&['boat','from','to','depart','arrive','capacity'].some(k=>previous[k as keyof Sailing]!==s[k]))throw Error('This departure has future bookings. Create a new schedule to change its route, time, boat or capacity.');
 const sailing:Sailing={id:previous?.id||crypto.randomUUID(),boat:s.boat.trim(),from:s.from.trim(),to:s.to.trim(),depart:s.depart,arrive:s.arrive,capacity:s.capacity,fare:s.fare,roomFare:s.roomFare,active:s.active};state.sailings=previous?state.sailings.map(x=>x.id===s.id?sailing:x):[...state.sailings,sailing];
 }else if(b.action==='status'){
 if(!canEdit)return Response.json({error:'Transfer editing permission required.'},{status:403});const booking=state.bookings.find(x=>x.id===b.id);if(!booking)throw Error('Booking not found.');
 if(booking.stayId&&Number.isInteger(booking.roomCents)&&['cancel','paid'].includes(b.operation))throw Error('This ticket is charged to a room. Manage payment through the guest room bill; contact Admin for cancellation.');
 if(b.operation==='cancel'){booking.status='Cancelled';booking.checked=[];}
 else if(booking.status==='Cancelled')throw Error('This booking is cancelled.');
 else if(b.operation==='paid')toggleTransferPayment(booking,u.username);
 else if(b.operation==='checkin'&&booking.journeys.some(j=>j.scheduleId===b.scheduleId)){booking.checked=booking.checked.includes(b.scheduleId)?booking.checked.filter(x=>x!==b.scheduleId):[...booking.checked,b.scheduleId];}
 else throw Error('Invalid booking action.');
 }else throw Error('Unknown action.');
 if(hotelWrite){
 let pair:any=null,primaryAvailable=true,primaryConflict=false;
 try{
  pair=await saveOperationalPairPrimary(key,state,revision,stayKey,hotelWrite.state,hotelWrite.revision,u.userId);
 }catch(error){
  const message=error instanceof Error?error.message:String(error||'');
  if(message.includes('CAS_CONFLICT'))primaryConflict=true;else primaryAvailable=false;
 }
 if(primaryConflict)return Response.json({error:'Room or seat availability changed. Refresh and try again.'},{status:409});
 if(primaryAvailable&&pair?.revisionA&&pair?.revisionB){
  try{
   await authDb().batch([
    authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(state),pair.revisionA,u.userId),
    authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(stayKey,JSON.stringify(hotelWrite.state),pair.revisionB,u.userId)
   ]);
  }catch{}
  try{await Promise.all([mirrorTransportState(state),mirrorHotelState(hotelWrite.state)]);}catch{}
  if(transportMail)try{await sendTransportScheduleEmail(transportMail)}catch{}
  return Response.json(await visible(state,pair.revisionA,u));
 }
 const writeToken=crypto.randomUUID();const payload=JSON.stringify({...state,writeToken});
 const transportSql=revision===0?authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM operation_records WHERE key=? AND revision=?)').bind(key,payload,u.userId,stayKey,hotelWrite.revision):authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=? AND EXISTS(SELECT 1 FROM operation_records WHERE key=? AND revision=?)').bind(payload,u.userId,key,revision,stayKey,hotelWrite.revision);
 const hotelSql=authDb().prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=? AND EXISTS(SELECT 1 FROM operation_records WHERE key=? AND json_extract(payload,'$.writeToken')=?)").bind(JSON.stringify(hotelWrite.state),u.userId,stayKey,hotelWrite.revision,key,writeToken);
 const results=await authDb().batch([transportSql,hotelSql]);
 if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:'Room or seat availability changed. Refresh and try again.'},{status:409});
 try{await Promise.all([
  mirrorTransportState(state),
  mirrorOperationalRecord(key,state,revision+1,u.userId),
  mirrorHotelState(hotelWrite.state),
  mirrorOperationalRecord(stayKey,hotelWrite.state,hotelWrite.revision+1,u.userId)
 ]);}catch{}
 if(transportMail)try{await sendTransportScheduleEmail(transportMail)}catch{}
 return Response.json(await visible(state,revision+1,u));
 }
 let primaryRevision=0,primaryAvailable=true;
 try{primaryRevision=await saveOperationalRecordPrimary(key,state,revision,u.userId);}catch{primaryAvailable=false;}
 if(primaryAvailable){
  if(!primaryRevision)return Response.json({error:'Another booking was saved first. Refresh and review your seats.'},{status:409});
  // Supabase is primary for standalone transport changes; D1 remains the rollback copy.
  try{
   await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(state),primaryRevision,u.userId).run();
  }catch{}
  try{await mirrorTransportState(state);}catch{}
  return Response.json(await visible(state,primaryRevision,u));
 }
 const payload=JSON.stringify(state);const result=revision===0?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,payload,u.userId).run():await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,u.userId,key,revision).run();
 if(!result.meta.changes)return Response.json({error:'Another booking was saved first. Refresh and review your seats.'},{status:409});
 try{await Promise.all([mirrorTransportState(state),mirrorOperationalRecord(key,state,revision+1,u.userId)]);}catch{}
 return Response.json(await visible(state,revision+1,u));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to save transfers.'},{status:400});}}