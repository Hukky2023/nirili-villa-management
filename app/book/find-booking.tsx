'use client';
import {useState} from 'react';
import {ArrowRight,Mail,MailCheck} from 'lucide-react';
import {WHATSAPP} from '../hotel/chrome';

// Shown on the manage pages when they are opened without the private link from a booking email.
export default function FindBooking({heading='Find your booking',intro}:{heading?:string;intro?:string}){
 const [reference,setReference]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/public-booking/find',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference,email}),cache:'no-store'});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not look up the booking.');
   setSent(d.message);
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 if(sent)return <section className="manage-card nh-find nh-find-sent"><MailCheck/><h1>Check your email</h1><p>{sent}</p><button type="button" onClick={()=>{setSent('');setReference('');}}>Look up another booking</button></section>;
 return <form className="manage-card nh-find" onSubmit={submit}>
  <Mail/>
  <h1>{heading}</h1>
  <p>{intro||'Enter your booking reference and the email you booked with. We’ll email you a private link to view, change or cancel your booking.'}</p>
  <label>Booking reference<input required maxLength={40} autoCapitalize="characters" autoComplete="off" value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. REQ-1A2B3C4D or EXC-1A2B3C4D"/></label>
  <label>Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="The email on your booking"/></label>
  {error&&<p className="nh-find-error" role="alert">{error}</p>}
  <button className="nh-btn nh-btn-primary" disabled={busy}>{busy?'Looking up…':'Email me the link'} <ArrowRight/></button>
  <small>Your reference is in your booking confirmation email. Can’t find it? <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>.</small>
 </form>;
}
