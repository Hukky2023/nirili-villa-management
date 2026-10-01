'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,Car,MapPin,MessageCircle,ShipWheel,Users,X} from 'lucide-react';
import {Seats,seatsLeft} from '../../seat-map';

// Partner portal: book speedboat seats with independent operators and buggy rides for guests.
type Sailing={id:string;from:string;to:string;depart:string;arrive:string;capacity:number;fare:number;operatorName?:string;boat:string;days?:number[];boatId?:string;boatOverrides?:Record<string,string>};
const mvr=(c:number)=>'MVR '+(Math.max(0,Number(c)||0)/100).toFixed(2);
const usd=(c:number)=>'$'+(Math.max(0,Number(c)||0)/100).toFixed(2);
const niceDate=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'';
const runs=(s:Sailing,d:string)=>!Array.isArray(s.days)||!s.days.length||s.days.includes(new Date(d+'T00:00:00Z').getUTCDay());
const leg=(s:Sailing,kind:'arrival'|'departure')=>kind==='arrival'?/airport/i.test(s.from)&&/dhiffushi/i.test(s.to):/dhiffushi/i.test(s.from)&&/airport/i.test(s.to);

export function useTravel(){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/agent-portal/travel',{cache:'no-store'}),d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not load transfers and rides.');setData(d);setError('');}
  catch(e){setError((e as Error).message)}
 },[]);
 useEffect(()=>{void load();const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return ()=>clearInterval(t);},[load]);
 async function send(body:any){
  const r=await fetch('/api/agent-portal/travel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d:any=await r.json();
  // A seat someone else just took comes back with the fresh seat map.
  if(r.status===409&&d.sailings)setData(d);
  if(!r.ok)throw Error(d.error||'Could not save.');
  setData(d);return d;
 }
 return {data,error,load,send};
}

