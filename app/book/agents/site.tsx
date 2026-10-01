'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCircle2,ClipboardList,LogOut,MapPin,MessageCircle,Plus,Ship,Trash2,X} from 'lucide-react';
import {WHATSAPP} from '../../hotel/chrome';

type Agent={id:string;name:string;contactName:string;pickup:string;discountPercent:number;autoConfirm:boolean};
type Item={id:string;name:string;detail:string;cents:number;netCents:number;pricingUnit:'guest'|'couple';group:string;needsFootSizes:boolean};
type Guest={name:string;age:'adult'|'child'|'infant';feet:string};
type Booking={
 ref:string;excursion:string;date:string;time:string;endTime:string;status:'Confirmed'|'Pending'|'Cancelled'|'Declined';
 cancelRequested:boolean;leadGuest:string;guestNames:string[];guests:number;adults:number;children:number;infants:number;
 pickup:string;room:string;phone:string;agentReference:string;notes:string;netCents:number;publicCents:number;paidCents:number;balanceCents:number;createdAt:string;
 segments:{id:string;name:string;date:string;time:string;status:string}[];
};

const money=(cents:number)=>'$'+(Math.max(0,cents)/100).toFixed(cents%100?2:0);
const niceDate=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
const newGuest=():Guest=>({name:'',age:'adult',feet:''});
// Same rule as the booking engine: under 3 free, 3–11 half price, couples priced per pair.
function priceFor(unit:number,pricingUnit:string,guests:Guest[]){
 const adults=guests.filter(g=>g.age==='adult').length,children=guests.filter(g=>g.age==='child').length;
 return pricingUnit==='couple'?unit*Math.ceil(Math.max(1,guests.length)/2):Math.round(unit*(adults+children*.5));
}
const statusClass=(b:Booking)=>b.cancelRequested?'is-request':'is-'+b.status.toLowerCase();
const statusLabel=(b:Booking)=>b.cancelRequested?'Cancellation requested':b.status==='Pending'?'Awaiting confirmation':b.status;
function voucher(b:{ref:string;excursion:string;date:string;time?:string;pickup?:string;guests:number},agent:Agent){
 return ['Your excursion with Nirili Tours','',b.excursion,niceDate(b.date)+(b.time?' · departure '+b.time+' (Maldives time)':' · departure time to be confirmed'),
  b.guests+' guest'+(b.guests===1?'':'s')+(b.pickup?' · pickup: '+b.pickup:''),'Reference: '+b.ref,'','Booked by '+agent.name+'. Please be ready 10 minutes before departure.'].join('\n');
}
const waLink=(phone:string,message:string)=>'https://wa.me/'+phone.replace(/\D/g,'')+'?text='+encodeURIComponent(message);

export default function AgentPortal(){
 const [agent,setAgent]=useState<Agent|null|undefined>(undefined);
 const [tab,setTab]=useState<'book'|'bookings'>('book');
 const [items,setItems]=useState<Item[]>([]),[today,setToday]=useState(''),[surcharge,setSurcharge]=useState(0),[bookings,setBookings]=useState<Booking[]>([]);
 const [loadError,setLoadError]=useState('');

 const load=useCallback(async()=>{
  try{
   const r=await fetch('/api/agent-portal/bookings',{cache:'no-store'}),d:any=await r.json();
   if(r.status===401){setAgent(null);return;}
   if(!r.ok)throw Error(d.error||'Could not load your bookings.');
   setAgent(d.agent);setItems(d.items||[]);setToday(d.today||'');setSurcharge(d.privateBoatSurchargeCents||0);setBookings(d.bookings||[]);setLoadError('');
  }catch(e){setLoadError((e as Error).message);setAgent(a=>a===undefined?null:a);}
 },[]);
 useEffect(()=>{void load();},[load]);
 // Keep confirmations fresh while the portal is open.
 useEffect(()=>{if(!agent)return;const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);return ()=>clearInterval(t);},[agent,load]);

 async function signOut(){
  await fetch('/api/agent-portal/session',{method:'DELETE'}).catch(()=>null);
  setAgent(null);setBookings([]);
 }

 if(agent===undefined)return <section className="nh-agent-wrap" id="book"><p className="nh-exc-none">Loading the partner portal…</p></section>;
 if(!agent)return <section className="nh-agent-wrap" id="book"><Login onSignedIn={()=>void load()}/></section>;

 const open=bookings.filter(b=>b.status==='Pending'||b.cancelRequested).length;
 return <section className="nh-agent-wrap" id="book">
  <div className="nh-agent-bar">
   <div><small>Partner</small><strong>{agent.name}</strong><span>{agent.discountPercent?`Your partner rate: ${agent.discountPercent}% off public prices`:'Public prices apply'} · {agent.autoConfirm?'Trips with free seats confirm instantly':'Every booking is confirmed by our team'}</span></div>
   <button type="button" onClick={()=>void signOut()}><LogOut/>Sign out</button>
  </div>
  <div className="nh-agent-tabs" role="group" aria-label="Portal section">
   <button type="button" aria-pressed={tab==='book'} onClick={()=>setTab('book')}><Plus size={16}/>New booking</button>
   <button type="button" aria-pressed={tab==='bookings'} onClick={()=>{setTab('bookings');void load();}}><ClipboardList size={16}/>My bookings{open>0&&<b>{open}</b>}</button>
  </div>
  {loadError&&<p className="nh-error" role="alert">{loadError}</p>}
  {tab==='book'
   ?<BookingForm agent={agent} items={items} today={today} surcharge={surcharge} onBooked={()=>void load()} onViewBookings={()=>setTab('bookings')}/>
   :<Bookings agent={agent} bookings={bookings} today={today} onChanged={list=>setBookings(list)}/>}
 </section>;
}

