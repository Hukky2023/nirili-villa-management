'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,CalendarDays,CheckCircle2,Mail,ShieldCheck,Users,XCircle} from 'lucide-react';

const money=(cents:number)=>'$'+(Math.max(0,Number(cents)||0)/100).toFixed(2);

export default function ManageBookingSite(){
 const [token,setToken]=useState(''),[booking,setBooking]=useState<any>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const [form,setForm]=useState<any>({guest:'',email:'',whatsapp:'',checkIn:'',checkOut:'',adults:2,children:0,meal:'Bed & Breakfast',notes:''});

 function syncForm(value:any){setForm({guest:value.guest||'',email:value.email||'',whatsapp:value.whatsapp||'',checkIn:value.checkIn||'',checkOut:value.checkOut||'',adults:value.adults||1,children:value.children||0,meal:value.meal||'Bed & Breakfast',notes:value.notes||''});}

 async function call(action:string,payload:any={}){
  const r=await fetch('/api/public-booking/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...payload}),cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Could not manage this booking.');return data;
 }

 useEffect(()=>{
  const value=decodeURIComponent(window.location.hash.replace(/^#/,'').trim());setToken(value);
  if(!value){setError('This manage-booking link is incomplete. Open the link from your Nirili Villa booking email.');setReady(true);return;}
  callWith(value);
  async function callWith(linkToken:string){
   try{
    const r=await fetch('/api/public-booking/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',token:linkToken}),cache:'no-store'});
    const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load this booking.');
    setBooking(data.booking);syncForm(data.booking);
   }catch(e){setError((e as Error).message)}finally{setReady(true)}
  }
 },[]);

 async function save(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   const data=await call('update',form);setBooking(data.booking);syncForm(data.booking);
   setMessage(data.applied?'Your booking details were updated. Room confirmation is still pending.':'Your change request was sent to reception. Your confirmed booking stays unchanged until the change is approved.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 async function cancel(){
  if(busy||!booking?.canCancel)return;
  const instant=booking.kind==='request'||!booking.cancelRequiresApproval;
  const copy=booking.kind==='request'
   ?'Cancel this booking before it is confirmed?'
   :instant
    ?'Cancel this confirmed booking now? Your room will be released immediately. Any recorded refund will be handled separately by reception.'
    :'Request cancellation of this confirmed booking? Your room will remain reserved until reception approves the cancellation.';
  if(!window.confirm(copy))return;
  setBusy(true);setError('');setMessage('');
  try{
   const data=await call('cancel');setBooking(data.booking);syncForm(data.booking);
   setMessage(data.cancelled?'Your booking has been cancelled.':'Your cancellation request was sent to reception. The booking remains confirmed until reception approves it.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 if(!ready)return <main className="manage-booking"><section className="manage-card"><p>Loading your booking…</p></section></main>;
 if(error&&!booking)return <main className="manage-booking"><section className="manage-card error-card"><XCircle/><h1>We couldn’t open this booking.</h1><p>{error}</p><a href="/book"><ArrowLeft/> Back to booking</a></section></main>;

 const pending=booking?.pendingAction;
 return <main className="manage-booking">
  <header className="manage-nav"><a href="/book"><ArrowLeft/> Nirili Villa</a><span>DHIFFUSHI · MALDIVES</span></header>
  <section className="manage-hero">
   <div><span className="eyebrow">MANAGE BOOKING</span><h1>{booking.guest}</h1><p>View your stay, request changes or manage cancellation without creating an account.</p></div>
   <div className="reference"><small>BOOKING REFERENCE</small><strong>{booking.reference}</strong><span className={'status '+String(booking.status).toLowerCase().replace(/\s+/g,'-')}>{booking.status}</span></div>
  </section>

  {(message||error)&&<p className={'manage-message '+(error?'error':'success')} role="status">{error||message}</p>}

  {pending&&<section className="pending-banner">
   <CheckCircle2/><div><strong>{pending.type==='cancel'?'Cancellation requested':'Change requested'}</strong><p>Reception is reviewing this request. Your current confirmed booking remains active until a decision is made.</p><small>Request {pending.id} · {new Date(pending.requestedAt).toLocaleString('en-GB',{timeZone:'Indian/Maldives',hour12:false})}</small></div>
  </section>}

  <section className="booking-summary">
   <div><CalendarDays/><span><small>CHECK-IN</small><strong>{booking.checkIn}</strong></span></div>
   <div><CalendarDays/><span><small>CHECK-OUT</small><strong>{booking.checkOut}</strong></span></div>
   <div><Users/><span><small>GUESTS</small><strong>{booking.pax}</strong></span></div>
   <div><Mail/><span><small>EMAIL</small><strong>{booking.email}</strong></span></div>
   {booking.room&&<div><ShieldCheck/><span><small>ROOM</small><strong>{booking.room}</strong></span></div>}
   <div><ShieldCheck/><span><small>MEAL PLAN</small><strong>{booking.meal}</strong></span></div>
  </section>

  {booking.status==='Cancelled'?<section className="cancelled-card"><XCircle/><div><h2>Booking cancelled</h2><p>This reservation is no longer active.</p>{booking.refundRequiredCents>0&&<p><strong>Refund required: {money(booking.refundRequiredCents)}</strong><br/>Reception will handle the refund separately. This page does not process refunds automatically.</p>}</div></section>:
  <section className="manage-grid">
   <form className="edit-card" onSubmit={save}>
    <div className="section-head"><span className="eyebrow">YOUR STAY</span><h2>Change booking details</h2><p>{booking.kind==='request'?'Changes can be applied before room confirmation.':'Changes to a confirmed booking are sent to reception for approval.'}</p></div>
    <label><span>Lead guest name</span><input required maxLength={100} disabled={!booking.canEdit||busy} value={form.guest} onChange={e=>setForm({...form,guest:e.target.value})}/></label>
    <div className="two"><label><span>Email</span><input required type="email" maxLength={254} disabled={!booking.canEdit||busy} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label><span>WhatsApp</span><input required type="tel" maxLength={30} disabled={!booking.canEdit||busy} value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></label></div>
    <div className="two"><label><span>Check-in</span><input required type="date" disabled={!booking.canEdit||busy} value={form.checkIn} onChange={e=>setForm({...form,checkIn:e.target.value})}/></label><label><span>Check-out</span><input required type="date" disabled={!booking.canEdit||busy} value={form.checkOut} onChange={e=>setForm({...form,checkOut:e.target.value})}/></label></div>
    <div className="two"><label><span>Adults</span><select disabled={!booking.canEdit||busy} value={form.adults} onChange={e=>setForm({...form,adults:Number(e.target.value),children:Math.min(form.children,3-Number(e.target.value))})}>{[1,2,3].map(x=><option key={x}>{x}</option>)}</select></label><label><span>Children</span><select disabled={!booking.canEdit||busy} value={form.children} onChange={e=>setForm({...form,children:Number(e.target.value)})}>{Array.from({length:Math.max(1,4-form.adults)},(_,i)=><option key={i}>{i}</option>)}</select></label></div>
    <label><span>Meal plan</span><select disabled={!booking.canEdit||busy} value={form.meal} onChange={e=>setForm({...form,meal:e.target.value})}>{['Bed & Breakfast','Half Board','Full Board'].map(x=><option key={x}>{x}</option>)}</select></label>
    <label><span>Special requests / notes</span><textarea rows={4} maxLength={1000} disabled={!booking.canEdit||busy} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    <button className="primary" disabled={!booking.canEdit||busy}>{busy?'Saving…':booking.kind==='request'?'Update Booking':'Request Changes'}</button>
   </form>

   <aside className="side-card">
    <div><small>CURRENT ACCOMMODATION</small><strong>{money(booking.totalCents)}</strong>{booking.kind==='request'&&<span>Current estimate</span>}</div>
    <div className="cancel-zone"><h3>Need to cancel?</h3><p>{booking.kind==='request'?'A booking that has not yet been confirmed can be cancelled immediately.':booking.cancelRequiresApproval?'The self-cancellation cutoff has passed. Your cancellation will be sent to reception for approval.':'Confirmed bookings can be cancelled immediately through the day before check-in. Any refund is handled separately according to your booking terms.'}</p><button type="button" className="danger" disabled={!booking.canCancel||busy} onClick={cancel}>{booking.kind==='request'||!booking.cancelRequiresApproval?'Cancel Booking':'Request Cancellation'}</button></div>
    <p className="security"><ShieldCheck/> This secure link was created for this booking. Do not forward it to anyone you do not want to manage your reservation.</p>
   </aside>
  </section>}
 </main>;
}
