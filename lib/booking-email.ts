import {env} from 'cloudflare:workers';

type MailResult={sent:boolean;id?:string;error?:string};
type BookingMail={
 email:string;
 guest:string;
 reference:string;
 room?:string;
 checkIn:string;
 checkOut:string;
 meal:string;
 pax:number;
 totalCents:number;
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

export async function sendBookingReceivedEmail(booking:BookingMail):Promise<MailResult>{
 const reference=escapeHtml(booking.reference),guest=escapeHtml(booking.guest);
 const html=shell('We received your booking',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${guest},</p>
  <p style="font-size:15px;line-height:1.7">Thank you for booking directly with Nirili Villa. We have received your booking and our reception team will confirm the room allocation.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f4faf9;border-radius:14px;padding:18px">
   <tr><td style="padding:6px 0;color:#6a7f88">Booking reference</td><td align="right" style="font-weight:700">${reference}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Stay</td><td align="right">${escapeHtml(booking.checkIn)} → ${escapeHtml(booking.checkOut)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Guests</td><td align="right">${booking.pax}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Meal plan</td><td align="right">${escapeHtml(booking.meal)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Estimated accommodation</td><td align="right" style="font-weight:700">${money(booking.totalCents)}</td></tr>
  </table>
  <p style="font-size:14px;line-height:1.7">Your booking is currently <strong>confirmation pending</strong>. You will receive another email with your Nirili Villa booking number and assigned room after approval.</p>
 `);
 const plain=`Nirili Villa - booking received\n\nDear ${booking.guest},\nWe received your booking.\nReference: ${booking.reference}\nStay: ${booking.checkIn} to ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\nEstimated accommodation: ${money(booking.totalCents)}\n\nStatus: confirmation pending. You will receive another email after the room is approved.\n`;
 return sendEmail({to:booking.email,subject:'Nirili Villa booking received · '+booking.reference,html,text:plain,idempotencyKey:'room-booking-received/'+booking.reference});
}

export async function sendBookingConfirmationEmail(booking:BookingMail):Promise<MailResult>{
 const html=shell('Your stay is confirmed',`
  <p style="font-size:16px;line-height:1.7;margin-top:0">Dear ${escapeHtml(booking.guest)},</p>
  <p style="font-size:15px;line-height:1.7">Your Nirili Villa booking is confirmed. We look forward to welcoming you to Dhiffushi.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef9f7;border-radius:14px;padding:18px">
   <tr><td style="padding:6px 0;color:#6a7f88">Booking number</td><td align="right" style="font-weight:700;font-size:18px">${escapeHtml(booking.reference)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Room</td><td align="right" style="font-weight:700">${escapeHtml(booking.room||'Assigned')}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Check-in</td><td align="right">${escapeHtml(booking.checkIn)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Check-out</td><td align="right">${escapeHtml(booking.checkOut)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Guests</td><td align="right">${booking.pax}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Meal plan</td><td align="right">${escapeHtml(booking.meal)}</td></tr>
   <tr><td style="padding:6px 0;color:#6a7f88">Accommodation total</td><td align="right" style="font-weight:700">${money(booking.totalCents)}</td></tr>
  </table>
  <p style="font-size:14px;line-height:1.7">Please keep your booking number for check-in and future communication with reception.</p>
 `);
 const plain=`Nirili Villa - booking confirmed\n\nDear ${booking.guest},\nYour booking is confirmed.\nBooking number: ${booking.reference}\nRoom: ${booking.room||'Assigned'}\nCheck-in: ${booking.checkIn}\nCheck-out: ${booking.checkOut}\nGuests: ${booking.pax}\nMeal plan: ${booking.meal}\nAccommodation total: ${money(booking.totalCents)}\n\nPlease keep your booking number for check-in.\n`;
 return sendEmail({to:booking.email,subject:'Booking confirmed · '+booking.reference+' · Nirili Villa',html,text:plain,idempotencyKey:'room-booking-confirmed/'+booking.reference});
}