function Login({onSignedIn}:{onSignedIn:()=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/agent-portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not sign in.');
   setPassword('');onSignedIn();
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 return <form className="nh-agent-login" onSubmit={submit}>
  <p className="nh-kicker">Partner sign in</p>
  <h2>Welcome back</h2>
  <p>Sign in with the partner login Nirili Tours gave your guest house.</p>
  <label>Username<input required autoComplete="username" autoCapitalize="none" maxLength={40} value={username} onChange={e=>setUsername(e.target.value)}/></label>
  <label>Password<input required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {error&&<p className="nh-error" role="alert">{error}</p>}
  <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight/></button>
  <small>Not a partner yet? <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">Message Nirili Tours on WhatsApp</a> to set up an account for your guest house.</small>
 </form>;
}

function BookingForm({agent,items,today,surcharge,onBooked,onViewBookings}:{agent:Agent;items:Item[];today:string;surcharge:number;onBooked:()=>void;onViewBookings:()=>void}){
 const [itemId,setItemId]=useState(''),[date,setDate]=useState(today),[guests,setGuests]=useState<Guest[]>([newGuest(),newGuest()]);
 const [pickup,setPickup]=useState(agent.pickup),[room,setRoom]=useState(''),[phone,setPhone]=useState(''),[reference,setReference]=useState(''),[notes,setNotes]=useState('');
 const [privateBoat,setPrivateBoat]=useState(false),[buggy,setBuggy]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<any>(null);
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();},[]);
 useEffect(()=>{if(!date&&today)setDate(today);},[today,date]);
 const item=items.find(i=>i.id===itemId);
 const groups=useMemo(()=>[...new Set(items.map(i=>i.group||'Excursions'))],[items]);
 const canPrivate=guests.length>=4;
 const extra=privateBoat&&canPrivate?surcharge:0;
 const publicTotal=item?priceFor(item.cents,item.pricingUnit,guests)+extra:0;
 const netTotal=item?Math.round(publicTotal*(100-agent.discountPercent)/100):0;
 const setGuest=(i:number,patch:Partial<Guest>)=>setGuests(list=>list.map((g,n)=>n===i?{...g,...patch}:g));

 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const body={token:token.current,menuItemId:itemId,date,guest:guests[0]?.name||'',guestNames:guests.map(g=>g.name),guestCategories:guests.map(g=>g.age),
    footSizes:item?.needsFootSizes?guests.map(g=>Number(g.feet)):[],phone,hotel:pickup,externalRoom:room,agentReference:reference,notes,
    privateBoatRequested:privateBoat&&canPrivate,buggyRequested:buggy};
   const r=await fetch('/api/agent-portal/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not send the booking.');
   setDone({...d.booking,excursion:item?.name||'',guests:guests.length,pickup,phone});onBooked();
   document.getElementById('book')?.scrollIntoView({behavior:'smooth'});
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 function again(){setDone(null);token.current=crypto.randomUUID();setGuests([newGuest(),newGuest()]);setRoom('');setPhone('');setReference('');setNotes('');setPrivateBoat(false);setBuggy(false);}

 if(done){
  const confirmed=done.status==='Confirmed',message=voucher({ref:done.id,excursion:done.excursion,date:done.date,time:done.time,pickup:done.pickup,guests:done.guests},agent);
  return <div className="nh-transfer-done nh-agent-done">
   <CheckCircle2/>
   <p className="nh-kicker">{confirmed?'Booking confirmed':'Booking received'}</p>
   <h2>{confirmed?<>Your guests are <em>on board.</em></>:<>We&rsquo;re <em>on it.</em></>}</h2>
   <p>{confirmed?`${done.excursion} on ${niceDate(done.date)}, departing ${done.time} (Maldives time).`:`Our team will place ${done.excursion} on ${niceDate(done.date)} on a trip and confirm here. You can follow it under My bookings.`}</p>
   <strong>{done.id}</strong>
   <div className="nh-hero-actions">
    <a className="nh-btn nh-btn-outline" href={done.phone?waLink(done.phone,message):'https://wa.me/?text='+encodeURIComponent(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/> Send to guest</a>
    <button type="button" className="nh-btn nh-btn-outline" onClick={onViewBookings}>My bookings</button>
    <button type="button" className="nh-btn nh-btn-primary" onClick={again}>New booking <ArrowRight/></button>
   </div>
  </div>;
 }

 return <div className="nh-transfer">
  <form className="nh-transfer-form" onSubmit={submit}>
   <div className="nh-step">
    <h3>Excursion</h3>
    <label><span><Ship/>Excursion</span><select required value={itemId} onChange={e=>setItemId(e.target.value)}>
     <option value="">Choose an excursion</option>
     {groups.map(group=><optgroup key={group} label={group}>{items.filter(i=>(i.group||'Excursions')===group).map(i=><option key={i.id} value={i.id}>{i.name} · {i.netCents?money(i.netCents)+' per '+(i.pricingUnit==='couple'?'couple':'adult'):'price on request'}</option>)}</optgroup>)}
    </select></label>
    {item?.detail&&<p className="nh-hint">{item.detail}</p>}
    <div className="nh-fields">
     <label><span><CalendarDays/>Date</span><input required type="date" min={today||undefined} value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label><span><MapPin/>Pickup point</span><input required maxLength={150} value={pickup} onChange={e=>setPickup(e.target.value)}/></label>
    </div>
   </div>
   <div className="nh-step">
    <h3>Guests</h3>
    <div className="nh-agent-guests">
     {guests.map((g,i)=><div className={'nh-agent-guest'+(item?.needsFootSizes?'':' no-feet')} key={i}>
      <span>{i+1}</span>
      <input required maxLength={100} aria-label={'Guest '+(i+1)+' full name'} placeholder={i===0?'Lead guest full name':'Full name'} value={g.name} onChange={e=>setGuest(i,{name:e.target.value})}/>
      <select aria-label={'Guest '+(i+1)+' age'} value={g.age} onChange={e=>setGuest(i,{age:e.target.value as Guest['age']})}><option value="adult">Adult (12+)</option><option value="child">Child (3–11)</option><option value="infant">Under 3</option></select>
      {item?.needsFootSizes&&<input className="nh-agent-feet" required type="number" min={15} max={50} inputMode="numeric" aria-label={'Guest '+(i+1)+' EU foot size'} placeholder="EU foot" value={g.feet} onChange={e=>setGuest(i,{feet:e.target.value})}/>}
      <button type="button" aria-label={'Remove guest '+(i+1)} disabled={guests.length<=1} onClick={()=>setGuests(list=>list.filter((_,n)=>n!==i))}><Trash2/></button>
     </div>)}
    </div>
    {guests.length<20&&<button type="button" className="nh-agent-add" onClick={()=>setGuests(list=>[...list,newGuest()])}><Plus/>Add guest</button>}
    {item?.needsFootSizes&&<p className="nh-hint">EU foot sizes let the crew prepare snorkeling fins before departure.</p>}
   </div>
   <div className="nh-step">
    <h3>Booking details</h3>
    <div className="nh-fields nh-fields-3">
     <label><span>Guest room (optional)</span><input maxLength={50} value={room} onChange={e=>setRoom(e.target.value)}/></label>
     <label><span>Guest WhatsApp (optional)</span><input maxLength={30} inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+44 7XXX XXXXXX"/></label>
     <label><span>Your reference (optional)</span><input maxLength={60} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Your booking no."/></label>
    </div>
    {canPrivate&&<label className="nh-agent-check"><input type="checkbox" checked={privateBoat} onChange={e=>setPrivateBoat(e.target.checked)}/><span>Private boat for this group<small>Adds {money(surcharge)} before your discount. Our team confirms the time.</small></span></label>}
    <label className="nh-agent-check"><input type="checkbox" checked={buggy} onChange={e=>setBuggy(e.target.checked)}/><span>Buggy pickup from the guest house<small>We collect the group from the pickup point.</small></span></label>
    <label><span>Notes (optional)</span><textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Swimming ability, special requests, anything the crew should know"/></label>
   </div>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   <p className="nh-fare-inline"><span>You pay Nirili</span><strong>{item?money(netTotal):'—'}</strong></p>
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy||!items.length}>{busy?'Sending…':agent.autoConfirm?'Book excursion':'Send booking request'} <ArrowRight/></button>
  </form>
  <aside className="nh-fare">
   <p className="nh-kicker">Booking summary</p>
   <dl>
    <div><dt>Excursion</dt><dd>{item?.name||'Choose one'}</dd></div>
    <div><dt>Date</dt><dd>{niceDate(date)||'Choose a day'}</dd></div>
    <div><dt>Guests</dt><dd>{guests.length}</dd></div>
    {item&&agent.discountPercent>0&&<div className="nh-agent-public"><dt>Public price</dt><dd>{money(publicTotal)}</dd></div>}
   </dl>
   <div className="nh-fare-total"><span>You pay Nirili{agent.discountPercent?` (${agent.discountPercent}% partner rate)`:''}</span><strong>{item?money(netTotal):'—'}</strong></div>
   <small>Children under 3 travel free; ages 3–11 pay half. Your guest pays you and you settle with Nirili Tours each month.</small>
  </aside>
 </div>;
}

