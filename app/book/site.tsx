'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCircle2,ChevronDown,Globe2,Heart,MapPin,ShieldCheck,ShipWheel,Sparkles,Users} from 'lucide-react';
import TimeField24 from '../time-field-24';

type Plan={name:string;nightlyCents:number};
type Quote={today?:string;plans?:Plan[];availableRooms?:number;bookingClosed?:boolean;nights?:number;estimates?:{name:string;nightlyCents:number;totalCents:number}[];error?:string};

const money=(cents:number)=>'$'+(Math.max(0,Number(cents)||0)/100).toFixed(0);
const tomorrow=(date:string,days=1)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);

export default function GuestBookingSite(){
 const [today,setToday]=useState(''),[checkIn,setCheckIn]=useState(''),[checkOut,setCheckOut]=useState('');
 const [adults,setAdults]=useState(2),[children,setChildren]=useState(0),[meal,setMeal]=useState('Bed & Breakfast');
 const [guest,setGuest]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[notes,setNotes]=useState('');
 const [transportPlan,setTransportPlan]=useState<any>({
  arrival:{needTransfer:'later',from:'Velana International Airport',flightNumber:'',flightTime:'',ownTransport:'',dhiffushiArrivalTime:'',buggyRequired:true},
  departure:{needTransfer:'later',destination:'Velana International Airport',flightNumber:'',flightTime:'',ownDepartureTime:'',buggyRequired:true}
 });
 function setTransport(leg:'arrival'|'departure',changes:any){setTransportPlan((old:any)=>({...old,[leg]:{...old[leg],...changes}}));}
 const [quote,setQuote]=useState<Quote>({}),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [success,setSuccess]=useState<any>(null);
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();fetch('/api/public-booking',{cache:'no-store'}).then(r=>r.json()).then((d:Quote)=>{setToday(d.today||'');const start=d.today||new Date().toISOString().slice(0,10);setCheckIn(start);setCheckOut(tomorrow(start,3));setQuote(d)}).catch(()=>{})},[]);

 const pax=adults+children;
 const selectedPlan=quote.estimates?.find(x=>x.name===meal)||quote.plans?.find(x=>x.name===meal);
 const selectedTotal=quote.estimates?.find(x=>x.name===meal)?.totalCents||0;

 useEffect(()=>{if(children>Math.max(0,3-adults))setChildren(Math.max(0,3-adults))},[adults,children]);

 async function checkAvailability(){
  if(!checkIn||!checkOut)return;
  setChecking(true);setError('');
  try{
   const params=new URLSearchParams({checkIn,checkOut,adults:String(adults),children:String(children)});
   const r=await fetch('/api/public-booking?'+params.toString(),{cache:'no-store'});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not check availability.');
   setQuote(d);
  }catch(e){setError((e as Error).message)}finally{setChecking(false)}
 }
 useEffect(()=>{if(checkIn&&checkOut){const timer=window.setTimeout(()=>void checkAvailability(),350);return()=>window.clearTimeout(timer)}},[checkIn,checkOut,adults,children]);

 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/public-booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    token:token.current,guest,phone,email,checkIn,checkOut,adults,children,meal,notes,transportPlan:{arrival:{...transportPlan.arrival,date:checkIn},departure:{...transportPlan.departure,date:checkOut}}
   })});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not complete your booking.');
   setSuccess(d);
   window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 if(success)return <main className="guest-booking-site">
  <section className="booking-success">
   <div className="success-mark"><CheckCircle2/></div>
   <span className="eyebrow">NIRILI VILLA · DHIFFUSHI</span>
   <h1>Your booking has been received.</h1>
   <p>Thank you, {guest}. Reception will review the booking, allocate your room and send your final confirmation by email.</p>
   <div className="success-ref"><small>BOOKING REFERENCE</small><strong>{success.id}</strong></div>
   <div className="success-details">
    <span><CalendarDays/> {checkIn} → {checkOut}</span>
    <span><Users/> {pax} {pax===1?'guest':'guests'}</span>
    <span><Sparkles/> {meal}</span>
   </div>
   <p className="success-note">{success.email?.sent?'We sent a booking received email to '+email+'. Final confirmation will follow after room allocation.':'Your booking is saved, but the confirmation email could not be sent yet. Please keep this booking reference and contact reception if you do not receive an email.'}</p>
   <button onClick={()=>{setSuccess(null);token.current=crypto.randomUUID();setGuest('');setPhone('');setEmail('');setNotes('');setTransportPlan({arrival:{needTransfer:'later',from:'Velana International Airport',flightNumber:'',flightTime:'',ownTransport:'',dhiffushiArrivalTime:'',buggyRequired:true},departure:{needTransfer:'later',destination:'Velana International Airport',flightNumber:'',flightTime:'',ownDepartureTime:'',buggyRequired:true}})}}>Make another booking <ArrowRight/></button>
  </section>
 </main>;

 return <main className="guest-booking-site">
  <header className="guest-nav">
   <a className="guest-brand" href="/book" aria-label="Nirili Villa guest booking home">
    <span className="brand-sun">☀</span>
    <div><strong>Nirili Villa</strong><small>DHIFFUSHI · MALDIVES</small></div>
   </a>
   <nav><a href="#stay">Stay</a><a href="/book/excursions">Excursions</a><a href="#rates">Rates</a><a href="#book">Book</a></nav>
   <a className="nav-book" href="#book"><span>Book Now</span><ArrowRight/></a>
  </header>

  <section className="hero" id="stay">
   <div className="hero-copy">
    <span className="eyebrow"><MapPin/> DHIFFUSHI ISLAND · MALDIVES</span>
    <h1>Island days.<br/><em>Easy stays.</em></h1>
    <p>Stay close to the beach, explore the Maldives with our local team, and arrange your room, meals, transfers and island experiences from one place.</p>
    <div className="hero-actions"><a className="primary" href="#book">Check your dates <ArrowRight/></a><a href="#rates">View room rates <ChevronDown/></a></div>
    <div className="trust-row"><span><Heart/> Local Dhiffushi hospitality</span></div>
   </div>
   <div className="hero-card">
    <img className="hero-card-photo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Dhiffushi-Maldives-Andres_Larin.jpg/1280px-Dhiffushi-Maldives-Andres_Larin.jpg" alt="Aerial view of Dhiffushi island in Kaafu Atoll, Maldives" width={1280} height={959} fetchPriority="high"/>
    <div className="hero-card-copy"><small>YOUR DHIFFUSHI BASE</small><strong>14-room island guesthouse</strong><span>Arrive as a Guest, Leave as a Friend.</span><p className="hero-photo-credit">Dhiffushi · Photo: <a href="https://commons.wikimedia.org/wiki/File:Dhiffushi-Maldives-Andres_Larin.jpg" target="_blank" rel="noopener noreferrer">Andres Larin / Saaremees</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p></div>
   </div>
  </section>

  <section className="quick-strip">
   <article><ShipWheel/><div><strong>Airport transfers</strong><span>Shared speedboat arrangements available</span></div></article>
   <article><Sparkles/><div><strong>Island experiences</strong><span>Snorkeling, sandbanks, fishing and more</span><a className="inline-excursion-cta" href="/book/excursions">External guest? Book excursions <ArrowRight/></a></div></article>
   <article><Globe2/><div><strong>Simple booking</strong><span>Book direct — no account or portal access</span></div></article>
  </section>

  <section className="rates" id="rates">
   <div className="section-head"><span className="eyebrow">ROOM + MEALS</span><h2>Choose the stay that fits your trip.</h2><p>Rates below update for your selected number of guests. Final room allocation is confirmed by reception.</p></div>
   <div className="rate-grid">
    {(quote.estimates||quote.plans||[]).map((plan:any,index:number)=><article className={meal===plan.name?'selected':''} key={plan.name} onClick={()=>setMeal(plan.name)}>
     <small>{index===0?'FLEXIBLE STAY':index===1?'MORE INCLUDED':'FULL ISLAND DAYS'}</small>
     <h3>{plan.name}</h3>
     <div className="price"><strong>{money(plan.nightlyCents)}</strong><span>/ room / night</span></div>
     <p>{plan.name==='Bed & Breakfast'?'Breakfast included. Keep lunch and dinner flexible.':plan.name==='Half Board'?'Breakfast plus one main daily meal included.':'Breakfast, lunch and dinner included during your stay.'}</p>
     <button type="button" onClick={()=>{setMeal(plan.name);document.getElementById('book')?.scrollIntoView({behavior:'smooth'})}}>Choose {plan.name}</button>
    </article>)}
   </div>
  </section>

  <section className="booking-zone" id="book">
   <div className="booking-intro">
    <span className="eyebrow">BOOK DIRECT</span>
    <h2>Book your Nirili Villa stay.</h2>
    <p>Choose your dates and stay details. Your booking goes directly to reception for room allocation and confirmation.</p>
    <div className="booking-points"><span><CheckCircle2/> No management-system account</span><span><CheckCircle2/> Live room availability check</span><span><CheckCircle2/> Reception confirms your booking</span></div>
   </div>
   <form className="booking-form" onSubmit={submit}>
    <div className="form-heading"><div><small>ROOM BOOKING</small><h3>Your trip details</h3></div>{quote.availableRooms!==undefined&&<span className={quote.availableRooms>0?'available':'unavailable'}>{quote.bookingClosed?'Bookings closed for selected dates':quote.availableRooms>0?quote.availableRooms+' rooms available':'No rooms available'}</span>}</div>
    <div className="form-grid dates">
     <label><span>Check-in</span><input required type="date" min={today||undefined} value={checkIn} onChange={e=>{setCheckIn(e.target.value);if(e.target.value>=checkOut)setCheckOut(tomorrow(e.target.value,1))}}/></label>
     <label><span>Check-out</span><input required type="date" min={checkIn?tomorrow(checkIn,1):today||undefined} value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label>
    </div>
    <div className="form-grid">
     <label><span>Adults</span><select value={adults} onChange={e=>setAdults(Number(e.target.value))}>{[1,2,3].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
     <label><span>Children</span><select value={children} onChange={e=>setChildren(Number(e.target.value))}>{Array.from({length:Math.max(1,4-adults)},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label>
    </div>
    <label><span>Meal plan</span><select value={meal} onChange={e=>setMeal(e.target.value)}>{['Bed & Breakfast','Half Board','Full Board'].map(x=><option key={x}>{x}</option>)}</select></label>

    <div className="quote-box">
     <div><small>{checking?'CHECKING…':quote.bookingClosed?'BOOKINGS CLOSED':quote.availableRooms!==undefined?'LIVE AVAILABILITY':'ESTIMATED STAY'}</small><strong>{quote.nights||Math.max(0,(Date.parse(checkOut)-Date.parse(checkIn))/86400000)||0} nights · {pax} {pax===1?'guest':'guests'}</strong></div>
     <div><small>ESTIMATED ACCOMMODATION</small><strong>{selectedTotal?money(selectedTotal):selectedPlan?money(selectedPlan.nightlyCents)+' / night':'—'}</strong></div>
    </div>

    <div className="form-divider"><span>Guest details</span></div>
    <label><span>Lead guest name</span><input required maxLength={100} autoComplete="name" value={guest} onChange={e=>setGuest(e.target.value)} placeholder="Full name"/></label>
    <div className="form-grid">
     <label><span>WhatsApp / contact</span><input required type="tel" maxLength={30} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960…"/><small>Include country code</small></label>
     <label><span>Email</span><input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/><small>Booking confirmations are sent here</small></label>
    </div>
    <div className="form-divider"><span>Travel & transport</span></div>
    <p className="transport-help">Tell us how you are arriving and leaving Dhiffushi. We will coordinate the speedboat and the harbour buggy with your room booking.</p>
    <div className="transport-plan-grid">
     <section className="transport-plan-card">
      <div className="transport-plan-title"><strong>Arrival · {checkIn}</strong><small>Getting to Nirili Villa</small></div>
      <label><span>Need us to arrange Airport → Dhiffushi transfer?</span><select value={transportPlan.arrival.needTransfer} onChange={e=>setTransport('arrival',{needTransfer:e.target.value})}><option value="yes">Yes — arrange it for me</option><option value="no">No — I have my own transport</option><option value="later">I will confirm later</option></select></label>
      {transportPlan.arrival.needTransfer==='yes'&&<>
       <label><span>Arriving from</span><input maxLength={120} value={transportPlan.arrival.from} onChange={e=>setTransport('arrival',{from:e.target.value})} placeholder="Velana International Airport"/></label>
       <div className="form-grid"><label><span>Arrival flight number (optional)</span><input maxLength={40} value={transportPlan.arrival.flightNumber} onChange={e=>setTransport('arrival',{flightNumber:e.target.value})} placeholder="e.g. EK656"/></label><label><span>Flight arrival time (24-hour)</span><input type="text" inputMode="numeric" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" placeholder="HH:mm" value={transportPlan.arrival.flightTime} onChange={e=>setTransport('arrival',{flightTime:e.target.value})}/></label></div>
       <p className="transport-auto">We will match your flight to the safest available launch. Your Dhiffushi harbour → Nirili Villa buggy is linked automatically.</p>
      </>}
      {transportPlan.arrival.needTransfer==='no'&&<>
       <label><span>How will you reach Dhiffushi?</span><select value={transportPlan.arrival.ownTransport} onChange={e=>setTransport('arrival',{ownTransport:e.target.value})}><option value="">Choose transport</option><option>Private speedboat</option><option>Public ferry</option><option>Another hotel/operator boat</option><option>Other</option></select></label>
       <label><span>Expected arrival at Dhiffushi harbour (24-hour)</span><input type="text" inputMode="numeric" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" placeholder="HH:mm" value={transportPlan.arrival.dhiffushiArrivalTime} onChange={e=>setTransport('arrival',{dhiffushiArrivalTime:e.target.value})}/></label>
       <p className="transport-auto">We will arrange your harbour → Nirili Villa buggy from this arrival time.</p>
      </>}
      {transportPlan.arrival.needTransfer==='later'&&<p className="transport-pending">You can add your flight or arrival details later from your manage-booking link.</p>}
     </section>
     <section className="transport-plan-card">
      <div className="transport-plan-title"><strong>Departure · {checkOut}</strong><small>Leaving Nirili Villa</small></div>
      <label><span>Need us to arrange your departure launch?</span><select value={transportPlan.departure.needTransfer} onChange={e=>setTransport('departure',{needTransfer:e.target.value})}><option value="yes">Yes — arrange it for me</option><option value="no">No — I have my own transport</option><option value="later">I will confirm later</option></select></label>
      {transportPlan.departure.needTransfer==='yes'&&<>
       <label><span>Destination</span><input maxLength={120} value={transportPlan.departure.destination} onChange={e=>setTransport('departure',{destination:e.target.value})} placeholder="Velana International Airport, Malé, another island…"/></label>
       <div className="form-grid"><label><span>Departure flight number (if flying)</span><input maxLength={40} value={transportPlan.departure.flightNumber} onChange={e=>setTransport('departure',{flightNumber:e.target.value})} placeholder="e.g. EK657"/></label><label><span>Flight departure time (24-hour)</span><input type="text" inputMode="numeric" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" placeholder="HH:mm" value={transportPlan.departure.flightTime} onChange={e=>setTransport('departure',{flightTime:e.target.value})}/></label></div>
       <p className="transport-auto">Reception will choose a safe Dhiffushi departure for your destination. Your Nirili Villa → harbour buggy will be scheduled 15 minutes before the launch.</p>
      </>}
      {transportPlan.departure.needTransfer==='no'&&<>
       <label><span>Your planned harbour departure time (24-hour)</span><input type="text" inputMode="numeric" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" placeholder="HH:mm" value={transportPlan.departure.ownDepartureTime} onChange={e=>setTransport('departure',{ownDepartureTime:e.target.value})}/></label>
       <p className="transport-auto">We will schedule the Nirili Villa → harbour buggy 15 minutes before this time.</p>
      </>}
      {transportPlan.departure.needTransfer==='later'&&<p className="transport-pending">You can complete departure transport later. Reception will see that details are still required.</p>}
     </section>
    </div>
        <label><span>Special requests (optional)</span><textarea rows={4} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Arrival details, dietary requests, transfer help, celebration, or anything else we should know."/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="submit-booking" disabled={busy||checking||quote.availableRooms===0}>{busy?'Booking…':'Book Your Stay'} <ArrowRight/></button>
    <p className="privacy-note"><ShieldCheck/> Your booking goes to Nirili Villa reception. A confirmation email is sent after the room is approved. This form does not create management-system access.</p>
   </form>
  </section>

  <footer className="guest-footer">
   <div className="guest-brand"><span className="brand-sun">☀</span><div><strong>Nirili Villa</strong><small>DHIFFUSHI · MALDIVES</small></div></div>
   <p>Arrive as a Guest, Leave as a Friend.</p>
   <a href="#book">Book your stay <ArrowRight/></a>
  </footer>
 </main>;
}
