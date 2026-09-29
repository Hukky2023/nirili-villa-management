import {defaultTransportPlan} from './transport-plan';
import {bookingClosureForStay} from './booking-closures';
export const bookingManageHost='https://stay.nirilihotels.com';

export function createBookingManageToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export function validBookingManageToken(value:unknown):value is string{
 return typeof value==='string'&&/^[a-f0-9]{48}$/i.test(value);
}

export function bookingManageUrl(token:string){
 return bookingManageHost+'/book/manage#'+encodeURIComponent(token);
}

export function bookingCancellationNeedsApproval(checkIn:string,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 // Guests may cancel directly through the day before arrival. Once the
 // check-in date begins in Maldives, reception approval is required.
 return !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)||checkIn<=today;
}

export function ensureBookingManageState(state:any){
 state.requests??=[];
 state.stays??=[];
 state.bookingChanges??=[];
 state.deletedBookings??=[];
 state.bookingClosures??=[];
 return state;
}

export function bookingForManageToken(state:any,token:string){
 ensureBookingManageState(state);
 const stay=state.stays.find((item:any)=>item.manageToken===token);
 if(stay)return {kind:'stay' as const,item:stay};
 const request=state.requests.find((item:any)=>item.manageToken===token);
 if(request){
  const linked=request.stayId&&state.stays.find((item:any)=>item.id===request.stayId);
  if(linked)return {kind:'stay' as const,item:linked,request};
  return {kind:'request' as const,item:request};
 }
 const archived=state.deletedBookings.find((entry:any)=>entry?.stay?.manageToken===token);
 if(archived)return {kind:'archived' as const,item:archived.stay,archive:archived};
 return null;
}

function transportPlanForManage(state:any,booking:any){
 const source=booking.transportPlan||defaultTransportPlan(String(booking.checkIn||''),String(booking.checkOut||''));
 const result={arrival:{...(source.arrival||{})},departure:{...(source.departure||{})}};
 for(const leg of ['arrival','departure'] as const){
  const ride=(state.buggyBookings||[]).find((item:any)=>item.stayId===booking.id&&item.bookingType==='stay-transfer'&&item.transportLeg===leg&&item.cancelled!==true);
  if(!ride)continue;
  const buggy=(state.buggyFleet||[]).find((item:any)=>item.id===ride.buggyId);
  result[leg].buggy={
   id:ride.id,
   status:String(ride.buggyStatus||'Scheduled'),
   date:String(ride.date||''),
   pickupTime:String(ride.pickupTime||''),
   location:String(ride.location||''),
   destination:String(ride.destination||''),
   buggyName:String(buggy?.name||ride.buggyName||ride.buggyId||''),
   driver:String(ride.buggyDriver||buggy?.driver||'')
  };
 }
 return result;
}

export function bookingManageSnapshot(state:any,target:any){
 ensureBookingManageState(state);
 const booking=target?.item;
 if(!booking)return null;
 const reference=String(booking.id||'');
 const pendingAction=state.bookingChanges
  .filter((change:any)=>change.bookingId===reference&&change.status==='Pending')
  .sort((a:any,b:any)=>String(b.requestedAt||'').localeCompare(String(a.requestedAt||'')))[0]||null;
 const nights=Math.max(0,(Date.parse(String(booking.checkOut||''))-Date.parse(String(booking.checkIn||'')))/86400000)||0;
 return {
  kind:target.kind,
  reference,
  guest:String(booking.guest||''),
  email:String(booking.email||''),
  whatsapp:String(booking.whatsapp||''),
  checkIn:String(booking.checkIn||''),
  checkOut:String(booking.checkOut||''),
  adults:Number(booking.adults??booking.pax??1),
  children:Number(booking.children??0),
  pax:Number(booking.pax??1),
  meal:String(booking.meal||''),
  notes:String(booking.notes||''),
  transportPlan:transportPlanForManage(state,booking),
  room:target.kind==='request'?'':String(booking.room||''),
  status:target.kind==='archived'?'Cancelled':String(booking.status||''),
  totalCents:Number(booking.base??booking.estimate??0),
  nights,
  refundRequiredCents:Number(booking.refundRequiredCents||target.archive?.refundRequiredCents||0),
  cancelRequiresApproval:target.kind==='stay'&&booking.status==='Confirmed'?bookingCancellationNeedsApproval(String(booking.checkIn||'')):false,
  pendingAction:pendingAction?{
   id:pendingAction.id,
   type:pendingAction.type,
   status:pendingAction.status,
   requestedAt:pendingAction.requestedAt,
   proposed:pendingAction.proposed||null
  }:null,
  canEdit:target.kind==='request'&&booking.status==='Pending'||target.kind==='stay'&&booking.status==='Confirmed'&&!pendingAction,
  canCancel:target.kind==='request'&&booking.status==='Pending'||target.kind==='stay'&&booking.status==='Confirmed'&&!pendingAction
 };
}

export function roomAvailability(state:any,checkIn:string,checkOut:string,pax:number,excludeStayId=''){
 const rooms=Array.isArray(state?.rooms)?state.rooms:[];
 const stays=Array.isArray(state?.stays)?state.stays:[];
 if(bookingClosureForStay(state,checkIn,checkOut))return [];
 return rooms.filter((room:any)=>{
  const capacity=Number(room.capacity)||3;
  if(room.status==='Maintenance'||capacity<pax)return false;
  return !stays.some((stay:any)=>stay.id!==excludeStayId&&stay.room===room.number&&!['Checked Out','Cancelled'].includes(stay.status)&&stay.checkIn<checkOut&&stay.checkOut>checkIn);
 });
}
