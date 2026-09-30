'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCircle2,Clock,Users,Waves} from 'lucide-react';
import {SITES} from '../../../lib/public-sites';
import {WHATSAPP,img} from '../../hotel/chrome';
import TimeField24 from '../../time-field-24';

type Activity={id:string;name:string;detail:string;durationMinutes:number;cents:number;pricingUnit:'person'|'ride';maxPeople:number};

// Stock photos until Nirili has its own; matched by activity id, then by name.
const PHOTOS:[string,string][]=[
 ['jet','1564633351631-e85bd59a91af'],['parasail','1505738313577-5357ff512f16'],['banana','1755865984882-72738b754c39'],
 ['tube','1766207474098-03689bd2a8a2'],['kayak','1620903669944-de50fbe78210'],['paddle','1580779386717-5237a8a283f1'],
];
const photoFor=(a:Activity)=>{const key=(a.id+' '+a.name).toLowerCase();const hit=PHOTOS.find(([k])=>key.includes(k));return hit?img(hit[1],900):''};
const money=(cents:number)=>'$'+(cents/100).toFixed(cents%100?2:0);
const priceLabel=(a:Activity)=>a.cents?money(a.cents)+' per '+(a.pricingUnit==='ride'?(a.maxPeople>1?'ride (up to '+a.maxPeople+')':'ride'):'person'):'Price confirmed when we book you in';
const estimate=(a:Activity|undefined,people:number)=>!a||!a.cents?0:a.cents*(a.pricingUnit==='ride'?Math.ceil(people/Math.max(1,a.maxPeople)):people);
const niceDate=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'';

export default function WaterSportsSite(){
 const [activities,setActivities]=useState<Activity[]|null>(null),[today,setToday]=useState('');
 const [activityId,setActivityId]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState(''),[people,setPeople]=useState(2);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[hotel,setHotel]=useState(''),[room,setRoom]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<any>(null);
 const token=useRef('');

 useEffect(()=>{
  token.current=crypto.randomUUID();
  fetch('/api/public-water-sports',{cache:'no-store'}).then(r=>r.json()).then((d:any)=>{
   if(d.error)throw Error(d.error);
   setActivities(d.activities||[]);setToday(d.today||'');setDate(d.today||'');
   const wanted=new URLSearchParams(window.location.search).get('activity');
   if(wanted&&(d.activities||[]).some((a:Activity)=>a.id===wanted))setActivityId(wanted);
  }).catch((e:any)=>{setActivities([]);setError(e.message||'Could not load activities.')});
 },[]);

 const selected=activities?.find(a=>a.id===activityId);
 function choose(a:Activity){setActivityId(a.id);document.getElementById('book')?.scrollIntoView({behavior:'smooth'})}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/public-water-sports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current,activityId,date,time,participants:people,name,phone,email,hotel,room,notes})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not book.');
   setDone(d.booking);window.scrollTo({top:document.getElementById('book')?.offsetTop||0,behavior:'smooth'});
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 function again(){setDone(null);token.current=crypto.randomUUID();setNotes('')}

 return <>
  <section className="nh-exc-section" id="activities">
   <div className="nh-exc-head"><h2>Choose your <em>activity</em></h2><p>Sessions run in the lagoon around Dhiffushi with our local water sports partner. Tap an activity to book it.</p></div>
   {activities===null?<p className="nh-exc-none">Loading activities…</p>:!activities.length?<p className="nh-exc-none">{error||'No water sports are available to book right now.'} <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>.</p>:
   <div className="nh-exc-grid">{activities.map(a=>{const photo=photoFor(a);return <button type="button" key={a.id} className={'nh-exc-card nh-ws-card'+(a.id===activityId?' is-selected':'')} onClick={()=>choose(a)}>
    <span className="nh-exc-media">{photo?<img src={photo} alt={a.name} loading="lazy"/>:<span className="nh-exc-empty"><Waves/></span>}</span>
    <span className="nh-exc-body">
     <small>{a.durationMinutes?a.durationMinutes+' minutes':'Water sports'}</small>
     <strong>{a.name}</strong>
     <span>{a.detail}</span>
     <em className="nh-ws-price">{priceLabel(a)}</em>
     <b>{a.id===activityId?<>Selected <CheckCircle2/></>:<>Book this <ArrowRight/></>}</b>
    </span>
   </button>})}</div>}
  </section>

  <section className="nh-transfer nh-ws-book" id="book">
   {done?<div className="nh-transfer-done">
    <CheckCircle2/>
    <p className="nh-kicker">Booking received</p>
    <h2>You&rsquo;re on <em>the list.</em></h2>
    <p>We&rsquo;ll confirm your {done.activityName.toLowerCase()} slot on WhatsApp shortly. Keep your reference handy.</p>
    <strong>{done.id}</strong>
    <div className="nh-hero-actions"><button type="button" className="nh-btn nh-btn-outline" onClick={again}>Book another activity</button><a className="nh-btn nh-btn-primary" href={SITES.main+'/'}>Back to Nirili <ArrowRight/></a></div>
   </div>:<>
   <form className="nh-transfer-form" onSubmit={submit}>
    <div className="nh-step">
     <h3>Your session</h3>
     <label><span><Waves/>Activity</span><select required value={activityId} onChange={e=>setActivityId(e.target.value)}><option value="">Choose an activity</option>{(activities||[]).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
     <div className="nh-fields nh-fields-3">
      <label><span><CalendarDays/>Date</span><input required type="date" min={today||undefined} value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label><span><Clock/>Preferred time</span><TimeField24 value={time} onChange={e=>setTime(e.target.value)} aria-label="Preferred time"/></label>
      <label><span><Users/>People</span><select value={people} onChange={e=>setPeople(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</select></label>
     </div>
    </div>
    <div className="nh-step">
     <h3>Your details</h3>
     <div className="nh-fields">
      <label><span>Name</span><input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Lead guest"/></label>
      <label><span>WhatsApp</span><input required maxLength={30} inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960 7XX XXXX"/></label>
     </div>
     <div className="nh-fields nh-fields-3">
      <label><span>Email (optional)</span><input type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label><span>Where you&rsquo;re staying</span><input maxLength={150} value={hotel} onChange={e=>setHotel(e.target.value)} placeholder="Hotel or guesthouse"/></label>
      <label><span>Room (optional)</span><input maxLength={40} value={room} onChange={e=>setRoom(e.target.value)}/></label>
     </div>
     <label><span>Notes (optional)</span><textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ages of children, swimming ability, anything we should know"/></label>
    </div>
    {error&&<p className="nh-error" role="alert">{error}</p>}
    <p className="nh-fare-inline"><span>Estimated total</span><strong>{estimate(selected,people)?money(estimate(selected,people)):'On request'}</strong></p>
    <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy||!activities?.length}>{busy?'Sending…':'Request booking'} <ArrowRight/></button>
   </form>
   <aside className="nh-fare">
    <p className="nh-kicker">Your booking</p>
    <dl>
     <div><dt>Activity</dt><dd>{selected?.name||'Choose one'}</dd></div>
     <div><dt>Date</dt><dd>{niceDate(date)||'Choose a day'}{time?' · '+time:''}</dd></div>
     <div><dt>People</dt><dd>{people}</dd></div>
    </dl>
    <div className="nh-fare-total"><span>Estimated total</span><strong>{estimate(selected,people)?money(estimate(selected,people)):'On request'}</strong></div>
    <small>We confirm the time and price with you on WhatsApp before your session. Nothing to pay now.</small>
   </aside>
   </>}
  </section>
 </>;
}
