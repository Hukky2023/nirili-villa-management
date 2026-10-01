'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,CheckCircle2,Plane,Repeat,ShipWheel,Users} from 'lucide-react';
import {SITES} from '../../../lib/public-sites';
import {Seats,tripLayout} from '../../seat-map';
import PassengerType,{fareLabel,needsType} from '../../passenger-type';
import {fareFor} from '../../../lib/transport';

const money=(cents:number)=>'MVR '+(Math.max(0,Number(cents)||0)/100).toFixed(2);
const niceDate=(d:string)=>new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export default function TransferBookingSite(){
 const [data,setData]=useState<any>(null),[trip,setTrip]=useState<'arrival'|'departure'|'return'>('arrival');
 const [date,setDate]=useState(today()),[returnDate,setReturnDate]=useState(today());
 const [outbound,setOutbound]=useState(''),[inbound,setInbound]=useState('');
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[adults,setAdults]=useState(2),[children,setChildren]=useState(0),[infants,setInfants]=useState(0),[notes,setNotes]=useState('');
 const [traveller,setTraveller]=useState('');
 const [outSeats,setOutSeats]=useState<number[]>([]),[inSeats,setInSeats]=useState<number[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState<any>(null);
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();void refresh()},[]);
 async function refresh(){try{const r=await fetch('/api/walkin-transfers',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load transfers.');setData(d);}catch(e){setError((e as Error).message)}}
 const route=(s:any,kind:'arrival'|'departure')=>kind==='arrival'?String(s.from).toLowerCase().includes('airport')&&String(s.to).toLowerCase().includes('dhiffushi'):String(s.from).toLowerCase().includes('dhiffushi')&&String(s.to).toLowerCase().includes('airport');
 // Operators publish the days each departure runs (0 = Sunday); none listed means daily.
 const runs=(s:any,d:string)=>!Array.isArray(s.days)||!s.days.length||s.days.includes(new Date(d+'T00:00:00Z').getUTCDay());
 const sortByTime=(list:any[])=>list.slice().sort((a,b)=>String(a.depart).localeCompare(String(b.depart))||String(a.operatorName||a.boat).localeCompare(String(b.operatorName||b.boat)));
 const arrivals=sortByTime((data?.sailings||[]).filter((s:any)=>route(s,'arrival')&&runs(s,date)));
 const departures=sortByTime((data?.sailings||[]).filter((s:any)=>route(s,'departure')&&runs(s,date)));
 const returns=sortByTime((data?.sailings||[]).filter((s:any)=>route(s,'departure')&&runs(s,returnDate)));
 const label=(s:any)=>s.depart+' · '+(s.operatorName||s.boat)+' · '+fareLabel(s);
 useEffect(()=>{const list=trip==='departure'?departures:arrivals;if(!list.some((s:any)=>s.id===outbound))setOutbound(list[0]?.id||'')},[data,trip,date]);
 useEffect(()=>{if(trip==='return'&&!returns.some((s:any)=>s.id===inbound))setInbound(returns[0]?.id||'')},[data,trip,returnDate]);
 const taken=(id:string,d:string)=>new Set((data?.availability||[]).filter((x:any)=>x.scheduleId===id&&x.date===d).flatMap((x:any)=>x.seats||[]));
 const need=adults+children;
 // Seats left on a trip: free seats on the boat that runs it that day.
 const seatsLeft=(id:string,d:string)=>{const sailing=(data?.sailings||[]).find((x:any)=>x.id===id);if(!sailing)return 0;const used=taken(id,d);return tripLayout(sailing,d,data?.boats).layout.cells.filter(n=>n>0&&!used.has(n)).length;};
 // A new trip or party size starts a fresh seat choice.
 useEffect(()=>setOutSeats([]),[outbound,date,need]);
 useEffect(()=>setInSeats([]),[inbound,returnDate,need]);
 const outboundSailing=(data?.sailings||[]).find((x:any)=>x.id===outbound);
 const inboundSailing=(data?.sailings||[]).find((x:any)=>x.id===inbound);
 const expectedTotal=useMemo(()=>{const calc=(s:any)=>{if(!s)return 0;const f=fareFor(s,traveller||'Tourist');return f*adults+Math.round(f/2)*children;};return calc(outboundSailing)+(trip==='return'?calc(inboundSailing):0)},[outboundSailing,inboundSailing,trip,adults,children,traveller]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!data||busy)return;setBusy(true);setError('');try{
  const typed=needsType([outboundSailing,trip==='return'?inboundSailing:null]);
  if(typed&&!traveller)throw Error('Choose your passenger type: tourist, Maldivian or expat.');
  const journeys:any[]=[];
  const first=trip==='departure'?departures.find((s:any)=>s.id===outbound):arrivals.find((s:any)=>s.id===outbound);
  // Seats the guest tapped go to the operator; with none tapped we seat the party together.
  const partial=(seats:number[])=>seats.length>0&&seats.length!==need;
  if(!first||seatsLeft(outbound,date)<need)throw Error('The selected departure does not have enough seats. Choose another time.');
  if(partial(outSeats)||trip==='return'&&partial(inSeats))throw Error('Choose '+need+' seats on the seat map, or tap Choose for me.');
  journeys.push({scheduleId:first.id,date,seats:outSeats});
  if(trip==='return'){const second=returns.find((s:any)=>s.id===inbound);if(!second||seatsLeft(inbound,returnDate)<need)throw Error('The selected return departure does not have enough seats. Choose another time.');journeys.push({scheduleId:second.id,date:returnDate,seats:inSeats});}
  const r=await fetch('/api/walkin-transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'book',payment:'later',revision:data.revision,token:token.current,name,phone,traveller:typed?traveller:'Tourist',adults,children,infants,journeys,expectedTotal,notes})}),d=await r.json();
  // Someone else took a chosen seat: show the fresh map and keep the seats that are still free.
  if(r.status===409&&d.sailings){setData(d);const free=(id:string,dt:string,list:number[])=>{const used=new Set((d.availability||[]).filter((x:any)=>x.scheduleId===id&&x.date===dt).flatMap((x:any)=>x.seats||[]));return list.filter(n=>!used.has(n));};setOutSeats(free(outbound,date,outSeats));setInSeats(free(inbound,returnDate,inSeats));}
  if(!r.ok)throw Error(d.error||'Could not book transfer.');
  const latest=(d.bookings||[]).at(-1);setData(d);setSuccess(latest||{id:'Confirmed'});token.current=crypto.randomUUID();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const outboundSeats=outbound?seatsLeft(outbound,date)>=need:true;
 const byOperator=!!outboundSailing?.operatorId||(trip==='return'&&!!inboundSailing?.operatorId);
 if(success)return <section className="nh-transfer-done">
  <CheckCircle2/>
  <p className="nh-kicker">Nirili Transfers</p>
  <h2>Your transfer <em>is booked.</em></h2>
  <p>{(success.journeys||[]).some((j:any)=>j.operatorId)?'Your seats are confirmed with the speedboat operator. Show this reference when you board and pay the operator on the boat.':'Keep this reference handy. Payment is handled by Nirili reception, and you can message us on WhatsApp with any changes.'}</p>
  <strong>{success.id}</strong>
  <a className="nh-btn nh-btn-primary" href={SITES.main+'/'}>Back to Nirili <ArrowRight/></a>
 </section>;
 return <section className="nh-transfer" id="book">
  <form onSubmit={submit} className="nh-transfer-form">
   <fieldset className="nh-trip">
    <legend>Your route</legend>
    {(['arrival','departure','return'] as const).map(x=><button type="button" key={x} aria-pressed={trip===x} onClick={()=>{setTrip(x);setOutbound('')}}>
     {x==='arrival'?<Plane/>:x==='departure'?<ShipWheel/>:<Repeat/>}
     <span><b>{x==='arrival'?'Airport → Dhiffushi':x==='departure'?'Dhiffushi → Airport':'Return trip'}</b><small>{x==='arrival'?'Arriving in the Maldives':x==='departure'?'Heading home':'Both ways'}</small></span>
    </button>)}
   </fieldset>

   <div className="nh-step">
    <h3>{trip==='return'?'Outbound':'When'}</h3>
    <div className="nh-fields">
     <label><span><CalendarDays/>Travel date</span><input required type="date" min={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label><span><ShipWheel/>Departure</span><select required value={outbound} onChange={e=>setOutbound(e.target.value)}>{(trip==='departure'?departures:arrivals).map((s:any)=><option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>
    </div>
    {!(trip==='departure'?departures:arrivals).length&&<p className="nh-hint">No speedboat departures on this day. Try another date.</p>}
    {!outboundSeats&&<p className="nh-hint">Not enough seats left on this boat for your group. Try another time or date.</p>}
    {outboundSailing&&outboundSeats&&<Seats sailing={outboundSailing} date={date} data={data} need={need} selected={outSeats} onChange={setOutSeats}/>}
   </div>

   {trip==='return'&&<div className="nh-step">
    <h3>Return</h3>
    <div className="nh-fields">
     <label><span><CalendarDays/>Return date</span><input required type="date" min={date} value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></label>
     <label><span><ShipWheel/>Return departure</span><select required value={inbound} onChange={e=>setInbound(e.target.value)}>{returns.map((s:any)=><option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>
    </div>
    {inboundSailing&&(seatsLeft(inbound,returnDate)>=need?<Seats sailing={inboundSailing} date={returnDate} data={data} need={need} selected={inSeats} onChange={setInSeats}/>:<p className="nh-hint">Not enough seats left on this boat for your group. Try another time or date.</p>)}
   </div>}

   <div className="nh-step">
    <h3>Who&rsquo;s travelling</h3>
    <div className="nh-fields nh-fields-3">
     <label><span><Users/>Adults</span><select value={adults} onChange={e=>setAdults(Number(e.target.value))}>{[1,2,3,4,5,6].map(x=><option key={x}>{x}</option>)}</select></label>
     <label><span>Children</span><select value={children} onChange={e=>setChildren(Number(e.target.value))}>{[0,1,2,3,4].map(x=><option key={x}>{x}</option>)}</select></label>
     <label><span>Infants</span><select value={infants} onChange={e=>setInfants(Number(e.target.value))}>{[0,1,2,3].map(x=><option key={x}>{x}</option>)}</select></label>
    </div>
    <PassengerType sailings={[outboundSailing,trip==='return'?inboundSailing:null]} value={traveller} onChange={setTraveller}/>
   </div>

   <div className="nh-step">
    <h3>Your details</h3>
    <div className="nh-fields">
     <label><span>Full name</span><input required maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="As on your passport"/></label>
     <label><span>WhatsApp / phone</span><input required maxLength={80} inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960..."/></label>
    </div>
    <label><span>Notes</span><textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Flight number, where you're staying, luggage or anything else"/></label>
   </div>
   <p className="nh-fare-inline"><span>Estimated total</span><strong>{money(expectedTotal)}</strong></p>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy||!data}>{busy?'Booking…':'Reserve transfer'} <ArrowRight/></button>
  </form>

  <aside className="nh-fare">
   <p className="nh-kicker">Your trip</p>
   <dl>
    <div><dt>Route</dt><dd>{trip==='arrival'?'Airport → Dhiffushi':trip==='departure'?'Dhiffushi → Airport':'Return trip'}</dd></div>
    <div><dt>Departure</dt><dd>{outboundSailing?niceDate(date)+' · '+outboundSailing.depart:'Choose a time'}</dd></div>
    {outboundSailing&&<div><dt>Seats</dt><dd>{outSeats.length===need?outSeats.slice().sort((a,b)=>a-b).join(', '):'Chosen for you'}</dd></div>}
    {outboundSailing&&<div><dt>Operator</dt><dd>{outboundSailing.operatorName||outboundSailing.boat}</dd></div>}
    {trip==='return'&&<div><dt>Return</dt><dd>{inboundSailing?niceDate(returnDate)+' · '+inboundSailing.depart:'Choose a time'}</dd></div>}
    {trip==='return'&&inboundSailing&&<div><dt>Return seats</dt><dd>{inSeats.length===need?inSeats.slice().sort((a,b)=>a-b).join(', '):'Chosen for you'}</dd></div>}
    {needsType([outboundSailing,trip==='return'?inboundSailing:null])&&<div><dt>Passenger type</dt><dd>{traveller==='Local'?'Maldivian':traveller==='Expat'?'Expat living in the Maldives':traveller==='Tourist'?'Tourist / visitor':'Choose above'}</dd></div>}
    <div><dt>Travellers</dt><dd>{adults} adult{adults>1?'s':''}{children?', '+children+' child'+(children>1?'ren':''):''}{infants?', '+infants+' infant'+(infants>1?'s':''):''}</dd></div>
   </dl>
   <div className="nh-fare-total"><span>Estimated total</span><strong>{money(expectedTotal)}</strong></div>
   <small>{byOperator?'Children travel at 50% of the adult fare. Pay the speedboat operator when you board.':'Children travel at 50% of the adult fare. Pay at Nirili reception.'}</small>
  </aside>
 </section>;
}

