import {env} from 'cloudflare:workers';
import {bookingManageUrl} from './booking-manage';

type MailResult={sent:boolean;id?:string;error?:string};
export type BookingMail={
 email:string;
 guest:string;
 reference:string;
 room?:string;
 checkIn:string;
 checkOut:string;
 meal:string;
 pax:number;
 totalCents:number;
 manageToken?:string;
 eventId?:string;
 statusLabel?:string;
 requestType?:'change'|'cancel';
 refundRequiredCents?:number;
 reason?:string;
};

const money=(cents:number)=>'$'+(Math.max(0,Math.round(Number(cents)||0))/100).toFixed(2);
const text=(value:any)=>String(value??'').trim();
const htmlEscapes:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escapeHtml=(value:any)=>text(value).replace(/[&<>"']/g,char=>htmlEscapes[char]||char);

function config(){
 const e=env as unknown as Record<string,string|undefined>;
 return {
  apiKey:text(e.RESEND_API_KEY),
  from:text(e.BOOKING_EMAIL_FROM)||'Nirili Villa <bookings@nirilihotels.com>',
  replyTo:text(e.BOOKING_EMAIL_REPLY_TO)
 };
}

async function sendEmail(input:{to:string;subject:string;html:string;text:string;idempotencyKey:string}):Promise<MailResult>{
 const {apiKey,from,replyTo}=config();
 if(!apiKey)return {sent:false,error:'Confirmation email service is not configured.'};
 try{
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{
    'Authorization':'Bearer '+apiKey,
    'Content-Type':'application/json',
    'Idempotency-Key':input.idempotencyKey
   },
   body:JSON.stringify({
    from,
    to:[input.to],
    subject:input.subject,
    html:input.html,
    text:input.text,
    ...(replyTo?{reply_to:replyTo}:{})
   })
  });
  if(!response.ok)return {sent:false,error:'Email provider rejected the confirmation message.'};
  const data:any=await response.json().catch(()=>({}));
  return {sent:true,id:text(data?.id)||undefined};
 }catch{
  return {sent:false,error:'Confirmation email service is temporarily unavailable.'};
 }
}

function shell(title:string,body:string){
 return `<!doctype html><html><body style="margin:0;background:#f2f8f9;font-family:Arial,sans-serif;color:#153645">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f8f9;padding:28px 12px"><tr><td align="center">
   <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dce9eb">
    <tr><td style="background:#0b536c;color:#ffffff;padding:28px 32px"><div style="font-size:12px;letter-spacing:2px;opacity:.85">NIRILI VILLA · DHIFFUSHI · MALDIVES</div><h1 style="margin:10px 0 0;font-size:30px;line-height:1.1">${escapeHtml(title)}</h1></td></tr>
    <tr><td style="padding:30px 32px">${body}<p style="margin:30px 0 0;color:#71858e;font-size:12px;line-height:1.6">Arrive as a Guest, Leave as a Friend.</p></td></tr>
   </table>
  </td></tr></table>
 </body></html>`;
}

