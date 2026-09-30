'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,CheckCircle2,MapPin,Plus,ShieldCheck,ShipWheel,Sparkles,Trash2,Users} from 'lucide-react';
import Link from 'next/link';
import {SITES} from '../../../lib/public-sites';
import {excursionPhoto,img} from '../../hotel/chrome';

type Excursion={
 id:string;name:string;detail:string;longDetail?:string;youtubeUrl?:string;galleryUrls?:string[];cents:number;pricingUnit:'guest'|'couple';
 category:string;group:string;needsFootSizes:boolean;
};
type Guest={name:string;ageCategory:'adult'|'child'|'infant';footSize:string};
type PublicData={today?:string;items?:Excursion[];childPolicy?:string;privateBoatSurchargeCents?:number;error?:string};

const money=(cents:number)=>'$'+(Math.max(0,Number(cents)||0)/100).toFixed(2);
const newGuest=():Guest=>({name:'',ageCategory:'adult',footSize:''});

export default function ExternalExcursionBooking(){
 const [data,setData]=useState<PublicData>({}),[selected,setSelected]=useState<Excursion|null>(null);
 const [date,setDate]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[hotel,setHotel]=useState(''),[room,setRoom]=useState('');
 const [groupName,setGroupName]=useState(''),[notes,setNotes]=useState(''),[guests,setGuests]=useState<Guest[]>([newGuest()]);
 const [buggyRequested,setBuggyRequested]=useState(false),[privateBoat,setPrivateBoat]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState<any>(null);
 const token=useRef('');

 useEffect(()=>{
  token.current=crypto.randomUUID();
  fetch('/api/public-excursions',{cache:'no-store'}).then(async response=>{
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error||'Could not load excursions.');
   setData(payload);setDate(payload.today||'');
   const requested=new URLSearchParams(window.location.search).get('excursion');
   const requestedItem=(payload.items||[]).find((item:Excursion)=>item.id===requested);
   setSelected(requestedItem||payload.items?.[0]||null);
   if(requestedItem)window.setTimeout(()=>document.getElementById('external-excursion-form')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }).catch((reason)=>setError(reason instanceof Error?reason.message:'Could not load excursions.'));
 },[]);

 const adults=guests.filter(guest=>guest.ageCategory==='adult').length;
 const children=guests.filter(guest=>guest.ageCategory==='child').length;
 const infants=guests.filter(guest=>guest.ageCategory==='infant').length;
 const baseEstimate=useMemo(()=>{
  if(!selected)return 0;
  if(selected.pricingUnit==='couple')return selected.cents*Math.ceil(Math.max(1,guests.length)/2);
  return Math.round(selected.cents*(adults+children*.5));
 },[selected,guests.length,adults,children]);
 const privateSurcharge=privateBoat&&guests.length>=4?(data.privateBoatSurchargeCents||5000):0;
 const totalEstimate=baseEstimate+privateSurcharge;

 function choose(item:Excursion){
  setSelected(item);setPrivateBoat(false);setError('');setSuccess(null);
  window.setTimeout(()=>document.getElementById('external-excursion-form')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
 }
 function updateGuest(index:number,patch:Partial<Guest>){
  setGuests(current=>current.map((guest,i)=>i===index?{...guest,...patch}:guest));
 }
 function addGuest(){
  setGuests(current=>current.length>=20?current:[...current,newGuest()]);
 }
 function removeGuest(index:number){
  setGuests(current=>current.length<=1?current:current.filter((_,i)=>i!==index));
  if(guests.length<=4)setPrivateBoat(false);
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy||!selected)return;
  setBusy(true);setError('');
  try{
   const payload={
    token:token.current,menuItemId:selected.id,date,guest:guests[0]?.name||'',phone,email,hotel,externalRoom:room,groupName,notes,
    guestNames:guests.map(guest=>guest.name),
    guestCategories:guests.map(guest=>guest.ageCategory),
    footSizes:selected.needsFootSizes?guests.map(guest=>Number(guest.footSize)):[],
    buggyRequested,privateBoatRequested:privateBoat&&guests.length>=4
   };
   const response=await fetch('/api/public-excursions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Could not send your excursion booking.');
   setSuccess(result.booking);if(result.booking?.manageUrl)try{localStorage.setItem('nirili-excursion-manage:'+result.booking.id,result.booking.manageUrl)}catch{}window.scrollTo({top:0,behavior:'smooth'});
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not send your excursion booking.');}
  finally{setBusy(false);}
 }

 if(success)return <div className="guest-booking-site external-excursion-site">
  <section className="booking-success external-success">
   <div className="success-mark"><CheckCircle2/></div>
   <span className="eyebrow">NIRILI EXCURSIONS · DHIFFUSHI</span>
   <h1>{success.status==='Confirmed'?'Your excursion is booked.':'Your excursion request is received.'}</h1>
   <p>{success.status==='Confirmed'
    ?'Your seats are reserved. Keep this reference and be ready for the departure details shown below.'
    :'Our excursions team will confirm the trip time, vessel and pickup details with you on WhatsApp.'}</p>
   <div className="success-ref"><small>BOOKING REFERENCE</small><strong>{success.id}</strong></div>
   <div className="success-details">
    <span><Sparkles/> {selected?.name}</span>
    <span><CalendarDays/> {success.packageSegments?.length?success.packageSegments.length+' scheduled trips':(success.date||date)+(success.time?' · '+success.time:'')}</span>
    <span><Users/> {guests.length} {guests.length===1?'guest':'guests'}</span>
   </div>
   {success.packageSegments?.length>0&&<div className="external-package-itinerary"><small>AUTOMATIC PACKAGE ITINERARY</small>{success.packageSegments.map((segment:any,index:number)=><div key={segment.id||index}><b>{index+1}</b><span><strong>{segment.name}</strong><small>{segment.date} · {segment.time}{segment.endTime?'–'+segment.endTime:''} · Maldives time</small>{segment.matchedScheduleName&&segment.matchedScheduleName!==segment.name&&<em>Scheduled on: {segment.matchedScheduleName}</em>}</span><i>Confirmed</i></div>)}</div>}
   <p className="success-note">{success.email?.sent?'Reserve now, pay later. We sent your private View / Manage Excursion link to '+email+'.':'Your excursion booking is saved. Email delivery could not be confirmed, so use the private View / Manage Excursion button below and keep the link.'}</p>
   <div className="external-success-actions">
    {success.manageUrl&&<a className="primary" href={success.manageUrl}>View / Manage Excursion <ArrowRight/></a>}
    <button onClick={()=>{setSuccess(null);token.current=crypto.randomUUID();}}>Book another excursion <ArrowRight/></button>
    <a href={SITES.main}><ArrowLeft/> Back to Nirili</a>
   </div>
  </section>
 </div>;

 return <div className="guest-booking-site external-excursion-site">
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1437622368342-7a3d73a34c8f',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light"><MapPin/> Nirili Tours · Dhiffushi</p>
    <h1>Not staying with us? <em>Explore with us anyway.</em></h1>
    <p>Guests from any hotel or guesthouse on Dhiffushi can book our excursions. Choose your trip, pick a date and add everyone who&rsquo;s coming.</p>
    <div className="nh-hero-actions"><a className="nh-btn nh-btn-light" href="#excursions">Explore excursions <ArrowRight/></a><a className="nh-btn nh-btn-ghost" href="#external-excursion-form">Go to booking</a></div>
   </div>
  </section>

  <section className="quick-strip">
   <article><ShieldCheck/><div><strong>No login needed</strong><span>Book with your email and WhatsApp number</span></div></article>
   <article><CheckCircle2/><div><strong>Reserve now, pay later</strong><span>We email you a private link to manage your trip</span></div></article>
   <article><ShipWheel/><div><strong>Stay anywhere</strong><span>Tell us your hotel or meeting point for pickup</span></div></article>
  </section>

  <section className="external-excursion-list" id="excursions">
   <div className="section-head">
    <span className="eyebrow">NIRILI EXCURSIONS</span>
    <h2>Choose your island adventure.</h2>
    <p>{data.childPolicy||'Children under 3 are free and children aged 3–11 receive 50% off.'}</p>
   </div>
   {error&&!data.items?.length&&<p className="form-error external-load-error" role="alert">{error}</p>}
   <div className="external-excursion-grid">
    {(data.items||[]).map(item=><article key={item.id} className={selected?.id===item.id?'selected':''}>
     <div className="external-card-cover">{excursionPhoto(item)?<img src={excursionPhoto(item)} loading="lazy" alt={item.name}/>:<Sparkles/>}</div>
     <small>{item.group}</small>
     <h3>{item.name}</h3>
     <p>{item.detail}</p>
     <div className="external-price">
      <strong>{item.cents?money(item.cents):'Ask us'}</strong>
      {item.cents>0&&<span>{item.pricingUnit==='couple'?'/ couple':'/ adult'}</span>}
     </div>
     <div className="external-card-actions">
      <Link className="external-view-details" href={'/book/excursions/details/'+encodeURIComponent(item.id)}>View details</Link>
      <button type="button" onClick={()=>choose(item)}>{selected?.id===item.id?'Selected':'Book this excursion'} <ArrowRight/></button>
     </div>
    </article>)}
   </div>
  </section>

  <section className="external-booking-zone" id="external-excursion-form">
   <div className="booking-intro">
    <span className="eyebrow">BOOK YOUR TRIP</span>
    <h2>Book your excursion.</h2>
    <p>If a scheduled departure has space, your seats are reserved straight away. Otherwise our team schedules your trip and lets you know.</p>
    <div className="booking-points">
     <span><CheckCircle2/> WhatsApp number required for trip updates</span>
     <span><CheckCircle2/> Every passenger name and age category recorded</span>
     <span><CheckCircle2/> Snorkeling trips collect fin sizes in advance</span>
     <span><CheckCircle2/> Groups of 4+ can request a private boat for +{money(data.privateBoatSurchargeCents||5000)}</span>
    </div>
   </div>

   <form className="booking-form external-excursion-form" onSubmit={submit}>
    <div className="form-heading">
     <div><small>EXCURSION BOOKING</small><h3>{selected?.name||'Choose an excursion'}</h3></div>
     {selected&&<span className="available">{guests.length} {guests.length===1?'guest':'guests'}</span>}
    </div>

    <label><span>Excursion</span>
     <select required value={selected?.id||''} onChange={event=>{const item=(data.items||[]).find(value=>value.id===event.target.value)||null;setSelected(item);setPrivateBoat(false);}}>
      <option value="">Choose excursion</option>
      {(data.items||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </select>
    </label>
    <div className="form-grid">
     <label><span>{selected?.id==='special-package'?'Package start date':'Excursion date'}</span><input required type="date" min={data.today||undefined} value={date} onChange={event=>setDate(event.target.value)}/>{selected?.id==='special-package'&&<small>We’ll automatically split the package across compatible available trips from this date onward. If every included activity cannot be covered safely, it stays pending for our excursions team.</small>}</label>
     <label><span>Family / group name (optional)</span><input maxLength={100} value={groupName} onChange={event=>setGroupName(event.target.value)} placeholder="e.g. Ahmed family"/></label>
    </div>

    <div className="form-divider"><span>Contact & pickup</span></div>
    <div className="form-grid">
     <label><span>Email</span><input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@example.com"/><small>Your private manage-excursion link is sent here</small></label>
     <label><span>WhatsApp / contact number</span><input required type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+960..."/><small>Include country code</small></label>
    </div>
    <div className="form-grid">
     <label><span>Hotel / pickup location</span><input required maxLength={150} value={hotel} onChange={event=>setHotel(event.target.value)} placeholder="Hotel, guesthouse or meeting point"/></label>
     <label><span>Room number (optional)</span><input maxLength={50} value={room} onChange={event=>setRoom(event.target.value)} placeholder="Room"/></label>
    </div>
    <label className="external-check"><span><input type="checkbox" checked={buggyRequested} onChange={event=>setBuggyRequested(event.target.checked)}/> Request buggy pickup</span><small>For pickup on Dhiffushi when available.</small></label>

    <div className="form-divider"><span>Passenger details</span></div>
    <div className="external-roster-head">
     <div><strong>{guests.length} {guests.length===1?'passenger':'passengers'}</strong><small>Name and age category are required for everyone.</small></div>
     <button type="button" onClick={addGuest} disabled={guests.length>=20}><Plus/> Add guest</button>
    </div>

    <div className="external-roster">
     {guests.map((guest,index)=><div className="external-guest-row" key={index}>
      <span className="external-guest-number">{index+1}</span>
      <label><span>Guest name</span><input required maxLength={100} value={guest.name} onChange={event=>updateGuest(index,{name:event.target.value})} placeholder={index===0?'Lead guest full name':'Guest '+(index+1)+' full name'}/></label>
      <label><span>Age category</span><select required value={guest.ageCategory} onChange={event=>updateGuest(index,{ageCategory:event.target.value as Guest['ageCategory']})}><option value="adult">Adult (12+)</option><option value="child">Child (3–11)</option><option value="infant">Under 3</option></select></label>
      {selected?.needsFootSizes&&<label><span>EU foot size</span><input required type="number" inputMode="numeric" min={15} max={50} step={1} value={guest.footSize} onChange={event=>updateGuest(index,{footSize:event.target.value})} placeholder="e.g. 42"/><small>For snorkeling fins</small></label>}
      <button className="external-remove" type="button" aria-label={'Remove guest '+(index+1)} disabled={guests.length===1} onClick={()=>removeGuest(index)}><Trash2/></button>
     </div>)}
    </div>

    {guests.length>=4&&<label className="external-private-boat"><span><input type="checkbox" checked={privateBoat} onChange={event=>setPrivateBoat(event.target.checked)}/> Request a private boat for this group <strong>+{money(data.privateBoatSurchargeCents||5000)}</strong></span><small>The excursion manager will assign a dedicated boat, crew and departure time.</small></label>}

    <label><span>Notes (optional)</span><textarea rows={4} maxLength={1000} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Pickup details, special requests, accessibility needs or anything our team should know."/></label>

    <div className="external-quote">
     <div><small>PASSENGERS</small><strong>{adults} adult · {children} child · {infants} under 3</strong></div>
     <div><small>ESTIMATED TOTAL</small><strong>{selected?.cents?money(totalEstimate):'To be confirmed'}</strong></div>
    </div>
    <p className="external-policy">{data.childPolicy}</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="submit-booking" disabled={busy||!selected||!date}>{busy?'Sending booking…':'Reserve excursion'} <ArrowRight/></button>
    <p className="privacy-note"><ShieldCheck/> No account needed. We email you a private link to see your trip status, payment, changes and cancellation.</p>
   </form>
  </section>

 </div>;
}
