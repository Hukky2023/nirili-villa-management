import {bookingGuests} from '../../../lib/booking-guests';
import {editBooking,deleteBooking} from '../../../lib/booking-admin';
import {createDirectBooking} from '../../../lib/direct-booking';
import {saveStayAccess} from '../../../lib/stay-login';
import {restaurantOnly} from '../../../lib/pos-access';
import {billPaymentKey} from '../../../lib/bill-payment';
import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {loadStays,stayView,stayKey,folioFor} from '../../../lib/stays';
import {updateRoomInventory} from '../../../lib/rooms';
import {readOperationalRecordPrimary} from '../../../lib/supabase-bridge';
import {appendAccountHistory} from '../../../lib/account-history';
function canViewHotel(u:any){
 if(!u)return false;
 if(u.role==='admin')return true;
 if(u.role!=='staff')return false;
 if(u.permissions.length===0)return true;
 return u.permissions.some((p:string)=>['guesthouse_reception','edit_bills','edit_excursions','edit_transfers'].includes(p));
}
async function loadHotelPrimary(){
 try{
  const primary=await readOperationalRecordPrimary(stayKey);
  if(primary?.payload){
   const state=primary.payload;state.requests??=[];state.orders??=[];state.posOrders??=[];state.stays??=[];state.rooms??=[];updateRoomInventory(state);
   return {state,revision:Number(primary.revision)||0};
  }
 }catch{}
 return loadStays();
}
async function projectStayState(state:any,revision:number){
 updateRoomInventory(state);state.requests??=[];state.orders??=[];state.posOrders??=[];state.stays??=[];
 return {...state,revision,stays:await Promise.all(state.stays.map(async(s:any)=>({...s,folio:await folioFor(s,state.orders)})))};
}
export async function GET(){const u=await currentUser();if(!canViewHotel(u)||restaurantOnly(u))return Response.json({error:'Hotel management access required'},{status:403});try{
 let primary:any=null;
 try{primary=await readOperationalRecordPrimary(stayKey);}catch{}
 if(primary?.payload){
  const state=primary.payload;
  return Response.json(await projectStayState(state,Number(primary.revision)||0),{headers:{'Cache-Control':'no-store'}});
 }
 return Response.json(await stayView(),{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Could not load stays. Please retry.'},{status:503})}}
export async function POST(r:Request){const u=await currentUser();if(!u||u.role==='guest'||!sameOrigin(r))return Response.json({error:'Staff login required'},{status:403});try{const b=await r.json();const canManageStay=hasPermission(u,'guesthouse_reception')||hasPermission(u,'edit_bills');if(!canManageStay)return Response.json({error:'Reception or bill editing permission is required.'},{status:403});const {state,revision}=await loadHotelPrimary();
if(b.action==='create'){
 if(restaurantOnly(u))return Response.json({error:'Hotel booking access required.'},{status:403});
 const previous=state.stays.find((s:any)=>s.creationRequest===b.requestId&&s.createdBy===u.username);
 if(previous)return Response.json({booking:previous});
 if(b.revision!==revision)return Response.json({error:'Room availability changed. Review the available rooms and confirm again.'},{status:409});
 const details=b.guests===undefined?null:await bookingGuests(b.guests,b.pax,[],b.adults??b.pax,b.children??0);
 const booking=createDirectBooking(state,{...b,guest:details?.guests[0].name??b.guest},u.username);
 if(details)Object.assign(booking,{guests:details.guests,adults:details.adults,children:details.children,whatsapp:details.guests[0].phone});
 if(!await saveStayAccess(state,revision,u.userId,null,[],details?.documents||[]))return Response.json({error:'Another booking changed room availability. Review the rooms and try again.'},{status:409});
 return Response.json({booking},{status:201});
}
if(b.action==='editbooking'||b.action==='deletebooking'){
 if(u.role!=='admin')return Response.json({error:'Only Admin can edit or delete bookings.'},{status:403});
 if(b.revision!==revision)return Response.json({error:'Booking changed. Reopen the booking and try again.'},{status:409});
 const booking=state.stays.find((x:any)=>x.id===b.id);if(!booking)return Response.json({error:'Booking not found.'},{status:404});
 let plan:any=null;let revoke:string[]=[];let details:any=null;
 if(b.action==='deletebooking'){
  if(b.confirmId!==booking.id)throw Error('Confirm the booking reference to delete it.');
  deleteBooking(state,booking,u.username);
  if(booking.accountId&&!state.stays.some((x:any)=>x.accountId===booking.accountId&&['Confirmed','In House'].includes(x.status)))revoke.push(booking.accountId);
 }else{
  details=b.guests===undefined?null:await bookingGuests(b.guests,b.pax,booking.guests||[],b.adults??booking.adults??b.pax,b.children??booking.children??0);
  const previous=editBooking(state,booking,{...b,guest:details?.guests[0].name??b.guest},u.username);
  if(details)Object.assign(booking,{guests:details.guests,adults:details.adults,children:details.children,whatsapp:details.guests[0].phone});
  if(booking.status==='In House'&&previous.room!==booking.room){delete booking.accountId;delete booking.roomLogin;delete booking.loginIssuedAt;plan=null;}
 }
 if(!await saveStayAccess(state,revision,u.userId,plan,revoke,details?.documents||[],details?.removed||[]))return Response.json({error:'Booking changed. Reopen it and try again.'},{status:409});
 return Response.json({booking:b.action==='editbooking'?booking:null,deleted:b.action==='deletebooking'});
}
if(['payment','markpaid','markunpaid'].includes(b.action)&&!hasPermission(u,'edit_bills'))return Response.json({error:'Bill editing permission is required for payment actions.'},{status:403});const roomAction=['roomstatus','note'].includes(b.action);const s=roomAction?{room:b.room,history:[]}:state.stays.find((s:any)=>s.id===b.id);if(!s)return Response.json({error:'Booking not found'},{status:404});if(b.action==='payment'&&s.payments.some((p:any)=>p.id===b.requestId))return Response.json(await projectStayState(state,revision));if(b.revision!==revision)return Response.json({error:'This stay changed elsewhere. Refresh before trying again.'},{status:409});let detail='';let loginPlan:any=null;let revoke:string[]=[];const room=state.rooms.find((x:any)=>x.number===s.room);if(!room)throw Error('Room not found.');const f=roomAction?null:await folioFor(s,state.orders);
if(b.action==='markpaid'){s.markedUnpaid=false;if(f.balanceCents<0)throw Error('This booking has a credit balance. Review it before marking paid.');if(f.balanceCents>0)s.payments.push({id:crypto.randomUUID(),cents:f.balanceCents,method:'Marked paid',reference:'Full balance marked paid',date:new Date().toISOString(),by:u.username});s.paidBills={...(s.paidBills||{}),...Object.fromEntries(f.bills.filter((x:any)=>x.status!=='Cancelled').map((x:any)=>[billPaymentKey(x),x.totalCents]))};detail='All current bills marked paid · Payment received $'+(Math.max(0,f.balanceCents)/100).toFixed(2);}
else if(b.action==='markunpaid'){
const date=new Date().toISOString();let reversed=0;
for(const payment of [...s.payments]){if(payment.method==='Marked paid'&&!payment.reversedAt&&payment.cents>0){payment.reversedAt=date;payment.reversedBy=u.username;s.payments.push({id:crypto.randomUUID(),cents:-payment.cents,method:'Payment reversal',reference:'Undo Mark as Paid',reverses:payment.id,date,by:u.username});reversed+=payment.cents;}}
s.paidBills={};s.markedUnpaid=true;detail='All current bills marked unpaid · Mark as Paid reversed $'+(reversed/100).toFixed(2)+' · Earlier payments retained';
}
else if(b.action==='contact'){const phone=String(b.whatsapp||'').replace(/[ ()-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('Enter the full WhatsApp number with country code, for example +960 followed by the number.');s.whatsapp=phone;detail='Guest WhatsApp number updated';}
else if(b.action==='note'){if(typeof b.note!=='string'||b.note.length>2000)throw Error('Keep room notes under 2,000 characters.');room.note=b.note;detail='Room note updated';}
else if(b.action==='roomstatus'){if(!['Available','Cleaning','Maintenance'].includes(b.status))throw Error('Choose a valid room status.');if(state.stays.some((x:any)=>x.room===b.room&&x.status==='In House'))throw Error('Move or check out the guest before changing room status.');room.status=b.status;detail='Room status changed to '+b.status;}
else if(b.action==='payment'){if(typeof b.requestId!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.requestId)||!Number.isInteger(b.cents)||b.cents<=0||b.cents>Math.max(0,f.balanceCents)||!['Cash','Card','Bank transfer'].includes(b.method)||typeof b.reference!=='string'||b.reference.length>200)throw Error('Enter a valid payment no greater than the outstanding balance.');s.payments.push({id:b.requestId,cents:b.cents,method:b.method,reference:b.reference,date:new Date().toISOString(),by:u.username});detail='Payment received: $'+(b.cents/100).toFixed(2)+' · '+b.method;}
else if(b.action==='move'){if(s.status==='Checked Out')throw Error('This guest has already checked out.');const target=state.rooms.find((x:any)=>x.number===b.target);if(!target||target.number===s.room||target.status!=='Available'||state.stays.some((x:any)=>x.id!==s.id&&x.room===b.target&&x.status!=='Checked Out'&&x.checkIn<s.checkOut&&x.checkOut>s.checkIn))throw Error('That room is unavailable for these stay dates.');detail='Moved from room '+s.room+' to '+b.target;if(s.status==='In House'){room.status='Cleaning';target.status='Occupied';}s.room=b.target;if(s.status==='In House'){delete s.accountId;delete s.roomLogin;delete s.loginIssuedAt;loginPlan=null;}}
else if(b.action==='extend'){if(s.status==='Checked Out')throw Error('This guest has already checked out.');const d=String(b.date);const nights=(Date.parse(d)-Date.parse(s.checkOut))/86400000;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d).toISOString().slice(0,10)!==d||!Number.isInteger(nights)||nights<1||nights>365||!Number.isInteger(b.rateCents)||b.rateCents<0||b.rateCents>1000000)throw Error('Choose a later checkout date and a valid nightly rate.');if(state.stays.some((x:any)=>x.id!==s.id&&x.room===s.room&&x.status!=='Checked Out'&&x.checkIn<d&&x.checkOut>s.checkOut))throw Error('This room has another booking during the extension.');s.extensions.push({id:'EXT-'+crypto.randomUUID(),from:s.checkOut,to:d,nights,cents:nights*b.rateCents});s.checkOut=d;detail='Stay extended to '+d+' · '+nights+(nights===1?' night':' nights');}
else if(b.action==='checkout'){
 if(s.status!=='In House')throw Error('Only checked-in guests can check out.');
 if(f.balanceCents!==0)throw Error('Settle the outstanding balance before checking out.');
 const checkedOutAt=new Date().toISOString();
 if(s.accountId){
  // Every in-house stay login is terminated immediately at checkout.
  // saveStayAccess deactivates the guest account and deletes all active sessions.
  revoke.push(s.accountId);
  s.loginTerminatedAt=checkedOutAt;
  s.loginTerminatedAccountId=s.accountId;
 }
 s.status='Checked Out';s.checkedOutAt=checkedOutAt;room.status='Cleaning';
 detail='Guest checked out · In-house login terminated · Room marked Cleaning';
}
else throw Error('Unknown action');
s.history.unshift({date:new Date().toISOString(),detail,by:u.username});const saved=await saveStayAccess(state,revision,u.userId,loginPlan,revoke);if(!saved)return Response.json({error:'This stay changed elsewhere. Refresh before trying again.'},{status:409});if(b.action==='checkout'&&s.accountId)await appendAccountHistory(s.accountId,{at:s.checkedOutAt||new Date().toISOString(),action:'In-house login terminated at checkout',by:u.username,detail:'Room '+s.room+' · '+s.id});return Response.json(await projectStayState(state,revision+1));
}catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save. Please retry.'},{status:400})}}
