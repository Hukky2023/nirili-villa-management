export const bookingManageHost='https://booking.nirilihotels.com';

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

export function ensureBookingManageState(state:any){
 state.requests??=[];
 state.stays??=[];
 state.bookingChanges??=[];
 state.deletedBookings??=[];
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
  room:target.kind==='request'?'':String(booking.room||''),
  status:target.kind==='archived'?'Cancelled':String(booking.status||''),
  totalCents:Number(booking.base??booking.estimate??0),
  nights,
  refundRequiredCents:Number(booking.refundRequiredCents||target.archive?.refundRequiredCents||0),
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
 return rooms.filter((room:any)=>{
  const capacity=Number(room.capacity)||3;
  if(room.status==='Maintenance'||capacity<pax)return false;
  return !stays.some((stay:any)=>stay.id!==excludeStayId&&stay.room===room.number&&!['Checked Out','Cancelled'].includes(stay.status)&&stay.checkIn<checkOut&&stay.checkOut>checkIn);
 });
}
