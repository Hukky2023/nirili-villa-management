'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,CheckCircle2,Plane,ShipWheel,Users} from 'lucide-react';

const money=(cents:number)=>'MVR '+(Math.max(0,Number(cents)||0)/100).toFixed(2);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export default function TransferBookingSite(){
 const [data,setData]=useState<any>(null),[trip,setTrip]=useState<'arrival'|'departure'|'return'>('arrival');
 const [date,setDate]=useState(today()),[returnDate,setReturnDate]=useState(today());
 const [outbound,setOutbound]=useState(''),[inbound,setInbound]=useState('');
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[adults,setAdults]=useState(2),[children,setChildren]=useState(0),[infants,setInfants]=useState(0),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState<any>(null);
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();void refresh()},[]);
 async function refresh(){try{const r=await fetch('/api/walkin-transfers',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load transfers.');setData(d);}catch(e){setError((e as Error).message)}}
 const route=(s:any,kind:'arrival'|'departure')=>kind==='arrival'?String(s.from).toLowerCase().includes('airport')&&String(s.to).toLowerCase().includes('dhiffushi'):String(s.from).toLowerCase().includes('dhiffushi')&&String(s.to).toLowerCase().includes('airport');
 const arrivals=(data?.sailings||[]).filter((s:any)=>route(s,'arrival'));
 const departures=(data?.sailings||[]).filter((s:any)=>route(s,'departure'));
 useEffect(()=>{if(!outbound){const list=trip==='departure'?departures:arrivals;if(list[0])setOutbound(list[0].id)}},[data,trip]);
 useEffect(()=>{if(trip==='return'&&!inbound&&departures[0])setInbound(departures[0].id)},[data,trip]);
 const taken=(id:string,d:string)=>new Set((data?.availability||[]).filter((x:any)=>x.scheduleId===id&&x.date===d).flatMap((x:any)=>x.seats||[]));
 function seatsFor(id:string,d:string){const sailing=(data?.sailings||[]).find((x:any)=>x.id===id);if(!sailing)return [];const used=taken(id,d),need=adults+children,out:number[]=[];for(let i=1;i<=sailing.capacity&&out.length<need;i++)if(!used.has(i))out.push(i);return out.length===need?out:[]}
 const outboundSailing=(data?.sailings||[]).find((x:any)=>x.id===outbound);
 const inboundSailing=(data?.sailings||[]).find((x:any)=>x.id===inbound);
 const expectedTotal=useMemo(()=>{const calc=(s:any)=>s?Number(s.fare||0)*adults+Math.round(Number(s.fare||0)/2)*children:0;return calc(outboundSailing)+(trip==='return'?calc(inboundSailing):0)},[outboundSailing,inboundSailing,trip,adults,children]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!data||busy)return;setBusy(true);setError('');try{
  const journeys:any[]=[];
  const first=trip==='departure'?departures.find((s:any)=>s.id===outbound):arrivals.find((s:any)=>s.id===outbound);
  const firstSeats=seatsFor(outbound,date);if(!first||!firstSeats.length)throw Error('The selected departure does not have enough seats. Choose another time.');
  journeys.push({scheduleId:first.id,date,seats:firstSeats});
  if(trip==='return'){const second=departures.find((s:any)=>s.id===inbound),secondSeats=seatsFor(inbound,returnDate);if(!second||!secondSeats.length)throw Error('The selected return departure does not have enough seats. Choose another time.');journeys.push({scheduleId:second.id,date:returnDate,seats:secondSeats});}
  const r=await fetch('/api/walkin-transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'book',payment:'later',revision:data.revision,token:token.current,name,phone,traveller:'Tourist',adults,children,infants,journeys,expectedTotal,notes})}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not book transfer.');
  const latest=(d.bookings||[]).at(-1);setData(d);setSuccess(latest||{id:'Confirmed'});token.current=crypto.randomUUID();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(success)return <main className="public-transfer"><section className="transfer-success"><CheckCircle2/><span>NIRILI TRAVELS · NIRILI TRANSFERS</span><h1>Transfer booked.</h1><p>Your request is now inside Nirili Transfers management. Reception can see it immediately.</p><strong>{success.id}</strong><a href="https://nirilihotels.com">Back to Nirili Hotel <ArrowRight/></a></section></main>;
 return <main className="public-transfer">
  <header><a href="https://nirilihotels.com"><ArrowLeft/> Nirili Hotel</a><b>Nirili Transfers</b></header>
  <section className="transfer-hero"><div><span>VELANA AIRPORT ↔ DHIFFUSHI</span><h1>Your island transfer,<br/>connected to Nirili.</h1><p>Choose your route and departure. Your booking goes directly into Nirili Transfers.</p></div><ShipWheel/></section>
  <form onSubmit={submit} className="transfer-card">
   <div className="trip-choice">{(['arrival','departure','return'] as const).map(x=><button type="button" key={x} aria-pressed={trip===x} onClick={()=>{setTrip(x);setOutbound('')}}>{x==='arrival'?'Airport → Dhiffushi':x==='departure'?'Dhiffushi → Airport':'Return transfer'}</button>)}</div>
   <div className="transfer-fields"><label><CalendarDays/>Travel date<input required type="date" min={today()} value={date} onChange={e=>setDate(e.target.value)}/></label><label><ShipWheel/>Departure<select required value={outbound} onChange={e=>setOutbound(e.target.value)}>{(trip==='departure'?departures:arrivals).map((s:any)=><option key={s.id} value={s.id}>{s.depart} · {s.boat} · {money(s.fare)} adult</option>)}</select></label></div>
   {trip==='return'&&<div className="transfer-fields"><label><CalendarDays/>Return date<input required type="date" min={date} value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></label><label><ShipWheel/>Return departure<select required value={inbound} onChange={e=>setInbound(e.target.value)}>{departures.map((s:any)=><option key={s.id} value={s.id}>{s.depart} · {s.boat} · {money(s.fare)} adult</option>)}</select></label></div>}
   <div className="passengers"><Users/><label>Adults<select value={adults} onChange={e=>setAdults(Number(e.target.value))}>{[1,2,3,4,5,6].map(x=><option key={x}>{x}</option>)}</select></label><label>Children<select value={children} onChange={e=>setChildren(Number(e.target.value))}>{[0,1,2,3,4].map(x=><option key={x}>{x}</option>)}</select></label><label>Infants<select value={infants} onChange={e=>setInfants(Number(e.target.value))}>{[0,1,2,3].map(x=><option key={x}>{x}</option>)}</select></label></div>
   <div className="transfer-fields"><label>Guest name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></label><label>WhatsApp / phone<input required maxLength={80} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960..."/></label></div>
   <label>Notes<textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Flight number, hotel, luggage or other details"/></label>
   <div className="fare-summary"><span>Estimated total</span><strong>{money(expectedTotal)}</strong><small>Children use the current 50% transport fare. Payment is handled by Nirili reception.</small></div>
   {error&&<p className="transfer-error">{error}</p>}
   <button className="transfer-submit" disabled={busy||!data}>{busy?'Booking…':'Reserve transfer'} <ArrowRight/></button>
  </form>
 </main>;
}
