import {env} from 'cloudflare:workers';
import {bookingManageUrl,bookingConfirmationUrl} from './booking-manage';

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
 packageId?:string;packageName?:string;packageIncludeTransfer?:boolean;packageTransferLabel?:string;packageExcursions?:{id:string;name:string}[];
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
 if(booking.packageId)label='Total package price';
 return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef9f7;border-radius:14px;padding:18px">
  <tr><td style="padding:6px 0;color:#6a7f88">Booking number</td><td align="right" style="font-weight:700">${escapeHtml(booking.reference)}</td></tr>
  ${booking.room?`<tr><td style="padding:6px 0;color:#6a7f88">Room</td><td align="right" style="font-weight:700">${escapeHtml(booking.room)}</td></tr>`:''}
  <tr><td style="padding:6px 0;color:#6a7f88">Check-in</td><td align="right">${escapeHtml(booking.checkIn)}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">Check-out</td><td align="right">${escapeHtml(booking.checkOut)}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">Guests</td><td align="right">${booking.pax}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">Meal plan</td><td align="right">${escapeHtml(booking.meal)}</td></tr>
  <tr><td style="padding:6px 0;color:#6a7f88">${escapeHtml(label)}${booking.packageId?`<br>${escapeHtml(booking.packageName||'Package')}<br>${booking.packageIncludeTransfer?escapeHtml(booking.packageTransferLabel||'Return airport transfer')+'<br>':''}${(booking.packageExcursions||[]).map(x=>escapeHtml(x.name)).join('<br>')}<br>Excursions arranged after check-in`:""}</td><td align="right" style="font-weight:700">${money(booking.totalCents)}</td></tr>
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
 const plain=`Nirili Villa - booking received\n\nDear ${booking.guest},\nWe received your booking.\nReference: ${booking.reference}\nStay: ${booking.checkIn} to ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\n${booking.packageId?'Total package price':'Estimated accommodation'}: ${money(booking.totalCents)}\n\nStatus: confirmation pending. You will receive another email after the room is approved.\n${managePlain(booking.manageToken)}`;
 return sendEmail({to:booking.email,subject:'Nirili Villa booking received · '+booking.reference,html,text:plain,idempotencyKey:'room-booking-received/'+booking.reference});
}

export async function sendBookingConfirmationEmail(booking:BookingMail):Promise<MailResult>{
 const confirmationUrl=booking.manageToken?bookingConfirmationUrl(booking.manageToken):'';
 const guestBooking={...booking,room:undefined};
 const html=shell('Your stay is confirmed',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Your Nirili Villa booking is confirmed. We look forward to welcoming you to Dhiffushi.</p>
  ${bookingTable(guestBooking)}
  ${confirmationUrl?`<p style="margin:26px 0"><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;background:#0b79c8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px">Download Booking Confirmation</a></p>`:''}
  <p style="font-size:14px;line-height:1.7">Please keep your booking number for check-in and future communication with reception.</p>
  ${manageButton(booking.manageToken)}
 `);
 const plain=`Nirili Villa - booking confirmed\n\nDear ${booking.guest},\nYour booking is confirmed.\nBooking number: ${booking.reference}\nCheck-in: ${booking.checkIn}\nCheck-out: ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\n${booking.packageId?'Total package price':'Accommodation total'}: ${money(booking.totalCents)}\n${confirmationUrl?'\nDownload Booking Confirmation: '+confirmationUrl+'\n':''}\nPlease keep your booking number for check-in.\n${managePlain(booking.manageToken)}`;
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
  <p style="font-size:14px;line-height:1.7">Your harbour buggy is linked to this transport plan. The buggy driver can contact your saved WhatsApp number when pickup starts or when the buggy arrives.</p>
  ${manageButton(input.manageToken)}
 `);
 const plain=`Nirili Villa - ${label} speedboat ${verb}\n\nDear ${input.guest},\nBooking: ${input.reference}\nDate: ${input.date}\nRoute: ${input.from} -> ${input.to}\nDeparture: ${input.depart}\nArrival: ${input.arrive}\nBoat: ${input.boat}${seatText}${charge!==null?'\nTransfer charge: '+money(charge):''}\n\nYour harbour buggy is linked to this transport plan. The buggy driver can contact your saved WhatsApp number for pickup updates.\n${managePlain(input.manageToken)}`;
 return sendEmail({
  to:input.email,
  subject:label+' speedboat '+verb+' · '+input.reference+' · Nirili Villa',
  html,
  text:plain,
  idempotencyKey:'room-transport/'+input.reference+'/'+input.leg+'/'+input.date+'/'+input.depart+'/'+encodeURIComponent(input.boat).slice(0,80)
 });
}


// Re-sends private manage links to the email address a booking was made with ("Find my booking").
export async function sendManageLinkEmail(input:{email:string;guest:string;reference:string;links:{label:string;url:string}[]}):Promise<MailResult>{
 const buttons=input.links.map(link=>`<p style="margin:18px 0 6px;font-weight:700">${escapeHtml(link.label)}</p><p style="margin:0 0 18px"><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#0b536c;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">Manage booking</a></p>`).join('');
 const html=shell('Your manage-booking link',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(input.guest||'guest')},</p>
  <p style="font-size:15px;line-height:1.7">Someone asked for the link to manage booking <strong>${escapeHtml(input.reference)}</strong>. Use the button below to view your booking, request changes or cancel.</p>
  ${buttons}
  <p style="font-size:13px;line-height:1.7;color:#71858e">If you did not ask for this, you can ignore this email. The link is private: please do not share it.</p>
 `);
 const plain=`Nirili - your manage-booking link\n\nDear ${input.guest||'guest'},\nUse these private links to manage booking ${input.reference}:\n\n`+input.links.map(link=>link.label+'\n'+link.url).join('\n\n')+'\n\nIf you did not ask for this, you can ignore this email.';
 const window=Math.floor(Date.now()/600000);
 return sendEmail({to:input.email,subject:'Manage your Nirili booking · '+input.reference,html,text:plain,idempotencyKey:'manage-link/'+input.reference+'/'+window});
}
