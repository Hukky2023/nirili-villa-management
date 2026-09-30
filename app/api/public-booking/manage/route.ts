import {limit,sameOrigin} from '../../../../lib/auth';
import {islandToday,nightly,plans,validDate} from '../../../../lib/guest-catalog';
import {bookingCancellationNeedsApproval,bookingForManageToken,bookingManageSnapshot,ensureBookingManageState,roomAvailability,validBookingManageToken} from '../../../../lib/booking-manage';
import {saveStayAccess} from '../../../../lib/stay-login';
import {readOperationalRecordPrimary,updatePublicBookingRequestStatus} from '../../../../lib/supabase-bridge';
import {sendBookingCancelledEmail,sendBookingChangeRequestedEmail,sendBookingUpdatedEmail} from '../../../../lib/booking-email';
import {deleteBooking} from '../../../../lib/booking-admin';
import {folioFor} from '../../../../lib/stays';
import {autoPushBookingComAvailability} from '../../../../lib/channels';
import {normalizeTransportPlan} from '../../../../lib/transport-plan';
import {cancelLinkedTransportBookings} from '../../../../lib/linked-transport-bookings';
import {assertBookingDatesOpen} from '../../../../lib/booking-closures';
import {emitAdminNotification} from '../../../../lib/admin-notifications';

import {loadExcursionMenu} from '../../../../lib/excursion-menu';
import {recoverStayPackages,validatePackageChange} from '../../../../lib/stay-package';
const headers={'Cache-Control':'private, no-store, max-age=0'};
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safe=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value??'').replace(/[\s()-]/g,'');

async function hotelState(){
 const row=await readOperationalRecordPrimary('hotel-stays-v1');
 if(!row?.payload)throw Error('Booking service is temporarily unavailable.');
 return {state:ensureBookingManageState(recoverStayPackages(row.payload,await loadExcursionMenu())),revision:Number(row.revision)||0};
}

function proposal(body:any,state:any){
 const guest=safe(body.guest,100),email=safe(body.email,254).toLowerCase(),whatsapp=cleanPhone(body.whatsapp);
 const checkIn=String(body.checkIn||''),checkOut=String(body.checkOut||''),meal=String(body.meal||'');
 const adults=Number(body.adults),children=Number(body.children),pax=adults+children,notes=safe(body.notes,1000),transportPlan=normalizeTransportPlan(body.transportPlan,checkIn,checkOut);
 const today=islandToday(),nights=(Date.parse(checkOut)-Date.parse(checkIn))/86400000;
 if(!guest||!emailPattern.test(email)||!phonePattern.test(whatsapp))throw Error('Enter a valid guest name, email and WhatsApp number with country code.');
 if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||!Number.isInteger(nights)||nights<1||nights>365)throw Error('Choose valid stay dates.');
 if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>2||pax<1||pax>3)throw Error('A room can accommodate up to 3 guests.');
 if(!plans.includes(meal))throw Error('Choose a valid meal plan.');
 return {guest,email,whatsapp,checkIn,checkOut,meal,adults,children,pax,notes,transportPlan,nights,estimate:nightly(meal,pax,state.roomRates)*nights};
}

