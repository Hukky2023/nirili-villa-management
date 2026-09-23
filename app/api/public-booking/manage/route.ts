import {limit,sameOrigin} from '../../../../lib/auth';
import {islandToday,nightly,plans,validDate} from '../../../../lib/guest-catalog';
import {bookingForManageToken,bookingManageSnapshot,ensureBookingManageState,roomAvailability,validBookingManageToken} from '../../../../lib/booking-manage';
import {saveStayAccess} from '../../../../lib/stay-login';
import {readOperationalRecordPrimary,updatePublicBookingRequestStatus} from '../../../../lib/supabase-bridge';
import {sendBookingCancelledEmail,sendBookingChangeRequestedEmail,sendBookingUpdatedEmail} from '../../../../lib/booking-email';

const headers={'Cache-Control':'private, no-store, max-age=0'};
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safe=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value??'').replace(/[\s()-]/g,'');

async function hotelState(){
 const row=await readOperationalRecordPrimary('hotel-stays-v1');
 if(!row?.payload)throw Error('Booking service is temporarily unavailable.');
 return {state:ensureBookingManageState(row.payload),revision:Number(row.revision)||0};
}

function proposal(body:any){
 const guest=safe(body.guest,100),email=safe(body.email,254).toLowerCase(),whatsapp=cleanPhone(body.whatsapp);
 const checkIn=String(body.checkIn||''),checkOut=String(body.checkOut||''),meal=String(body.meal||'');
 const adults=Number(body.adults),children=Number(body.children),pax=adults+children,notes=safe(body.notes,1000);
 const today=islandToday(),nights=(Date.parse(checkOut)-Date.parse(checkIn))/86400000;
 if(!guest||!emailPattern.test(email)||!phonePattern.test(whatsapp))throw Error('Enter a valid guest name, email and WhatsApp number with country code.');
 if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||!Number.isInteger(nights)||nights<1||nights>365)throw Error('Choose valid stay dates.');
 if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>2||pax<1||pax>3)throw Error('A room can accommodate up to 3 guests.');
 if(!plans.includes(meal))throw Error('Choose a valid meal plan.');
 return {guest,email,whatsapp,checkIn,checkOut,meal,adults,children,pax,notes,nights,estimate:nightly(meal,pax)*nights};
}

