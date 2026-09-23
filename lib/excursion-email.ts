import {env} from 'cloudflare:workers';
import {excursionManageUrl} from './excursion-manage';

type MailResult={sent:boolean;id?:string;error?:string};
export type ExcursionMail={
 email:string;guest:string;reference:string;excursion:string;date:string;time?:string;endTime?:string;
 quantity:number;quotedCents:number;hotel?:string;manageToken?:string;eventId?:string;status?:string;
 requestType?:'change'|'cancel';reason?:string;refundRequiredCents?:number;
 packageSegments?:Array<{name:string;date:string;time:string;endTime?:string;matchedScheduleName?:string}>;
};

const money=(cents:number)=>'$'+(Math.max(0,Math.round(Number(cents)||0))/100).toFixed(2);
const text=(value:any)=>String(value??'').trim();
const escapes:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=(value:any)=>text(value).replace(/[&<>"']/g,char=>escapes[char]||char);
function config(){const e=env as unknown as Record<string,string|undefined>;return {apiKey:text(e.RESEND_API_KEY),from:text(e.BOOKING_EMAIL_FROM)||'Nirili Tours <bookings@nirilihotels.com>',replyTo:text(e.BOOKING_EMAIL_REPLY_TO)};}
async function send(input:{to:string;subject:string;html:string;text:string;key:string}):Promise<MailResult>{
 const {apiKey,from,replyTo}=config();if(!apiKey)return {sent:false,error:'Email service is not configured.'};
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':input.key},body:JSON.stringify({from,to:[input.to],subject:input.subject,html:input.html,text:input.text,...(replyTo?{reply_to:replyTo}:{})})});
  if(!response.ok)return {sent:false,error:'Email provider rejected the excursion message.'};
  const data:any=await response.json().catch(()=>({}));return {sent:true,id:text(data?.id)||undefined};
 }catch{return {sent:false,error:'Email service is temporarily unavailable.'};}
}
function shell(title:string,body:string){return `<!doctype html><html><body style="margin:0;background:#f2f8f9;font-family:Arial,sans-serif;color:#153645"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #dce9eb;border-radius:20px;overflow:hidden"><tr><td style="background:#0b536c;color:#fff;padding:28px 32px"><div style="font-size:12px;letter-spacing:2px;opacity:.85">NIRILI TOURS · DHIFFUSHI · MALDIVES</div><h1 style="margin:10px 0 0;font-size:30px">${esc(title)}</h1></td></tr><tr><td style="padding:30px 32px">${body}<p style="margin:30px 0 0;color:#71858e;font-size:12px">Arrive as a Guest, Leave as a Friend.</p></td></tr></table></td></tr></table></body></html>`;}
function table(mail:ExcursionMail){return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef9f7;border-radius:14px;padding:18px"><tr><td style="padding:6px 0;color:#6a7f88">Booking reference</td><td align="right" style="font-weight:700">${esc(mail.reference)}</td></tr><tr><td style="padding:6px 0;color:#6a7f88">Excursion</td><td align="right">${esc(mail.excursion)}</td></tr><tr><td style="padding:6px 0;color:#6a7f88">Date</td><td align="right">${esc(mail.date)}</td></tr>${mail.time?`<tr><td style="padding:6px 0;color:#6a7f88">Departure</td><td align="right">${esc(mail.time)} Maldives time</td></tr>`:''}<tr><td style="padding:6px 0;color:#6a7f88">Guests</td><td align="right">${mail.quantity}</td></tr><tr><td style="padding:6px 0;color:#6a7f88">Total</td><td align="right" style="font-weight:700">${money(mail.quotedCents)}</td></tr></table>`;}
function packageItinerary(mail:ExcursionMail){
 const segments=Array.isArray(mail.packageSegments)?mail.packageSegments:[];
 if(!segments.length)return '';
 return '<div style="margin:20px 0"><div style="font-size:11px;letter-spacing:1.4px;color:#5f7b84;font-weight:700;margin-bottom:8px">PACKAGE ITINERARY</div>'+segments.map((segment,index)=>'<div style="padding:10px 0;border-top:1px solid #dce9eb"><strong>'+String(index+1)+'. '+esc(segment.name)+'</strong><br><span style="font-size:13px;color:#5f737a">'+esc(segment.date)+' · '+esc(segment.time)+(segment.endTime?'–'+esc(segment.endTime):'')+' · Maldives time</span>'+(segment.matchedScheduleName&&segment.matchedScheduleName!==segment.name?'<br><span style="font-size:12px;color:#788b91">Scheduled on: '+esc(segment.matchedScheduleName)+'</span>':'')+'</div>').join('')+'</div>';
}
function packagePlain(mail:ExcursionMail){
 const segments=Array.isArray(mail.packageSegments)?mail.packageSegments:[];
 return segments.length?'\nPackage itinerary:\n'+segments.map((segment,index)=>(index+1)+'. '+segment.name+' · '+segment.date+' · '+segment.time+(segment.endTime?'–'+segment.endTime:'')+' Maldives time').join('\n')+'\n':'';
}
function manageButton(token?:string){if(!token)return '';const url=excursionManageUrl(token);return `<p style="margin:26px 0"><a href="${esc(url)}" style="display:inline-block;background:#0b536c;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">View / Manage Excursion</a></p><p style="font-size:12px;color:#71858e">This is your private excursion-management link. Do not forward it.</p>`;}
function managePlain(token?:string){return token?'\nView / manage excursion: '+excursionManageUrl(token)+'\n':'';}

export async function sendExternalExcursionBookedEmail(mail:ExcursionMail):Promise<MailResult>{
 const confirmed=mail.status==='Confirmed';
 const html=shell(confirmed?'Your excursion is booked':'We received your excursion booking',`<p>Dear ${esc(mail.guest)},</p><p>${confirmed?'Your seats are reserved.':'Our excursions team will confirm the trip time, vessel and pickup details.'}</p>${table(mail)}${packageItinerary(mail)}${manageButton(mail.manageToken)}`);
 const plain=`Nirili Tours - ${confirmed?'excursion booked':'booking received'}\n\nReference: ${mail.reference}\nExcursion: ${mail.excursion}\nDate: ${mail.date}\n${mail.time?'Departure: '+mail.time+' Maldives time\n':''}Guests: ${mail.quantity}\nTotal: ${money(mail.quotedCents)}\n${packagePlain(mail)}${managePlain(mail.manageToken)}`;
 return send({to:mail.email,subject:(confirmed?'Excursion confirmed · ':'Excursion booking received · ')+mail.reference,html,text:plain,key:'external-excursion-booked/'+mail.reference});
}
export async function sendExternalExcursionRequestEmail(mail:ExcursionMail):Promise<MailResult>{
 const cancelling=mail.requestType==='cancel',title=cancelling?'Cancellation request received':'Excursion change request received';
 const html=shell(title,`<p>Dear ${esc(mail.guest)},</p><p>We received your ${cancelling?'cancellation':'change'} request for <strong>${esc(mail.reference)}</strong>. Your current confirmed excursion remains active until our team reviews it.</p>${table(mail)}${manageButton(mail.manageToken)}`);
 return send({to:mail.email,subject:title+' · '+mail.reference,html,text:`Nirili Tours - ${title}\n\nBooking: ${mail.reference}\nYour current confirmed excursion remains active until reviewed.\n${managePlain(mail.manageToken)}`,key:'external-excursion-request/'+(mail.eventId||mail.reference)});
}
export async function sendExternalExcursionUpdatedEmail(mail:ExcursionMail):Promise<MailResult>{
 const html=shell('Your excursion booking was updated',`<p>Dear ${esc(mail.guest)},</p><p>Your excursion booking has been updated.</p>${table(mail)}${manageButton(mail.manageToken)}`);
 return send({to:mail.email,subject:'Excursion updated · '+mail.reference,html,text:`Nirili Tours - excursion updated\n\nBooking: ${mail.reference}\nExcursion: ${mail.excursion}\nDate: ${mail.date}\n${mail.time?'Departure: '+mail.time+'\n':''}${managePlain(mail.manageToken)}`,key:'external-excursion-updated/'+(mail.eventId||mail.reference)});
}
export async function sendExternalExcursionCancelledEmail(mail:ExcursionMail):Promise<MailResult>{
 const refund=Math.max(0,Number(mail.refundRequiredCents)||0);
 const html=shell('Your excursion is cancelled',`<p>Dear ${esc(mail.guest)},</p><p>Booking <strong>${esc(mail.reference)}</strong> has been cancelled.</p>${table(mail)}${refund?`<p style="padding:14px;background:#fff5e6;border-radius:10px"><strong>Refund required: ${money(refund)}</strong><br><span style="font-size:13px">Our team will handle this separately. This email does not mean the refund has already been processed.</span></p>`:''}${manageButton(mail.manageToken)}`);
 return send({to:mail.email,subject:'Excursion cancelled · '+mail.reference,html,text:`Nirili Tours - excursion cancelled\n\nBooking: ${mail.reference}\n${refund?'Refund required: '+money(refund)+'\n':''}${managePlain(mail.manageToken)}`,key:'external-excursion-cancelled/'+(mail.eventId||mail.reference)});
}
export async function sendExternalExcursionRejectedEmail(mail:ExcursionMail):Promise<MailResult>{
 const cancelling=mail.requestType==='cancel';
 const html=shell((cancelling?'Cancellation':'Change')+' request not approved',`<p>Dear ${esc(mail.guest)},</p><p>We could not approve your ${cancelling?'cancellation':'change'} request for <strong>${esc(mail.reference)}</strong>.</p>${mail.reason?`<p><strong>Team note:</strong> ${esc(mail.reason)}</p>`:''}<p>Your existing booking remains active.</p>${table(mail)}${manageButton(mail.manageToken)}`);
 return send({to:mail.email,subject:'Excursion request update · '+mail.reference,html,text:`Nirili Tours - request not approved\n\nBooking: ${mail.reference}\nYour existing booking remains active.\n${mail.reason?'Team note: '+mail.reason+'\n':''}${managePlain(mail.manageToken)}`,key:'external-excursion-rejected/'+(mail.eventId||mail.reference)});
}


export async function sendExternalExcursionDeclinedEmail(mail:ExcursionMail):Promise<MailResult>{
 const html=shell('Excursion booking update',`<p>Dear ${esc(mail.guest)},</p><p>We’re sorry, but we could not confirm booking <strong>${esc(mail.reference)}</strong> for the requested excursion/date.</p>${mail.reason?`<p><strong>Team note:</strong> ${esc(mail.reason)}</p>`:''}${table(mail)}${manageButton(mail.manageToken)}`);
 return send({to:mail.email,subject:'Excursion booking update · '+mail.reference,html,text:`Nirili Tours - excursion booking update\n\nBooking: ${mail.reference}\nWe could not confirm this requested excursion.\n${mail.reason?'Team note: '+mail.reason+'\n':''}${managePlain(mail.manageToken)}`,key:'external-excursion-declined/'+(mail.eventId||mail.reference)});
}