function Bookings({agent,bookings,today,onChanged}:{agent:Agent;bookings:Booking[];today:string;onChanged:(list:Booking[])=>void}){
 const [view,setView]=useState<'upcoming'|'past'|'cancelled'>('upcoming'),[query,setQuery]=useState('');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[cancelling,setCancelling]=useState<Booking|null>(null),[reason,setReason]=useState('');
 const month=today.slice(0,7);
 const thisMonth=bookings.filter(b=>b.date.startsWith(month)&&b.status!=='Cancelled'&&b.status!=='Declined');
 const owed=thisMonth.filter(b=>b.status==='Confirmed').reduce((s,b)=>s+b.netCents,0),paid=thisMonth.filter(b=>b.status==='Confirmed').reduce((s,b)=>s+b.paidCents,0);
 const q=query.trim().toLowerCase();
 const shown=bookings.filter(b=>{
  const dead=b.status==='Cancelled'||b.status==='Declined';
  if(view==='cancelled'?!dead:dead||(view==='upcoming'?b.date<today:b.date>=today))return false;
  return !q||[b.ref,b.excursion,b.leadGuest,b.agentReference,...b.guestNames].join(' ').toLowerCase().includes(q);
 });
 if(view==='upcoming')shown.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));

 async function cancel(){
  if(!cancelling||busy)return;setBusy(cancelling.ref);setError('');
  try{
   const r=await fetch('/api/agent-portal/bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',ref:cancelling.ref,reason})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not cancel.');
   onChanged(d.bookings||[]);setCancelling(null);setReason('');
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }

 return <>
  <div className="nh-agent-summary">
   <div><span>Bookings this month</span><strong>{new Set(thisMonth.map(b=>b.ref)).size}</strong></div>
   <div><span>Guests this month</span><strong>{thisMonth.reduce((s,b)=>s+b.guests,0)}</strong></div>
   <div><span>Owed to Nirili (confirmed)</span><strong>{money(owed)}</strong></div>
   <div><span>Still to settle</span><strong>{money(Math.max(0,owed-paid))}</strong></div>
  </div>
  <div className="nh-agent-filters">
   <div role="group" aria-label="Show bookings">
    {(['upcoming','past','cancelled'] as const).map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}
   </div>
   <input type="search" placeholder="Search guest, reference or excursion" value={query} onChange={e=>setQuery(e.target.value)}/>
  </div>
  {error&&<p className="nh-error" role="alert">{error}</p>}
  {shown.length?<div className="nh-agent-list">{shown.map(b=><article className="nh-agent-card" key={b.ref}>
   <header><div><small>{b.ref}{b.agentReference?' · '+b.agentReference:''}</small><h3>{b.excursion}</h3></div><span className={'nh-agent-pill '+statusClass(b)}>{statusLabel(b)}</span></header>
   <dl>
    <div><dt>Date</dt><dd>{niceDate(b.date)}</dd></div>
    <div><dt>Departure</dt><dd>{b.time?b.time+(b.endTime?'–'+b.endTime:''):'To be confirmed'}</dd></div>
    <div><dt>Guests</dt><dd>{b.guests} · {b.adults} adult{b.adults===1?'':'s'}{b.children?` · ${b.children} child${b.children===1?'':'ren'}`:''}{b.infants?` · ${b.infants} under 3`:''}</dd></div>
    <div><dt>Pickup</dt><dd>{b.pickup||agent.pickup}{b.room?' · room '+b.room:''}</dd></div>
    <div><dt>You pay Nirili</dt><dd>{b.status==='Cancelled'||b.status==='Declined'?'—':money(b.netCents)}</dd></div>
    <div><dt>Settled</dt><dd>{b.status==='Confirmed'?(b.balanceCents===0&&b.netCents>0?'Paid':money(b.paidCents)+' paid'):'—'}</dd></div>
   </dl>
   {b.segments.length>0&&<ol>{b.segments.map(s=><li key={s.id}>{s.name} · {niceDate(s.date)}{s.time?' · '+s.time:''} · {s.status}</li>)}</ol>}
   {b.guestNames.length>0&&<details><summary>Guest names</summary><ol>{b.guestNames.map((n,i)=><li key={i}>{n}</li>)}</ol></details>}
   {b.cancelRequested&&<p className="nh-agent-note">You asked us to cancel this booking. Our team will confirm shortly.</p>}
   {b.status!=='Cancelled'&&b.status!=='Declined'&&<div className="nh-agent-actions">
    <a href={b.phone?waLink(b.phone,voucher(b,agent)):'https://wa.me/?text='+encodeURIComponent(voucher(b,agent))} target="_blank" rel="noopener noreferrer"><MessageCircle/>Send to guest</a>
    {!b.cancelRequested&&b.date>=today&&<button type="button" className="is-danger" onClick={()=>{setCancelling(b);setReason('');setError('');}}><X/>{b.status==='Pending'?'Cancel':'Request cancellation'}</button>}
   </div>}
  </article>)}</div>:<div className="nh-agent-empty">{view==='upcoming'?'No upcoming bookings. Use New booking to send your first guests.':view==='past'?'No past trips yet.':'No cancelled bookings.'}</div>}
  {cancelling&&<div className="nh-agent-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-cancel-title">
   <div>
    <h3 id="agent-cancel-title">{cancelling.status==='Pending'?'Cancel this booking?':'Ask Nirili to cancel?'}</h3>
    <p>{cancelling.excursion} · {niceDate(cancelling.date)} · {cancelling.guests} guest{cancelling.guests===1?'':'s'} · {cancelling.ref}</p>
    <p>{cancelling.status==='Pending'?'The request is withdrawn straight away.':'Seats and crew are already assigned, so our team reviews the cancellation and confirms it here.'}</p>
    <label>Reason (optional)<textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {error&&<p className="nh-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={()=>setCancelling(null)} disabled={!!busy}>Keep booking</button><button type="button" className="is-danger" onClick={()=>void cancel()} disabled={!!busy}>{busy?'Sending…':cancelling.status==='Pending'?'Cancel booking':'Send request'}</button></footer>
   </div>
  </div>}
 </>;
}
