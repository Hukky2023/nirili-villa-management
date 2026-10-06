'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,CheckCircle2,Clock,MapPin,ShieldCheck,Sparkles,Users,Waves} from 'lucide-react';
import {SITES} from '../../../lib/public-sites';
import {WHATSAPP,img} from '../../hotel/chrome';
import TimeField24 from '../../time-field-24';

type Activity={id:string;name:string;detail:string;durationMinutes:number;cents:number;pricingUnit:'person'|'ride';maxPeople:number};

const PHOTOS:[string,string][]=[
 ['jet','1564633351631-e85bd59a91af'],['parasail','1505738313577-5357ff512f16'],['banana','1755865984882-72738b754c39'],
 ['tube','1766207474098-03689bd2a8a2'],['kayak','1620903669944-de50fbe78210'],['paddle','1580779386717-5237a8a283f1'],
];
const photoFor=(a:Activity)=>{const key=(a.id+' '+a.name).toLowerCase();const hit=PHOTOS.find(([k])=>key.includes(k));return hit?img(hit[1],1000):''};
const money=(cents:number)=>'$'+(Math.max(0,cents)/100).toFixed(cents%100?2:0);
const priceLabel=(a:Activity)=>a.cents?money(a.cents)+(a.pricingUnit==='ride'?' / ride':' / person'):'Ask us';
const estimate=(a:Activity|undefined,people:number)=>!a||!a.cents?0:a.cents*(a.pricingUnit==='ride'?Math.ceil(people/Math.max(1,a.maxPeople)):people);
const niceDate=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'';