export function Transfers({travel,pickup}:{travel:ReturnType<typeof useTravel>;pickup:string}){
 const {data,send}=travel;
 const [kind,setKind]=useState<'arrival'|'departure'>('arrival'),[date,setDate]=useState(''),[sailingId,setSailingId]=useState('');
 const [adults,setAdults]=useState(2),[children,setChildren]=useState(0),[infants,setInfants]=useState(0);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[reference,setReference]=useState(''),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[picked,setPicked]=useState<number[]>([]);
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();},[]);
 useEffect(()=>{if(!date&&data?.today)setDate(data.today);},[data,date]);
 const options=useMemo(()=>(data?.sailings||[]).filter((s:Sailing)=>leg(s,kind)&&date&&runs(s,date)).sort((a:Sailing,b:Sailing)=>a.depart.localeCompare(b.depart)),[data,kind,date]);
 useEffect(()=>{if(!options.some((s:Sailing)=>s.id===sailingId))setSailingId(options[0]?.id||'');},[options,sailingId]);
 const sailing=options.find((s:Sailing)=>s.id===sailingId);
 const total=sailing?sailing.fare*adults+Math.round(sailing.fare/2)*children:0;
 const need=adults+children,enough=!sailing||seatsLeft(sailing,date,data)>=need;
 useEffect(()=>setPicked([]),[sailingId,date,need]);
 // Drop chosen seats that someone else has booked in the meantime.
 useEffect(()=>{if(!sailing)return;const used=new Set((data?.availability||[]).filter((x:any)=>x.scheduleId===sailing.id&&x.date===date).flatMap((x:any)=>x.seats||[]));setPicked(p=>p.some(n=>used.has(n))?p.filter(n=>!used.has(n)):p);},[data]);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setDone('');
  try{
   if(!sailing||!enough)throw Error('Not enough seats left on this boat for your group. Try another time or date.');
   if(picked.length&&picked.length!==need)throw Error('Choose '+need+' seats on the seat map, or tap Choose for me.');
   await send({action:'book-transfer',token:token.current,name,phone,adults,children,infants,notes,agentReference:reference,expectedTotal:total,journeys:[{scheduleId:sailing.id,date,seats:picked}]});
   setDone('Seats confirmed with the operator. You can follow the booking below.');token.current=crypto.randomUUID();setPicked([]);setName('');setPhone('');setReference('');setNotes('');
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 async function cancel(id:string){
  if(!window.confirm('Cancel this transfer booking?'))return;
  try{await send({action:'cancel-transfer',bookingId:id});}catch(err){setError((err as Error).message)}
 }
 const transfers:any[]=data?.transfers||[];
 return <div className="nh-agent-travel">
  <form className="nh-transfer-form" onSubmit={submit}>
   <div className="nh-step">
    <h3>Speedboat transfer</h3>
    <div className="nh-agent-tabs" role="group" aria-label="Route">
     <button type="button" aria-pressed={kind==='arrival'} onClick={()=>setKind('arrival')}>Airport → Dhiffushi</button>
     <button type="button" aria-pressed={kind==='departure'} onClick={()=>setKind('departure')}>Dhiffushi → Airport</button>
    </div>
    <div className="nh-fields">
     <label><span><CalendarDays/>Travel date</span><input required type="date" min={data?.today} value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label><span><ShipWheel/>Departure</span><select required value={sailingId} onChange={e=>setSailingId(e.target.value)}>{options.map((s:Sailing)=><option key={s.id} value={s.id}>{s.depart} · {s.operatorName||s.boat} · {mvr(s.fare)} adult</option>)}</select></label>
    </div>
    {!options.length&&<p className="nh-hint">No speedboat departures on this day. Try another date.</p>}
    <div className="nh-fields nh-fields-3">
     <label><span><Users/>Adults</span><select value={adults} onChange={e=>setAdults(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map(x=><option key={x}>{x}</option>)}</select></label>
     <label><span>Children</span><select value={children} onChange={e=>setChildren(Number(e.target.value))}>{[0,1,2,3,4,5,6].map(x=><option key={x}>{x}</option>)}</select></label>
     <label><span>Infants</span><select value={infants} onChange={e=>setInfants(Number(e.target.value))}>{[0,1,2,3].map(x=><option key={x}>{x}</option>)}</select></label>
    </div>
    {sailing&&(enough?<Seats sailing={sailing} date={date} data={data} need={need} selected={picked} onChange={setPicked}/>:<p className="nh-hint">Not enough seats left on this boat for your group. Try another time or date.</p>)}
    <div className="nh-fields nh-fields-3">
     <label><span>Lead guest name</span><input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label><span>Guest WhatsApp (optional)</span><input maxLength={30} inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+44 7XXX XXXXXX"/></label>
     <label><span>Your reference (optional)</span><input maxLength={60} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Your booking no."/></label>
    </div>
    <label><span>Notes (optional)</span><textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Flight number, luggage or anything else"/></label>
   </div>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   {done&&<p className="nh-hint" role="status">{done}</p>}
   <p className="nh-fare-inline"><span>Guest pays the operator</span><strong>{sailing?mvr(total):'—'}</strong></p>
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy||!sailing}>{busy?'Sending…':'Reserve seats'} <ArrowRight/></button>
  </form>
  <aside className="nh-fare">
   <p className="nh-kicker">Speedboat transfer</p>
   <dl>
    <div><dt>Route</dt><dd>{kind==='arrival'?'Airport → Dhiffushi':'Dhiffushi → Airport'}</dd></div>
    <div><dt>Departure</dt><dd>{sailing?niceDate(date)+' · '+sailing.depart:'Choose a time'}</dd></div>
    {sailing&&<div><dt>Operator</dt><dd>{sailing.operatorName||sailing.boat}</dd></div>}
    <div><dt>Pickup</dt><dd>{pickup}</dd></div>
   </dl>
   <div className="nh-fare-total"><span>Guest pays the operator</span><strong>{sailing?mvr(total):'—'}</strong></div>
   <small>Children travel at 50% of the adult fare; infants free. Seats are confirmed straight away; the operator collects the fare when guests board.</small>
  </aside>
  <section className="nh-agent-list nh-agent-travel-list">
   {!transfers.length&&<div className="nh-agent-empty">No transfers booked yet.</div>}
   {transfers.map(t=><article key={t.id} className="nh-agent-card">
    <header><div><small>{t.id}{t.agentReference?' · '+t.agentReference:''}</small><h3>{t.name}</h3></div><span className={'nh-agent-pill is-'+(t.status==='Cancelled'?'cancelled':t.journeys.some((j:any)=>j.status==='Declined')?'request':t.journeys.every((j:any)=>j.status==='Accepted')?'confirmed':'pending')}>{t.status==='Cancelled'?'Cancelled':t.journeys.some((j:any)=>j.status==='Declined')?(t.journeys.some((j:any)=>j.cancelledByOperator)?'Cancelled by operator':'Declined by operator'):t.journeys.every((j:any)=>j.status==='Accepted')?'Confirmed':'Awaiting operator'}</span></header>
    {t.journeys.map((j:any,i:number)=><dl key={i}>
     <div><dt>Departure</dt><dd>{niceDate(j.date)} · {j.depart}</dd></div>
     <div><dt>Route</dt><dd>{j.from} → {j.to}</dd></div>
     <div><dt>Operator</dt><dd>{j.operatorName}{j.boatName?' · '+j.boatName:''}</dd></div>
     {j.seats?.length>0&&<div><dt>Seats</dt><dd>{j.seats.join(', ')}</dd></div>}
     <div><dt>Guests</dt><dd>{t.adults+t.children+t.infants}{j.departed?(j.noShow?' · No-show':' · '+j.boardedPax+' boarded'):''}</dd></div>
     {j.declineReason&&<div><dt>Reason</dt><dd>{j.declineReason}</dd></div>}
    </dl>)}
    {t.status!=='Cancelled'&&!t.journeys.some((j:any)=>j.departed||j.boardedPax)&&<div className="nh-agent-actions"><button type="button" className="is-danger" onClick={()=>void cancel(t.id)}><X/>Cancel</button></div>}
   </article>)}
  </section>
 </div>;
}