function actionRecord(type:string,bookingId:string,current:any,proposed:any=null,status='Pending'){
 return {
  id:'BCH-'+crypto.randomUUID().slice(0,8).toUpperCase(),
  type,bookingId,status,requestedAt:new Date().toISOString(),
  current:{
   guest:current.guest,email:current.email||'',whatsapp:current.whatsapp||'',checkIn:current.checkIn,checkOut:current.checkOut,
   meal:current.meal,pax:current.pax,adults:current.adults??current.pax,children:current.children??0,room:current.room||'',totalCents:current.base??current.estimate??0,transportPlan:current.transportPlan||null
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
   const next=proposal(body,state);validatePackageChange(booking,next);if(booking.packageId)next.estimate=booking.packageQuotedCents;
   if(next.checkIn!==booking.checkIn||next.checkOut!==booking.checkOut)assertBookingDatesOpen(state,next.checkIn,next.checkOut);
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
    try{await emitAdminNotification({id:'hotel:change:'+change.id,type:'hotel',title:'Guest booking changed',detail:String(booking.guest||'Guest')+' · '+booking.id+' · '+String(next.checkIn||'')+' → '+String(next.checkOut||''),ref:booking.id,url:'/home'});}catch{}
    return Response.json({ok:true,applied:true,email:mail,booking:bookingManageSnapshot(state,{kind:'request',item:booking})},{headers});
   }
   if(booking.status!=='Confirmed')throw Error('Only confirmed future stays can be changed online.');
   const change=actionRecord('change',booking.id,booking,next,'Pending');
   state.bookingChanges.push(change);
   if(!await saveStayAccess(state,revision,'public-booking-manage'))throw Error('The booking changed while you were editing it. Refresh and try again.');
   const mail=await sendBookingChangeRequestedEmail({email:booking.email,guest:booking.guest,reference:booking.id,room:booking.room,checkIn:booking.checkIn,checkOut:booking.checkOut,meal:booking.meal,pax:booking.pax,totalCents:booking.base||0,manageToken:token,eventId:change.id,requestType:'change'});
   try{await emitAdminNotification({id:'hotel:change-request:'+change.id,type:'hotel',title:'Guest booking change request',detail:String(booking.guest||'Guest')+' · '+booking.id+' · reception approval required',ref:booking.id,url:'/home'});}catch{}
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
    try{await emitAdminNotification({id:'hotel:cancel:'+change.id,type:'hotel',title:'Guest cancelled booking',detail:String(booking.guest||'Guest')+' · '+booking.id+' · '+String(booking.checkIn||''),ref:booking.id,url:'/home'});}catch{}
    return Response.json({ok:true,cancelled:true,email:mail,booking:bookingManageSnapshot(state,{kind:'request',item:booking})},{headers});
   }
   if(booking.status!=='Confirmed')throw Error('Only confirmed future stays can be cancelled online.');
   if(!bookingCancellationNeedsApproval(booking.checkIn,islandToday())){
    const folio=await folioFor(booking,state.orders),refundRequiredCents=Math.max(0,Number(folio.paidCents)||0);
    const change=actionRecord('cancel',booking.id,booking,null,'Approved');
    Object.assign(change,{decidedAt:new Date().toISOString(),decidedBy:'Guest',decision:'Automatically cancelled by guest before the cancellation cutoff',refundRequiredCents});
    state.bookingChanges.push(change);
    booking.refundRequiredCents=refundRequiredCents;booking.cancelledAt=new Date().toISOString();booking.cancelledBy='Guest';booking.status='Cancelled';
    booking.history??=[];booking.history.unshift({date:booking.cancelledAt,detail:'Booking cancelled by guest before check-in cutoff'+(refundRequiredCents?' · Refund required USD '+(refundRequiredCents/100).toFixed(2):''),by:'Guest'});
    const sourceRequest=state.requests.find((request:any)=>request.stayId===booking.id);
    const revoke=booking.accountId?[booking.accountId]:[];
    deleteBooking(state,booking,'Guest');
    if(sourceRequest){
     sourceRequest.status='Cancelled';sourceRequest.cancelledAt=new Date().toISOString();sourceRequest.reviewedBy='Guest';
    }
    if(!await saveStayAccess(state,revision,'public-booking-manage',null,revoke))throw Error('The booking changed while you were cancelling it. Refresh and try again.');
    try{await cancelLinkedTransportBookings({stayId:booking.id,by:'public-booking-manage'})}catch{}
    if(sourceRequest?.source==='Guest booking website')try{await updatePublicBookingRequestStatus(sourceRequest.id,'Cancelled',{id:sourceRequest.id,status:'Cancelled',stayId:booking.id,room:booking.room});}catch{}
    try{await autoPushBookingComAvailability();}catch{}
    const mail=await sendBookingCancelledEmail({email:booking.email,guest:booking.guest,reference:booking.id,room:booking.room,checkIn:booking.checkIn,checkOut:booking.checkOut,meal:booking.meal,pax:booking.pax,totalCents:booking.base||0,manageToken:token,eventId:change.id,refundRequiredCents});
    const archived=bookingForManageToken(state,token);
    try{await emitAdminNotification({id:'hotel:cancel:'+change.id,type:'hotel',title:'Guest cancelled booking',detail:String(booking.guest||'Guest')+' · '+booking.id+' · '+String(booking.checkIn||'')+(refundRequiredCents?' · refund review required':''),ref:booking.id,url:'/home'});}catch{}
    return Response.json({ok:true,cancelled:true,autoApproved:true,email:mail,booking:bookingManageSnapshot(state,archived)},{headers});
   }
   const change=actionRecord('cancel',booking.id,booking,null,'Pending');
   state.bookingChanges.push(change);
   if(!await saveStayAccess(state,revision,'public-booking-manage'))throw Error('The booking changed while you were cancelling it. Refresh and try again.');
   const mail=await sendBookingChangeRequestedEmail({email:booking.email,guest:booking.guest,reference:booking.id,room:booking.room,checkIn:booking.checkIn,checkOut:booking.checkOut,meal:booking.meal,pax:booking.pax,totalCents:booking.base||0,manageToken:token,eventId:change.id,requestType:'cancel'});
   try{await emitAdminNotification({id:'hotel:cancel-request:'+change.id,type:'hotel',title:'Guest cancellation request',detail:String(booking.guest||'Guest')+' · '+booking.id+' · reception approval required',ref:booking.id,url:'/home'});}catch{}
   return Response.json({ok:true,pending:true,email:mail,booking:bookingManageSnapshot(state,{kind:'stay',item:booking})},{headers});
  }

  return Response.json({error:'Unknown booking action.'},{status:400,headers});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:'Could not manage this booking.'},{status:400,headers});
 }
}

