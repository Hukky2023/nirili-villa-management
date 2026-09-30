'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCircle2,ChevronDown,Globe2,MapPin,ShieldCheck,ShipWheel,Sparkles,Users} from 'lucide-react';
import TimeField24 from '../time-field-24';

type Plan={name:string;nightlyCents:number};
type Package={id:string;name:string;nights:number;days:number;mealPlan:string;excursions:string[];excursionNames?:string[];includeTransfer:boolean;transferLabel:string;singleCents:number;doubleCents:number;tripleCents:number;childPolicy:string;roomPhoto?:string;excursionPhoto?:string;youtubeUrl?:string};
type Promotion={id:string;name:string;detail:string;packageIds:string[];roomTypes:string[];validFrom:string;validTo:string};
type Quote={today?:string;plans?:Plan[];packages?:Package[];promotions?:Promotion[];availableRooms?:number;bookingClosed?:boolean;nights?:number;estimates?:{name:string;nightlyCents:number;totalCents:number}[];error?:string};

const money=(cents:number)=>'$'+(Math.max(0,Number(cents)||0)/100).toFixed(0);
const tomorrow=(date:string,days=1)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);

export default function GuestBookingSite(){
 const [today,setToday]=useState(''),[checkIn,setCheckIn]=useState(''),[checkOut,setCheckOut]=useState('');
 const [adults,setAdults]=useState(2),[children,setChildren]=useState(0),[meal,setMeal]=useState('Bed & Breakfast'),[packageId,setPackageId]=useState('');
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
 const selectedPackage=quote.packages?.find(x=>x.id===packageId);
 const packageRatePerGuest=selectedPackage?(pax<=1?selectedPackage.singleCents:pax===2?selectedPackage.doubleCents:selectedPackage.tripleCents):0;
 const packageTotal=selectedPackage?packageRatePerGuest*pax:0;
 const selectedTotal=selectedPackage?packageTotal:(quote.estimates?.find(x=>x.name===meal)?.totalCents||0);

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
    token:token.current,guest,phone,email,checkIn,checkOut,adults,children,meal,packageId,notes,transportPlan:{arrival:{...transportPlan.arrival,date:checkIn},departure:{...transportPlan.departure,date:checkOut}}
   })});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not complete your booking.');
   setSuccess(d);
   window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 if(success)return <div className="guest-booking-site">
  <section className="booking-success">
   <div className="success-mark"><CheckCircle2/></div>
   <span className="eyebrow">NIRILI STAY · DHIFFUSHI</span>
   <h1>Your booking has been received.</h1>
   <p>Thank you, {guest}. Reception will review the booking, allocate your room and send your final confirmation by email.</p>
   <div className="success-ref"><small>BOOKING REFERENCE</small><strong>{success.id}</strong></div>
   <div className="success-details">
    <span><CalendarDays/> {checkIn} → {checkOut}</span>
    <span><Users/> {pax} {pax===1?'guest':'guests'}</span>
    <span><Sparkles/> {selectedPackage?selectedPackage.name:meal}</span>
   </div>
   <p className="success-note">{success.email?.sent?'We sent a booking received email to '+email+'. Final confirmation will follow after room allocation.':'Your booking is saved, but the confirmation email could not be sent yet. Please keep this booking reference and contact reception if you do not receive an email.'}</p>
   <button onClick={()=>{setSuccess(null);token.current=crypto.randomUUID();setGuest('');setPhone('');setEmail('');setNotes('');setTransportPlan({arrival:{needTransfer:'later',from:'Velana International Airport',flightNumber:'',flightTime:'',ownTransport:'',dhiffushiArrivalTime:'',buggyRequired:true},departure:{needTransfer:'later',destination:'Velana International Airport',flightNumber:'',flightTime:'',ownDepartureTime:'',buggyRequired:true}})}}>Make another booking <ArrowRight/></button>
  </section>
 </div>;

 return <div className="guest-booking-site">
  <section className="nh-page-hero nh-stay-hero" id="stay" style={{backgroundImage:'url("https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Dhiffushi-Maldives-Andres_Larin.jpg/1920px-Dhiffushi-Maldives-Andres_Larin.jpg")'}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light"><MapPin/> Nirili Stay · Dhiffushi</p>
    <h1>Island days. <em>Easy stays.</em></h1>
    <p>A 14-room island guesthouse a short walk from the beach. Pick your dates, choose a meal plan or package, and tell us how you&rsquo;re arriving.</p>
    <div className="nh-hero-actions"><a className="nh-btn nh-btn-light" href="#book">Check your dates <ArrowRight/></a><a className="nh-btn nh-btn-ghost" href="#rates">View room rates <ChevronDown/></a></div>
   </div>
   <p className="nh-photo-credit">Dhiffushi · Photo: <a href="https://commons.wikimedia.org/wiki/File:Dhiffushi-Maldives-Andres_Larin.jpg" target="_blank" rel="noopener noreferrer">Andres Larin / Saaremees</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>
  </section>

  <section className="quick-strip">
   <article><ShipWheel/><div><strong>Arrival planning</strong><span>Share your speedboat and harbour pickup needs with your stay booking</span></div></article>
   <article><Sparkles/><div><strong>Room + meal plans</strong><span>Choose Bed & Breakfast, Half Board or Full Board for your stay</span></div></article>
   <article><Globe2/><div><strong>Simple booking</strong><span>Book direct with us. No account needed</span></div></article>
  </section>

  <section className="packages-section" id="packages">
   <div className="section-head"><span className="eyebrow">NIRILI STAY PACKAGES</span><h2>Book more than a room.</h2><p>Stays with meals, transfers and excursions bundled together. Choose one and the booking form fills in the length of stay and meal plan for you.</p></div>
   <div className="package-public-grid">
    {(quote.packages||[]).map(pkg=>{const active=packageId===pkg.id;const promos=(quote.promotions||[]).filter(p=>p.packageIds.includes(pkg.id));return <article className={active?'selected':''} key={pkg.id}>
     <small>{pkg.nights} NIGHTS · {pkg.days} DAYS</small>
     <h3>{pkg.name}</h3>
     <p>{pkg.mealPlan}{pkg.includeTransfer?' · '+(pkg.transferLabel||'Return transfer included'):''}</p>
     {!!pkg.excursions.length&&<p className="package-inclusions">{pkg.excursions.length} excursion{pkg.excursions.length===1?'':'s'} included</p>}
     {promos.map(p=><span className="package-promo" key={p.id}>{p.name}</span>)}
     <div className="package-public-prices"><span><b>{money(pkg.singleCents)}</b><small>Single / person</small></span><span><b>{money(pkg.doubleCents)}</b><small>Double / person</small></span><span><b>{money(pkg.tripleCents)}</b><small>Triple / person</small></span></div>
     <div className="package-card-actions">
      <button className="package-select-button" type="button" onClick={()=>{setPackageId(pkg.id);setMeal(pkg.mealPlan);if(checkIn)setCheckOut(tomorrow(checkIn,pkg.nights));document.getElementById('book')?.scrollIntoView({behavior:'smooth'})}}>{active?'Package selected':'Choose package'} <ArrowRight/></button>
      <details className="package-inline-details">
       <summary>View details</summary>
       <div className="package-inline-details-body">
        {(pkg.roomPhoto||pkg.excursionPhoto)&&<div className="package-inline-gallery">
         {pkg.roomPhoto&&<div className="package-inline-photo" style={{backgroundImage:'url("'+pkg.roomPhoto.replace(/"/g,'%22')+'")'}}><span>Room photo</span></div>}
         {pkg.excursionPhoto&&<div className="package-inline-photo" style={{backgroundImage:'url("'+pkg.excursionPhoto.replace(/"/g,'%22')+'")'}}><span>Excursion photo</span></div>}
        </div>}
        <div className="package-inline-facts">
         <p><b>Stay:</b> {pkg.nights} nights / {pkg.days} days</p>
         <p><b>Meals:</b> {pkg.mealPlan==='Full Board'?'Breakfast, lunch and dinner included':pkg.mealPlan==='Half Board'?'Breakfast plus one lunch or dinner per day included':'Breakfast included each day'}</p>
         {pkg.includeTransfer&&<p><b>Transfer:</b> {pkg.transferLabel||'Return airport transfer included'}</p>}
        </div>
        <div className="package-inline-excursions"><b>Excursions included</b>{(pkg.excursionNames?.length||pkg.excursions.length)?<ul>{(pkg.excursionNames?.length?pkg.excursionNames:pkg.excursions).map((name,index)=><li key={index}><CheckCircle2/>{name}</li>)}</ul>:<p>No excursions included.</p>}</div>
        {pkg.childPolicy&&<p className="package-inline-policy"><b>Child policy:</b> {pkg.childPolicy}</p>}
        {pkg.youtubeUrl&&<a className="package-inline-youtube" href={pkg.youtubeUrl} target="_blank" rel="noopener noreferrer">Watch package video on YouTube</a>}
       </div>
      </details>
     </div>
    </article>})}
   </div>
   {!(quote.packages||[]).length&&<p className="package-empty">No stay packages are currently active. You can still book using the room rates below.</p>}
  </section>

  <section className="rates" id="rates">
   <div className="section-head"><span className="eyebrow">ROOM + MEALS</span><h2>Choose the stay that fits your trip.</h2><p>Rates below update for your selected number of guests. Final room allocation is confirmed by reception.</p></div>
   <div className="rate-grid">
    {(quote.estimates||quote.plans||[]).map((plan:any,index:number)=><article className={meal===plan.name?'selected':''} key={plan.name} onClick={()=>{setMeal(plan.name);setPackageId('')}}>
     <small>{index===0?'FLEXIBLE STAY':index===1?'MORE INCLUDED':'FULL ISLAND DAYS'}</small>
     <h3>{plan.name}</h3>
     <div className="price"><strong>{money(plan.nightlyCents)}</strong><span>/ room / night</span></div>
     <p>{plan.name==='Bed & Breakfast'?'Breakfast included. Keep lunch and dinner flexible.':plan.name==='Half Board'?'Breakfast plus one main daily meal included.':'Breakfast, lunch and dinner included during your stay.'}</p>
     <button type="button" onClick={()=>{setMeal(plan.name);setPackageId('');document.getElementById('book')?.scrollIntoView({behavior:'smooth'})}}>Choose {plan.name}</button>
    </article>)}
   </div>
  </section>

  <section className="booking-zone" id="book">
   <div className="booking-intro">
    <span className="eyebrow">BOOK DIRECT</span>
    <h2>Book your Nirili Stay.</h2>
    <p>Choose your dates and stay details. Your booking goes directly to reception for room allocation and confirmation.</p>
    <div className="booking-points"><span><CheckCircle2/> No account needed</span><span><CheckCircle2/> Live room availability check</span><span><CheckCircle2/> Reception confirms your booking</span></div>
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
    <label><span>Meal plan</span><select value={meal} onChange={e=>{setMeal(e.target.value);setPackageId('')}}>{['Bed & Breakfast','Half Board','Full Board'].map(x=><option key={x}>{x}</option>)}</select></label>

    <div className="quote-box">
     <div><small>{checking?'CHECKING…':quote.bookingClosed?'BOOKINGS CLOSED':quote.availableRooms!==undefined?'LIVE AVAILABILITY':'ESTIMATED STAY'}</small><strong>{quote.nights||Math.max(0,(Date.parse(checkOut)-Date.parse(checkIn))/86400000)||0} nights · {pax} {pax===1?'guest':'guests'}</strong></div>
     <div><small>ESTIMATED ACCOMMODATION</small><strong>{selectedTotal?money(selectedTotal):selectedPlan?money(selectedPlan.nightlyCents)+' / night':'—'}</strong>{selectedPackage&&<small>{selectedPackage.name}</small>}</div>
    </div>

    {selectedPackage&&<section className="selected-package-details">
     <div className="selected-package-head"><div><small>SELECTED PACKAGE</small><h4>{selectedPackage.name}</h4></div><strong>{money(packageTotal)} total</strong></div>
     <div className="selected-package-summary">
      <span><CalendarDays/> {selectedPackage.nights} nights / {selectedPackage.days} days</span>
      <span><Users/> {pax} {pax===1?'guest':'guests'} × {money(packageRatePerGuest)} per person</span>
      <span><Sparkles/> {selectedPackage.mealPlan}</span>
      {selectedPackage.includeTransfer&&<span><ShipWheel/> {selectedPackage.transferLabel||'Return airport transfer included'}</span>}
     </div>
     {!!(selectedPackage.excursionNames?.length||selectedPackage.excursions.length)&&<div className="selected-package-inclusions"><strong>Excursions included</strong><ul>{(selectedPackage.excursionNames?.length?selectedPackage.excursionNames:selectedPackage.excursions).map((name,index)=><li key={index}><CheckCircle2/>{name}</li>)}</ul></div>}
     {selectedPackage.childPolicy&&<p className="selected-package-policy">{selectedPackage.childPolicy}</p>}
    </section>}
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
    <p className="privacy-note"><ShieldCheck/> Your booking goes to Nirili Villa reception. A confirmation email is sent once your room is allocated.</p>
   </form>
  </section>

 </div>;
}