function bookingTable(booking:BookingMail,label='Accommodation total'){
 return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef9f7;border-radius:14px;padding:18px">
  <tr><td style="padding:6px 0;color:#6a7f88">Booking number</td><td align="right" style="font-weight:700">${escapeHtml(booking.reference)}</td></tr>
  ${booking.room?`<tr><td style="padding:6px 0;color:#6a7f88">Room</td><td align="right" style="font-weight:700">${escapeHtml(booking.room)}</td></tr>`:''}
  <tr><td style="padding:6px 0;color:#6a7f88">Check-in</td><td align="right">${escapeHtml(booking.checkIn)}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">Check-out</td><td align="right">${escapeHtml(booking.checkOut)}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">Guests</td><td align="right">${booking.pax}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">Meal plan</td><td align="right">${escapeHtml(booking.meal)}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">${escapeHtml(label)}</td><td align="right" style="font-weight:700">${money(booking.totalCents)}</td></tr>
 </table>`;
}

function manageButton(token?:string){
 if(!token)return '';
 const url=bookingManageUrl(token);
 return `<p style="margin:26px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0b536c;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">Manage Booking</a></p><p style="font-size:12px;color:#71858e;line-height:1.5">This is your private booking-management link. Do not forward it to anyone you do not want to manage your reservation.</p>`;
}

function managePlain(token?:string){return token?'\nManage booking: '+bookingManageUrl(token)+'\n':'';}

export async function sendBookingReceivedEmail(booking:BookingMail):Promise<MailResult>{
 const html=shell('We received your booking',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Thank you for booking directly with Nirili Villa. We have received your booking and our reception team will confirm the room allocation.</p>
  ${bookingTable(booking,'Estimated accommodation')}
  <p style="font-size:14px;line-height:1.7">Your booking is currently <strong>confirmation pending</strong>. You will receive another email with your Nirili Villa booking number and assigned room after approval.</p>
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - booking received\n\nDear ${booking.guest},\nWe received your booking.\nReference: ${booking.reference}\nStay: ${booking.checkIn} to ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\nEstimated accommodation: ${money(booking.totalCents)}\n\nStatus: confirmation pending. You will receive another email after the room is approved.\n${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:'Nirili Villa booking received · '+booking.reference,html,text:plain,idempotencyKey:'room-booking-received/'+booking.reference});
}

export async function sendBookingConfirmationEmail(booking:BookingMail):Promise<MailResult>{
 const html=shell('Your stay is confirmed',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Your Nirili Villa booking is confirmed. We look forward to welcoming you to Dhiffushi.</p>
  ${bookingTable(booking)}
  <p style="font-size:14px;line-height:1.7">Please keep your booking number for check-in and future communication with reception.</p>
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - booking confirmed\n\nDear ${booking.guest},\nYour booking is confirmed.\nBooking number: ${booking.reference}\nRoom: ${booking.room||'Assigned'}\nCheck-in: ${booking.checkIn}\nCheck-out: ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\nAccommodation total: ${money(booking.totalCents)}\n\nPlease keep your booking number for check-in.\n${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:'Booking confirmed · '+booking.reference+' · Nirili Villa',html,text:plain,idempotencyKey:'room-booking-confirmed/'+booking.reference});
}

export async function sendBookingUpdatedEmail(booking:BookingMail):Promise<MailResult>{
 const html=shell('Your booking was updated',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Your booking details have been updated. ${booking.statusLabel?'<strong>'+escapeHtml(booking.statusLabel)+'</strong>.':''}</p>
  ${bookingTable(booking,booking.reference.startsWith('REQ-')?'Estimated accommodation':'Accommodation total')}
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - booking updated\n\nBooking: ${booking.reference}\nStay: ${booking.checkIn} to ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\nTotal: ${money(booking.totalCents)}\n${booking.statusLabel||''}\n${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:'Booking updated · '+booking.reference+' · Nirili Villa',html,text:plain,idempotencyKey:'room-booking-updated/'+(booking.eventId||booking.reference)});
}

export async function sendBookingChangeRequestedEmail(booking:BookingMail):Promise<MailResult>{
 const cancelling=booking.requestType==='cancel';
 const title=cancelling?'Cancellation request received':'Change request received';
 const html=shell(title,`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">We received your ${cancelling?'cancellation':'change'} request for booking <strong>${escapeHtml(booking.reference)}</strong>.</p>
  <p style="font-size:14px;line-height:1.7">${cancelling?'Your confirmed booking and room remain active until reception approves the cancellation. Any refund is handled separately according to your booking terms.':'Your current confirmed booking remains unchanged until reception approves the requested changes.'}</p>
  ${bookingTable(booking)}
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - ${title}\n\nBooking: ${booking.reference}\n${cancelling?'Your booking remains active until reception approves cancellation.':'Your current booking remains unchanged until reception approves the requested changes.'}\n${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:title+' · '+booking.reference+' · Nirili Villa',html,text:plain,idempotencyKey:'room-booking-request/'+(booking.eventId||booking.reference)});
}