export function Rides({travel,pickup}:{travel:ReturnType<typeof useTravel>;pickup:string}){
 const {data,send}=travel;
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[from,setFrom]=useState(pickup),[to,setTo]=useState(''),[quantity,setQuantity]=useState(2),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
 const token=useRef('');
 useEffect(()=>{token.current=crypto.randomUUID();},[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setDone('');
  try{await send({action:'request-ride',token:token.current,name,phone,location:from,destination:to,quantity,notes});setDone('Ride requested. The first available driver will take it; follow it below.');token.current=crypto.randomUUID();setName('');setPhone('');setTo('');setNotes('');}
  catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 async function cancel(id:string){if(!window.confirm('Cancel this ride?'))return;try{await send({action:'cancel-ride',rideId:id});}catch(err){setError((err as Error).message)}}
 const rides:any[]=data?.rides||[];
 return <div className="nh-agent-travel">
  <form className="nh-transfer-form" onSubmit={submit}>
   <div className="nh-step">
    <h3>Buggy ride</h3>
    <div className="nh-fields">
     <label><span><MapPin/>Pickup point</span><input required maxLength={150} value={from} onChange={e=>setFrom(e.target.value)}/></label>
     <label><span><Car/>Destination</span><input required maxLength={150} value={to} onChange={e=>setTo(e.target.value)} placeholder="Harbour, beach, restaurant…"/></label>
    </div>
    <div className="nh-fields nh-fields-3">
     <label><span>Lead guest name</span><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label><span>Guest WhatsApp (optional)</span><input maxLength={30} inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+44 7XXX XXXXXX"/></label>
     <label><span><Users/>Passengers</span><select value={quantity} onChange={e=>setQuantity(Number(e.target.value))}>{[1,2,3,4,5,6].map(x=><option key={x}>{x}</option>)}</select></label>
    </div>
    <label><span>Note for the driver (optional)</span><textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Luggage, a landmark, accessibility needs…"/></label>
   </div>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   {done&&<p className="nh-hint" role="status">{done}</p>}
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy}>{busy?'Requesting…':'Request a buggy'} <ArrowRight/></button>
  </form>
  <aside className="nh-fare">
   <p className="nh-kicker">Buggy ride</p>
   <div className="nh-fare-total"><span>Fare per ride</span><strong>{data?.rideFareCents?usd(data.rideFareCents):'Ask the driver'}</strong></div>
   <small>Pay the driver at the end of your ride. Without a guest number, the driver calls your guest house.</small>
  </aside>
  <section className="nh-agent-list nh-agent-travel-list">
   {!rides.length&&<div className="nh-agent-empty">No rides requested yet.</div>}
   {rides.map(r=><article key={r.id} className="nh-agent-card">
    <header><div><small>{r.id} · {r.pickupTime}</small><h3>{r.location} → {r.destination}</h3></div><span className={'nh-agent-pill is-'+(r.status==='Cancelled'?'cancelled':r.status==='Requested'?'pending':'confirmed')}>{r.status==='Requested'?'Finding a buggy':r.status}</span></header>
    <dl>
     <div><dt>Guest</dt><dd>{r.guest} · {r.quantity}</dd></div>
     <div><dt>Driver</dt><dd>{r.driver||r.operatorName||'Being assigned'}{r.buggyName?' · '+r.buggyName:''}</dd></div>
    </dl>
    {!['Cancelled','Completed','On trip'].includes(r.status)&&<div className="nh-agent-actions"><button type="button" className="is-danger" onClick={()=>void cancel(r.id)}><X/>Cancel ride</button></div>}
   </article>)}
  </section>
 </div>;
}