function actionRecord(type:string,bookingId:string,current:any,proposed:any=null,status='Pending'){
 return {
  id:'BCH-'+crypto.randomUUID().slice(0,8).toUpperCase(),
  type,bookingId,status,requestedAt:new Date().toISOString(),
  current:{
   guest:current.guest,email:current.email||'',whatsapp:current.whatsapp||'',checkIn:current.checkIn,checkOut:current.checkOut,
   meal:current.meal,pax:current.pax,adults:current.adults??current.pax,children:current.children??0,room:current.room||'',totalCents:current.base??current.estimate??0
  },
  proposed
 };
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body=await request.json(),token=String(body.token||''),action=String(body.action||'view');
  if(!validBookingManageToken(token))return Response.json({error:'This manage-booking link is invalid.'},{status:400,headers});
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('public-booking-manage:'+ip,60,3600000))return Response.json({error:'Too many requests. Please try again later.'},{status:429,headers});
  const {state,revision}=await hotelState();
  const target=bookingForManageToken(state,token);
  if(!target)return Response.json({error:'This manage-booking link is no longer valid.'},{status:404,headers});
  if(action==='view')return Response.json({booking:bookingManageSnapshot(state,target)},{headers});

  const booking=target.item;
  if(target.kind==='archived'||['In House','Checked Out','Cancelled'].includes(String(booking.status||''))){
   return Response.json({error:'This booking can no longer be changed online. Please contact reception.'},{status:409,headers});
  }

  const pending=state.bookingChanges.find((change:any)=>change.bookingId===booking.id&&change.status==='Pending');
  if(pending)return Response.json({error:'A change or cancellation is already waiting for reception approval.',booking:bookingManageSnapshot(state,target)},{status:409,headers});

  if(action==='update'){
   const next=proposal(body);
   if(target.kind==='request'){
    if(booking.status!=='Pending')throw Error('This booking is no longer awaiting confirmation.');
    if(!roomAvailability(state,next.checkIn,next.checkOut,next.pax).length)throw Error('No rooms are available for the new dates and guest count.');
    const change=actionRecord('change',booking.id,booking,next,'Approved');
    Object.assign(change,{decidedAt:new Date().toISOString(),decision:'Automatically applied before room confirmation'});
    Object.assign(booking,next,{updatedAt:new Date().toISOString()});
    state.bookingChanges.push(change);
    if(!await saveStayAccess(state,revision,'public-booking-manage'))throw Error('The booking changed while you were editing it. Refresh and try again.');
    try{await updatePublicBookingRequestStatus(booking.id,'Pending',{...booking,status:'Pending'});}catch{}
    const mail=await sendBookingUpdatedEmail({...next,reference:booking.id,totalCents:next.estimate,manageToken:token,eventId:change.id,statusLabel:'Confirmation pending'});
    return Response.json({ok:true,applied:true,email:mail,booking:bookingManageSnapshot(state,{kind:'request',item:booking})},{headers});
   }
   if(booking.status!=='Confirmed')throw Error('Only confirmed future stays can be changed online.');
   const change=actionRecord('change',booking.id,booking,next,'Pending');
   state.bookingChanges.push(change);
   if(!await saveStayAccess(state,revision,'public-booking-manage'))throw Error('The booking changed while you were editing it. Refresh and try again.');
   const mail=await sendBookingChangeRequestedEmail({email:booking.email,guest:booking.guest,reference:booking.id,room:booking.room,checkIn:booking.checkIn,checkOut:booking.checkOut,meal:booking.meal,pax:booking.pax,totalCents:booking.base||0,manageToken:token,eventId:change.id,requestType:'change'});
   return Response.json({ok:true,pending:true,email:mail,booking:bookingManageSnapshot(state,{kind:'stay',item:booking})},{headers});
  }

  if(action==='cancel'){
   if(target.kind==='request'){
    if(booking.status!=='Pending')throw Error('This booking is no longer awaiting confirmation.');
    const change=actionRecord('cancel',booking.id,booking,null,'Approved');
    Object.assign(change,{decidedAt:new Date().toISOString(),decision:'Cancelled by guest before room confirmation'});
    booking.status='Cancelled';booking.cancelledAt=new Date().toISOString();booking.cancelledBy='Guest';
    state.bookingChanges.push(change);
    if(!await saveStayAccess(state,revision,'public-booking-manage'))throw Error('The booking changed while you were cancelling it. Refresh and try again.');
    try{await updatePublicBookingRequestStatus(booking.id,'Cancelled',{id:booking.id,status:'Cancelled'});}catch{}
    const mail=await sendBookingCancelledEmail({email:booking.email,guest:booking.guest,reference:booking.id,checkIn:booking.checkIn,checkOut:booking.checkOut,meal:booking.meal,pax:booking.pax,totalCents:booking.estimate||0,manageToken:token,eventId:change.id,refundRequiredCents:0});
    return Response.json({ok:true,cancelled:true,email:mail,booking:bookingManageSnapshot(state,{kind:'request',item:booking})},{headers});
   }
   if(booking.status!=='Confirmed')throw Error('Only confirmed future stays can be cancelled online.');
   const change=actionRecord('cancel',booking.id,booking,null,'Pending');
   state.bookingChanges.push(change);
   if(!await saveStayAccess(state,revision,'public-booking-manage'))throw Error('The booking changed while you were cancelling it. Refresh and try again.');
   const mail=await sendBookingChangeRequestedEmail({email:booking.email,guest:booking.guest,reference:booking.id,room:booking.room,checkIn:booking.checkIn,checkOut:booking.checkOut,meal:booking.meal,pax:booking.pax,totalCents:booking.base||0,manageToken:token,eventId:change.id,requestType:'cancel'});
   return Response.json({ok:true,pending:true,email:mail,booking:bookingManageSnapshot(state,{kind:'stay',item:booking})},{headers});
  }

  return Response.json({error:'Unknown booking action.'},{status:400,headers});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:'Could not manage this booking.'},{status:400,headers});
 }
}