export async function sendBookingCancelledEmail(booking:BookingMail):Promise<MailResult>{
 const refund=Math.max(0,Number(booking.refundRequiredCents)||0);
 const html=shell('Your booking is cancelled',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Booking <strong>${escapeHtml(booking.reference)}</strong> has been cancelled.</p>
  ${bookingTable(booking)}
  ${refund>0?`<p style="padding:14px;border-radius:10px;background:#fff5e6"><strong>Refund required: ${money(refund)}</strong><br><span style="font-size:13px">Reception will handle this separately. This email does not mean the refund has already been processed.</span></p>`:''}
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - booking cancelled\n\nBooking: ${booking.reference}\nStatus: Cancelled\n${refund>0?'Refund required: '+money(refund)+' (handled separately by reception)\n':''}${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:'Booking cancelled · '+booking.reference+' · Nirili Villa',html,text:plain,idempotencyKey:'room-booking-cancelled/'+(booking.eventId||booking.reference)});
}

export async function sendBookingRequestRejectedEmail(booking:BookingMail):Promise<MailResult>{
 const cancelling=booking.requestType==='cancel';
 const html=shell(cancelling?'Cancellation request not approved':'Change request not approved',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Reception could not approve your ${cancelling?'cancellation':'change'} request for booking <strong>${escapeHtml(booking.reference)}</strong>.</p>
  ${booking.reason?`<p style="font-size:14px;line-height:1.7"><strong>Reception note:</strong> ${escapeHtml(booking.reason)}</p>`:''}
  <p style="font-size:14px;line-height:1.7">Your existing confirmed booking remains active.</p>
  ${bookingTable(booking)}
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - request not approved\n\nBooking: ${booking.reference}\nYour existing confirmed booking remains active.\n${booking.reason?'Reception note: '+booking.reason+'\n':''}${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:(cancelling?'Cancellation':'Change')+' request update · '+booking.reference,html,text:plain,idempotencyKey:'room-booking-rejected/'+(booking.eventId||booking.reference)});
}


export type TransportScheduleMail={
 email:string;
 guest:string;
 reference:string;
 room?:string;
 manageToken?:string;
 leg:'arrival'|'departure';
 boat:string;
 from:string;
 to:string;
 date:string;
 depart:string;
 arrive:string;
 seats?:number[];
 chargeCents?:number;
 changed?:boolean;
};

export async function sendTransportScheduleEmail(input:TransportScheduleMail):Promise<MailResult>{
 const label=input.leg==='arrival'?'Arrival':'Departure',verb=input.changed?'updated':'confirmed';
 const seatText=Array.isArray(input.seats)&&input.seats.length?' · Seats '+input.seats.join(', '):'';
 const charge=Number.isFinite(Number(input.chargeCents))?Math.max(0,Number(input.chargeCents)||0):null;
 const html=shell(label+' speedboat '+verb,`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(input.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Your <strong>${escapeHtml(label.toLowerCase())}</strong> speedboat for Nirili Villa has been ${input.changed?'updated':'scheduled'}.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef9f7;border-radius:14px;padding:18px">
   <tr><td style="padding:6px 0;color:#6a7f88">Booking</td><td align="right" style="font-weight:700">${escapeHtml(input.reference)}</td></tr>
   ${input.room?`<tr><td style="padding:6px 0;color:#6a7f88">Room</td><td align="right">${escapeHtml(input.room)}</td></tr>`:''}
   <tr><td style="padding:6px 0;color:#6a7f88">Date</td><td align="right">${escapeHtml(input.date)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Route</td><td align="right">${escapeHtml(input.from)} → ${escapeHtml(input.to)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Departure</td><td align="right" style="font-weight:700">${escapeHtml(input.depart)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Arrival</td><td align="right">${escapeHtml(input.arrive)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Boat</td><td align="right">${escapeHtml(input.boat)}</td></tr>
   ${seatText?`<tr><td style="padding:6px 0;color:#6a7f88">Seats</td><td align="right">${escapeHtml((input.seats||[]).join(', '))}</td></tr>`:''}
   ${charge!==null?`<tr><td style="padding:6px 0;color:#6a7f88">Transfer charge</td><td align="right" style="font-weight:700">${money(charge)}</td></tr>`:''}
  </table>
  <p style="font-size:14px;line-height:1.7">Your harbour buggy is linked to this transport plan. We will send another update when a buggy is assigned and when the driver is on the way.</p>
  ${manageButton(input.manageToken)}
 `);
 const plain=`Nirili Villa - ${label} speedboat ${verb}\n\nDear ${input.guest},\nBooking: ${input.reference}\nDate: ${input.date}\nRoute: ${input.from} -> ${input.to}\nDeparture: ${input.depart}\nArrival: ${input.arrive}\nBoat: ${input.boat}${seatText}${charge!==null?'\nTransfer charge: '+money(charge):''}\n\nYour harbour buggy is linked to this transport plan.\n${managePlain(input.manageToken)}`;
 return sendEmail({
  to:input.email,
  subject:label+' speedboat '+verb+' · '+input.reference+' · Nirili Villa',
  html,
  text:plain,
  idempotencyKey:'room-transport/'+input.reference+'/'+input.leg+'/'+input.date+'/'+input.depart+'/'+encodeURIComponent(input.boat).slice(0,80)
 });
}