export default function WaterSportsSite(){
 const [activities,setActivities]=useState<Activity[]|null>(null),[today,setToday]=useState('');
 const [activityId,setActivityId]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState(''),[people,setPeople]=useState(2);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[hotel,setHotel]=useState(''),[room,setRoom]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<any>(null),[detailId,setDetailId]=useState('');
 const token=useRef('');

 useEffect(()=>{
  token.current=crypto.randomUUID();
  fetch('/api/public-water-sports',{cache:'no-store'}).then(async r=>{const d:any=await r.json();if(!r.ok||d.error)throw Error(d.error||'Could not load activities.');
   setActivities(d.activities||[]);setToday(d.today||'');setDate(d.today||'');
   const wanted=new URLSearchParams(window.location.search).get('activity');
   const first=wanted&&(d.activities||[]).some((a:Activity)=>a.id===wanted)?wanted:(d.activities||[])[0]?.id||'';
   setActivityId(first);
   if(wanted)window.setTimeout(()=>document.getElementById('book')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }).catch((e:any)=>{setActivities([]);setError(e.message||'Could not load activities.')});
 },[]);

 const selected=activities?.find(a=>a.id===activityId);
 function choose(a:Activity){setActivityId(a.id);setError('');setDone(null);window.setTimeout(()=>document.getElementById('book')?.scrollIntoView({behavior:'smooth',block:'start'}),40)}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy||!selected)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/public-water-sports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current,activityId,date,time,participants:people,name,phone,email,hotel,room,notes})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not book.');
   setDone(d.booking);window.scrollTo({top:0,behavior:'smooth'});
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 function again(){setDone(null);token.current=crypto.randomUUID();setNotes('')}

 if(done)return <div className="guest-booking-site external-excursion-site">
  <section className="booking-success external-success">
   <div className="success-mark"><CheckCircle2/></div>
   <span className="eyebrow">NIRILI WATER SPORTS · DHIFFUSHI</span>
   <h1>Your water sports request is received.</h1>
   <p>Our team will confirm the activity time and final arrangements with you on WhatsApp.</p>
   <div className="success-ref"><small>BOOKING REFERENCE</small><strong>{done.id}</strong></div>
   <div className="success-details">
    <span><Waves/> {done.activityName}</span>
    <span><CalendarDays/> {done.date}{done.time?' · '+done.time:''}</span>
    <span><Users/> {done.participants} {done.participants===1?'guest':'guests'}</span>
   </div>
   <p className="success-note">Reserve now, pay later. Keep this reference until your session is confirmed.</p>
   <div className="external-success-actions">
    <button className="primary" onClick={again}>Book another activity <ArrowRight/></button>
    <a href={SITES.main}><ArrowLeft/> Back to Nirili</a>
   </div>
  </section>
 </div>;

 return <div className="guest-booking-site external-excursion-site">
  <section className="quick-strip">
   <article><ShieldCheck/><div><strong>No login needed</strong><span>Book using your WhatsApp number</span></div></article>
   <article><CheckCircle2/><div><strong>Reserve now, pay later</strong><span>We confirm your slot before payment</span></div></article>
   <article><MapPin/><div><strong>Dhiffushi lagoon</strong><span>Activities arranged locally around the island</span></div></article>
  </section>

  <section className="external-excursion-list" id="activities">
   <div className="section-head">
    <span className="eyebrow">NIRILI WATER SPORTS</span>
    <h2>Choose your lagoon adventure.</h2>
    <p>Jet ski, parasailing, banana boat, tube rides, kayak and paddleboard. Select an activity and send your preferred date and time.</p>
   </div>
   {activities===null?<p className="nh-exc-none">Loading activities…</p>:!activities.length?<p className="form-error external-load-error">{error||'No water sports are available right now.'} <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>.</p>:
   <div className="external-excursion-grid">{activities.map(a=>{const photo=photoFor(a);const open=detailId===a.id;return <article key={a.id} className={a.id===activityId?'selected':''}>
    <div className="external-card-cover">{photo?<img src={photo} alt={a.name} loading="lazy"/>:<Waves/>}</div>
    <small>{a.durationMinutes?a.durationMinutes+' MINUTES':'WATER SPORTS'}</small>
    <h3>{a.name}</h3>
    <p>{a.detail}</p>
    <div className="external-price"><strong>{priceLabel(a)}</strong></div>
    {open&&<div className="ws-inline-details">
     <span><Clock/> {a.durationMinutes?a.durationMinutes+' minutes':'Duration confirmed with booking'}</span>
     <span><Users/> {a.pricingUnit==='ride'?'Up to '+a.maxPeople+' per ride':'Price per person'}</span>
     <span><CheckCircle2/> Time confirmed after availability check</span>
    </div>}
    <div className="external-card-actions">
     <button type="button" className="external-view-details ws-detail-button" onClick={()=>setDetailId(open?'':a.id)}>{open?'Hide details':'View details'}</button>
     <button type="button" onClick={()=>choose(a)}>{a.id===activityId?'Selected':'Book this'} <ArrowRight/></button>
    </div>
   </article>})}</div>}
  </section>

  <section className="external-booking-zone" id="book">
   <div className="booking-intro">
    <span className="eyebrow">BOOK YOUR SESSION</span>
    <h2>Book water sports.</h2>
    <p>Choose your activity, date and preferred time. We will confirm availability and the final session time on WhatsApp.</p>
    <div className="booking-points">
     <span><CheckCircle2/> WhatsApp number required for booking updates</span>
     <span><CheckCircle2/> Preferred time uses 24-hour format</span>
     <span><CheckCircle2/> Price updates automatically from the selected activity</span>
     <span><CheckCircle2/> Hotel and room details help us coordinate your meeting point</span>
    </div>
   </div>

   <form className="booking-form external-excursion-form" onSubmit={submit}>
    <div className="form-heading">
     <div><small>WATER SPORTS BOOKING</small><h3>{selected?.name||'Choose an activity'}</h3></div>
     {selected&&<span className="available">{people} {people===1?'guest':'guests'}</span>}
    </div>
    <label><span>Activity</span><select required value={activityId} onChange={e=>setActivityId(e.target.value)}><option value="">Choose an activity</option>{(activities||[]).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <div className="form-grid">
     <label><span>Date</span><input required type="date" min={today||undefined} value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label><span>Preferred time</span><TimeField24 value={time} onChange={e=>setTime(e.target.value)} aria-label="Preferred time"/></label>
    </div>
    <label><span>Number of people</span><select value={people} onChange={e=>setPeople(Number(e.target.value))}>{Array.from({length:20},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</select></label>

    <div className="form-divider"><span>Contact & stay details</span></div>
    <div className="form-grid">
     <label><span>Lead guest name</span><input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></label>
     <label><span>WhatsApp / contact number</span><input required maxLength={30} inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960..."/><small>Include country code</small></label>
    </div>
    <div className="form-grid">
     <label><span>Email (optional)</span><input type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
     <label><span>Hotel / guesthouse</span><input maxLength={150} value={hotel} onChange={e=>setHotel(e.target.value)} placeholder="Where you are staying"/></label>
    </div>
    <label><span>Room number (optional)</span><input maxLength={40} value={room} onChange={e=>setRoom(e.target.value)} placeholder="Room"/></label>
    <label><span>Notes (optional)</span><textarea rows={4} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Children's ages, swimming ability, special requests or anything we should know."/></label>

    <div className="external-quote">
     <div><small>SESSION</small><strong>{niceDate(date)||'Choose a date'}{time?' · '+time:''}</strong></div>
     <div><small>ESTIMATED TOTAL</small><strong>{estimate(selected,people)?money(estimate(selected,people)):'To be confirmed'}</strong></div>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="submit-booking" disabled={busy||!selected||!date}>{busy?'Sending booking…':'Reserve activity'} <ArrowRight/></button>
    <p className="privacy-note"><ShieldCheck/> No account needed. Our team confirms the activity and session time with you directly.</p>
   </form>
  </section>
 </div>;
}
