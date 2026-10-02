'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpDown,CalendarDays,CheckCircle2,Clock,MapPin,Search,Ship,ShipWheel,Users} from 'lucide-react';
import {SITES} from '../../../lib/public-sites';
import {Seats,seatsLeft} from '../../seat-map';
import {fareFor} from '../../../lib/transport';
import TimeField24 from '../../time-field-24';

// transfers.nirilihotels.com: find sea transport like the ODI and RTL apps. Guests choose a
// scheduled speedboat or a private charter, where they leave from and go to, who is travelling
// (local, expat or tourist fares) and the date; then pick a departure and their seats, or send a
// charter request to the operator.
const money=(cents:number)=>'MVR '+(Math.max(0,Number(cents)||0)/100).toFixed(2);
const niceDate=(d:string)=>new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const TYPES=[{id:'Local',label:'Local'},{id:'Expat',label:'Expat'},{id:'Tourist',label:'Tourist'}];
const typeName=(t:string)=>t==='Local'?'Maldivian (local)':t==='Expat'?'Expat living in the Maldives':'Tourist';

type Mode='ferry'|'charter';
type Step='search'|'outbound'|'return'|'details'|'charters'|'charter-details';

export default function TransferBookingSite(){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState<any>(null);
 const [mode,setMode]=useState<Mode>('ferry'),[step,setStep]=useState<Step>('search');
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[traveller,setTraveller]=useState('');
 const [returnTrip,setReturnTrip]=useState(false),[date,setDate]=useState(today()),[returnDate,setReturnDate]=useState(today());
 const [adults,setAdults]=useState(2),[children,setChildren]=useState(0),[infants,setInfants]=useState(0);
 const [time,setTime]=useState('09:00'),[groupSize,setGroupSize]=useState(4);
 const [outbound,setOutbound]=useState(''),[inbound,setInbound]=useState(''),[outSeats,setOutSeats]=useState<number[]>([]),[inSeats,setInSeats]=useState<number[]>([]);
 const [offers,setOffers]=useState<any[]>([]),[offer,setOffer]=useState<any>(null);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[notes,setNotes]=useState('');
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();void refresh();},[]);
 async function refresh(){try{const r=await fetch('/api/walkin-transfers',{cache:'no-store'}),d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not load transfers.');setData(d);}catch(e){setError((e as Error).message)}}
 // Start from the island's usual route.
 const portList:string[]=data?.ports||[];
 useEffect(()=>{if(!data)return;if(!from)setFrom(portList.find(p=>/airport/i.test(p))||portList[0]||'');if(!to)setTo(portList.find(p=>/dhiffushi/i.test(p))||portList[1]||'');},[data]);
 const go=(next:Step)=>{setError('');setStep(next);requestAnimationFrame(()=>document.getElementById('book')?.scrollIntoView({behavior:'smooth',block:'start'}));};

 // ---- Scheduled speedboats
 const need=adults+children;
 const runs=(s:any,d:string)=>!Array.isArray(s.days)||!s.days.length||s.days.includes(new Date(d+'T00:00:00Z').getUTCDay());
 const future=(s:any,d:string)=>Date.parse(d+'T'+s.depart+':00+05:00')>Date.now();
 const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
 const departures=(a:string,b:string,d:string)=>(data?.sailings||[]).filter((s:any)=>same(s.from,a)&&same(s.to,b)&&runs(s,d)&&future(s,d)).sort((x:any,y:any)=>x.depart.localeCompare(y.depart));
 const outList=useMemo(()=>departures(from,to,date),[data,from,to,date]);
 const outSailing=(data?.sailings||[]).find((s:any)=>s.id===outbound),inSailing=(data?.sailings||[]).find((s:any)=>s.id===inbound);
 const retList=useMemo(()=>departures(to,from,returnDate).filter((s:any)=>!outSailing||returnDate+'T'+s.depart>date+'T'+outSailing.arrive),[data,from,to,date,returnDate,outSailing]);
 const legTotal=(s:any)=>{if(!s)return 0;const f=fareFor(s,traveller||'Tourist');return f*adults+Math.round(f/2)*children;};
 const expectedTotal=legTotal(outSailing)+(returnTrip?legTotal(inSailing):0);
 useEffect(()=>setOutSeats([]),[outbound,date,need]);
 useEffect(()=>setInSeats([]),[inbound,returnDate,need]);

 function searchFerry(e:React.FormEvent){
  e.preventDefault();
  if(!from||!to||same(from,to))return setError('Choose where you leave from and where you are going.');
  if(!traveller)return setError('Choose Local, Expat or Tourist. Fares depend on it.');
  if(returnTrip&&returnDate<date)return setError('The return date must be on or after the departure date.');
  setOutbound('');setInbound('');go('outbound');
 }
 async function bookFerry(e:React.FormEvent){
  e.preventDefault();if(!data||busy)return;setBusy(true);setError('');
  try{
   const partial=(seats:number[])=>seats.length>0&&seats.length!==need;
   if(partial(outSeats)||returnTrip&&partial(inSeats))throw Error('Choose '+need+' seats on the seat map, or tap Choose for me.');
   const journeys:any[]=[{scheduleId:outbound,date,seats:outSeats},...(returnTrip?[{scheduleId:inbound,date:returnDate,seats:inSeats}]:[])];
   const r=await fetch('/api/walkin-transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'book',payment:'later',revision:data.revision,token:token.current,name,phone,traveller,adults,children,infants,journeys,expectedTotal,notes})}),d:any=await r.json();
   // Someone else took a chosen seat: show the fresh map and keep the seats that are still free.
   if(r.status===409&&d.sailings){setData(d);const free=(id:string,dt:string,list:number[])=>{const used=new Set((d.availability||[]).filter((x:any)=>x.scheduleId===id&&x.date===dt).flatMap((x:any)=>x.seats||[]));return list.filter(n=>!used.has(n));};setOutSeats(free(outbound,date,outSeats));setInSeats(free(inbound,returnDate,inSeats));}
   if(!r.ok)throw Error(d.error||'Could not book transfer.');
   setData(d);setDone({kind:'ferry',id:(d.bookings||[]).at(-1)?.id||'Confirmed'});token.current=crypto.randomUUID();
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }

 // ---- Private charters
 async function searchCharter(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  if(!from||!to||same(from,to))return setError('Choose where you leave from and where you are going.');
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/walkin-transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'charter-search',from,to,date,time,pax:groupSize})}),d:any=await r.json();
   if(!r.ok)throw Error(d.error||'Could not search charters.');
   setOffers(d.offers||[]);setOffer(null);go('charters');
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 async function requestCharter(e:React.FormEvent){
  e.preventDefault();if(busy||!offer)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/walkin-transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'charter',token:token.current,rateId:offer.rateId,date,time,pax:groupSize,name,phone,notes,traveller:traveller||'Tourist',expectedPrice:offer.price})}),d:any=await r.json();
   if(!r.ok)throw Error(d.error||'Could not send the charter request.');
   setData(d);setDone({kind:'charter',id:d.charter?.id||''});token.current=crypto.randomUUID();
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }

 if(done)return <section className="nh-transfer-done">
  <CheckCircle2/>
  <p className="nh-kicker">Nirili Transfers</p>
  {done.kind==='charter'?<><h2>Charter <em>requested.</em></h2><p>The operator checks a boat and crew and confirms on WhatsApp. You pay the operator on the day.</p></>
  :<><h2>Your transfer <em>is booked.</em></h2><p>Your seats are confirmed with the speedboat operator. Show this reference when you board and pay the operator on the boat.</p></>}
  <strong>{done.id}</strong>
  <a className="nh-btn nh-btn-primary" href={SITES.main+'/'}>Back to Nirili <ArrowRight/></a>
 </section>;

 const routeFields=<div className="nh-route">
  <label><span><MapPin/>Depart from</span><select required value={from} onChange={e=>setFrom(e.target.value)}><option value="">Departure port</option>{portList.map(p=><option key={p}>{p}</option>)}</select></label>
  <button type="button" className="nh-swap" aria-label="Swap departure and arrival" onClick={()=>{setFrom(to);setTo(from);}}><ArrowUpDown/></button>
  <label><span><MapPin/>Travel to</span><select required value={to} onChange={e=>setTo(e.target.value)}><option value="">Arrival port</option>{portList.filter(p=>p!==from).map(p=><option key={p}>{p}</option>)}</select></label>
 </div>;
 const typePicker=<div className="nh-types" role="radiogroup" aria-label="Passenger type">{TYPES.map(t=><button type="button" role="radio" key={t.id} aria-checked={traveller===t.id} onClick={()=>setTraveller(t.id)}>{t.label}</button>)}</div>;
 const stats=data?.stats&&data.stats.vessels>0&&<p className="nh-stats"><Ship/><span><b>{data.stats.vessels}</b><span>vessels onboard</span></span><span><b>{data.stats.operators}</b><span>operators</span></span></p>;
 const back=(target:Step)=><button type="button" className="nh-back" onClick={()=>go(target)}><ArrowLeft/>Back</button>;

 // ---- Search
 if(step==='search')return <section className="nh-transfer nh-transfer-search" id="book">
  <div className="nh-transfer-form nh-search">
   <div className="nh-modes" role="tablist" aria-label="Type of trip">
    <button type="button" role="tab" aria-selected={mode==='ferry'} onClick={()=>{setMode('ferry');setError('');}}>Scheduled speedboat</button>
    <button type="button" role="tab" aria-selected={mode==='charter'} onClick={()=>{setMode('charter');setError('');}}>Private charter</button>
   </div>
   {mode==='ferry'?<form onSubmit={searchFerry} className="nh-search-form">
    {routeFields}
    <div className="nh-step"><h3>Who&rsquo;s travelling</h3>{typePicker}<p className="nh-seats-help">Locals and expats pay lower fares on many boats. Bring your ID card or work permit when you board.</p></div>
    <div className="nh-fields nh-fields-3">
     <label><span><Users/>Adults</span><select value={adults} onChange={e=>setAdults(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map(x=><option key={x}>{x}</option>)}</select></label>
     <label><span>Children</span><select value={children} onChange={e=>setChildren(Number(e.target.value))}>{[0,1,2,3,4,5,6].map(x=><option key={x}>{x}</option>)}</select></label>
     <label><span>Infants</span><select value={infants} onChange={e=>setInfants(Number(e.target.value))}>{[0,1,2,3].map(x=><option key={x}>{x}</option>)}</select></label>
    </div>
    <label className="nh-check"><input type="checkbox" checked={returnTrip} onChange={e=>setReturnTrip(e.target.checked)}/> Return trip</label>
    <div className="nh-fields">
     <label><span><CalendarDays/>Departure date</span><input required type="date" min={today()} value={date} onChange={e=>{setDate(e.target.value);if(returnDate<e.target.value)setReturnDate(e.target.value);}}/></label>
     {returnTrip&&<label><span><CalendarDays/>Return date</span><input required type="date" min={date} value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></label>}
    </div>
    {error&&<p className="nh-error" role="alert">{error}</p>}
    <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={!data}><Search/>Find speedboats</button>
   </form>
   :<form onSubmit={searchCharter} className="nh-search-form">
    {routeFields}
    <div className="nh-fields nh-fields-3">
     <label><span><CalendarDays/>Date</span><input required type="date" min={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label><span><Clock/>Start time</span><TimeField24 required value={time} onChange={e=>setTime(e.target.value)} aria-label="Start time"/></label>
     <label><span><Users/>People</span><input required type="number" min={1} max={60} value={groupSize} onChange={e=>setGroupSize(Number(e.target.value))}/></label>
    </div>
    <p className="nh-seats-help">A private charter is the whole boat for your group, at the time you choose. The operator confirms the boat and crew.</p>
    {error&&<p className="nh-error" role="alert">{error}</p>}
    <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={!data||busy}><Search/>{busy?'Searching…':'Find charter boats'}</button>
   </form>}
   {stats}
  </div>
 </section>;

 // ---- Results: pick a departure
 if(step==='outbound'||step==='return'){
  const isReturn=step==='return',list=isReturn?retList:outList,d=isReturn?returnDate:date;
  const pick=(id:string)=>{if(isReturn){setInbound(id);go('details');}else{setOutbound(id);if(returnTrip){setInbound('');go('return');}else go('details');}};
  return <section className="nh-transfer nh-transfer-search" id="book">
   <div className="nh-transfer-form">
    {back(isReturn?'outbound':'search')}
    <div className="nh-step"><h3>{isReturn?'Return speedboats':'Speedboats'}</h3><p className="nh-results-route"><b>{isReturn?to:from} → {isReturn?from:to}</b><span><span>{niceDate(d)}</span> · <span>{typeName(traveller)}</span> · <span>{need===1?'1 seat':need+' seats'}</span></span></p></div>
    {!list.length?<p className="nh-hint">No speedboats on this route that day. Try another date, or ask for a private charter.</p>
    :<ul className="nh-results">{list.map((s:any)=>{const left=seatsLeft(s,d,data),ok=left>=need,boat=(data?.boats||[]).find((x:any)=>x.id===(s.boatOverrides?.[d]||s.boatId));return <li key={s.id}><button type="button" disabled={!ok} onClick={()=>pick(s.id)}>
     <span className="nh-results-time"><b>{s.depart}</b><ArrowRight/><b>{s.arrive}</b></span>
     <span className="nh-results-who"><ShipWheel/>{s.operatorName||s.boat}{boat?' · '+boat.name:''}</span>
     <span className="nh-results-left">{ok?left+' seats left':'Not enough seats'}</span>
     <span className="nh-results-price"><b>{money(fareFor(s,traveller))}</b><small>per adult</small><small>{money(legTotal(s))} total</small></span>
    </button></li>;})}</ul>}
   </div>
  </section>;
 }

 // ---- Charter offers
 if(step==='charters')return <section className="nh-transfer nh-transfer-search" id="book">
  <div className="nh-transfer-form">
   {back('search')}
   <div className="nh-step"><h3>Private charters</h3><p className="nh-results-route"><b>{from} → {to}</b><span><span>{niceDate(date)}</span> · <span>{time}</span> · <span>{groupSize+' people'}</span></span></p></div>
   {!offers.length?<p className="nh-hint">No charter boat is free for this route and time. Try another time or date, or message us on WhatsApp.</p>
   :<ul className="nh-results">{offers.map(o=><li key={o.rateId}><button type="button" onClick={()=>{setOffer(o);go('charter-details');}}>
    <span className="nh-results-time"><b>{o.operatorName}</b></span>
    <span className="nh-results-who"><Ship/><span>Whole boat</span> · <span>{'Up to '+o.maxPax+' people'}</span> · <span>{'About '+(o.blockMin/60)+' hours'}</span></span>
    {o.note&&<span className="nh-results-left">{o.note}</span>}
    <span className="nh-results-price"><b>{money(o.price)}</b><small>for the boat</small></span>
   </button></li>)}</ul>}
  </div>
 </section>;

 // ---- Details and booking
 const details=<div className="nh-step">
  <h3>Your details</h3>
  <div className="nh-fields">
   <label><span>Full name</span><input required maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="As on your passport"/></label>
   <label><span>WhatsApp / phone</span><input required maxLength={80} inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960..."/></label>
  </div>
  <label><span>Notes</span><textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Flight number, where you're staying, luggage or anything else"/></label>
 </div>;

 if(step==='charter-details'&&offer)return <section className="nh-transfer" id="book">
  <form onSubmit={requestCharter} className="nh-transfer-form">
   {back('charters')}
   {details}
   {error&&<p className="nh-error" role="alert">{error}</p>}
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy}>{busy?'Sending…':'Request charter'} <ArrowRight/></button>
  </form>
  <aside className="nh-fare">
   <p className="nh-kicker">Private charter</p>
   <dl>
    <div><dt>Route</dt><dd>{from} → {to}</dd></div>
    <div><dt>Date</dt><dd>{niceDate(date)} · {time}</dd></div>
    <div><dt>Operator</dt><dd>{offer.operatorName}</dd></div>
    <div><dt>People</dt><dd>{groupSize}</dd></div>
   </dl>
   <div className="nh-fare-total"><span>Charter price</span><strong>{money(offer.price)}</strong></div>
   <small>The operator confirms on WhatsApp. Pay the operator on the day.</small>
  </aside>
 </section>;

 return <section className="nh-transfer" id="book">
  <form onSubmit={bookFerry} className="nh-transfer-form">
   {back(returnTrip?'return':'outbound')}
   {outSailing&&<Seats sailing={outSailing} date={date} data={data} need={need} selected={outSeats} onChange={setOutSeats}/>}
   {returnTrip&&inSailing&&<><h3 className="nh-leg-title"><span>Return</span> · <span>{niceDate(returnDate)}</span> · <span>{inSailing.depart}</span></h3><Seats sailing={inSailing} date={returnDate} data={data} need={need} selected={inSeats} onChange={setInSeats}/></>}
   {details}
   <p className="nh-fare-inline"><span>Estimated total</span><strong>{money(expectedTotal)}</strong></p>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy||!outSailing}>{busy?'Booking…':'Reserve transfer'} <ArrowRight/></button>
  </form>
  <aside className="nh-fare">
   <p className="nh-kicker">Your trip</p>
   <dl>
    <div><dt>Route</dt><dd>{from} → {to}</dd></div>
    {outSailing&&<div><dt>Departure</dt><dd>{niceDate(date)} · {outSailing.depart}</dd></div>}
    {outSailing&&<div><dt>Seats</dt><dd>{outSeats.length===need?outSeats.slice().sort((a,b)=>a-b).join(', '):'Chosen for you'}</dd></div>}
    {outSailing&&<div><dt>Operator</dt><dd>{outSailing.operatorName||outSailing.boat}</dd></div>}
    {returnTrip&&inSailing&&<div><dt>Return</dt><dd>{niceDate(returnDate)} · {inSailing.depart}</dd></div>}
    {returnTrip&&inSailing&&<div><dt>Return seats</dt><dd>{inSeats.length===need?inSeats.slice().sort((a,b)=>a-b).join(', '):'Chosen for you'}</dd></div>}
    <div><dt>Passenger type</dt><dd>{typeName(traveller)}</dd></div>
    <div><dt>Travellers</dt><dd>{adults} adult{adults>1?'s':''}{children?', '+children+' child'+(children>1?'ren':''):''}{infants?', '+infants+' infant'+(infants>1?'s':''):''}</dd></div>
   </dl>
   <div className="nh-fare-total"><span>Estimated total</span><strong>{money(expectedTotal)}</strong></div>
   <small>Children travel at 50% of the adult fare. Pay the speedboat operator when you board.</small>
  </aside>
 </section>;
}