export type TransportBuggyMail={
 email:string;
 guest:string;
 reference:string;
 room?:string;
 manageToken?:string;
 leg:'arrival'|'departure';
 date:string;
 pickupTime:string;
 location:string;
 destination:string;
 buggyName?:string;
 driver?:string;
 event:'assigned'|'on-the-way'|'arrived';
};

export async function sendTransportBuggyEmail(input:TransportBuggyMail):Promise<MailResult>{
 const label=input.leg==='arrival'?'Arrival':'Departure';
 const title=input.event==='assigned'?'Buggy assigned':input.event==='on-the-way'?'Buggy driver on the way':'Your buggy has arrived';
 const eventText=input.event==='assigned'
  ?'A buggy has been assigned for your '+label.toLowerCase()+' transport.'
  :input.event==='on-the-way'
   ?'Your buggy driver is now on the way to the pickup point.'
   :'Your buggy has arrived at the pickup point.';
 const html=shell(title,`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(input.guest)},</p>
  <p style="font-size:15px;line-height:1.7">${escapeHtml(eventText)}</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef9f7;border-radius:14px;padding:18px">
   <tr><td style="padding:6px 0;color:#6a7f88">Booking</td><td align="right" style="font-weight:700">${escapeHtml(input.reference)}</td></tr>
   ${input.room?`<tr><td style="padding:6px 0;color:#6a7f88">Room</td><td align="right">${escapeHtml(input.room)}</td></tr>`:''}
   <tr><td style="padding:6px 0;color:#6a7f88">Date</td><td align="right">${escapeHtml(input.date)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Pickup</td><td align="right" style="font-weight:700">${escapeHtml(input.pickupTime)} · ${escapeHtml(input.location)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Drop-off</td><td align="right">${escapeHtml(input.destination)}</td></tr>
   ${input.buggyName?`<tr><td style="padding:6px 0;color:#6a7f88">Buggy</td><td align="right">${escapeHtml(input.buggyName)}</td></tr>`:''}
   ${input.driver?`<tr><td style="padding:6px 0;color:#6a7f88">Driver</td><td align="right">${escapeHtml(input.driver)}</td></tr>`:''}
  </table>
  ${manageButton(input.manageToken)}
 `);
 const plain=`Nirili Villa - ${title}\n\nDear ${input.guest},\n${eventText}\nBooking: ${input.reference}\nDate: ${input.date}\nPickup: ${input.pickupTime} · ${input.location}\nDrop-off: ${input.destination}${input.buggyName?'\nBuggy: '+input.buggyName:''}${input.driver?'\nDriver: '+input.driver:''}\n${managePlain(input.manageToken)}`;
 return sendEmail({
  to:input.email,
  subject:title+' · '+input.reference+' · Nirili Villa',
  html,
  text:plain,
  idempotencyKey:'room-transport-buggy/'+input.reference+'/'+input.leg+'/'+input.date+'/'+input.pickupTime+'/'+input.event
 });
}
