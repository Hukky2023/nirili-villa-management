'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Anchor,CalendarDays,Car,CheckCircle2,ClipboardList,LogOut,MessageCircle,Plus,RefreshCw,Ship,UserRound,Users,Wallet,XCircle} from 'lucide-react';
import TimeField24 from '../time-field-24';
import SeatMap,{type SeatMark} from '../seat-map';
import SeatEditor from './seat-editor';
import {defaultLayout,type SeatLayout} from '../../lib/transport';

type CrewMember={id:string;operatorId:string;operatorName?:string;name:string;phone:string;role:'Captain'|'Crew';username:string;active:boolean};
type Operator={id:string;name:string;contactName:string;services:('boat'|'buggy')[];commissionPercent:number;buggyOnline?:boolean};
type Boat={id:string;name:string;registration:string;capacity:number;active:boolean;layout?:SeatLayout};
type Sailing={id:string;from:string;to:string;depart:string;arrive:string;capacity:number;fare:number;roomFare?:number;days?:number[];active:boolean;boatId?:string;crewIds?:string[]};
type Ticket={cancelledByOperator?:boolean;bookingId:string;index:number;name:string;phone:string;adults:number;children:number;infants:number;pax:number;notes:string;source:string;pickup:string;seats:number[];date:string;depart:string;arrive:string;from:string;to:string;scheduleId:string;status:'New'|'Accepted'|'Declined';boatId:string;boatName:string;boardedPax:number;departed:boolean;noShow:boolean;declineReason:string;roomBilled:boolean;fareMvr:number};
type Departure={crewIds?:string[];crewChanged?:boolean;scheduleId:string;date:string;from:string;to:string;depart:string;arrive:string;boatId:string;boatName:string;swapped:boolean;layout:SeatLayout|null;seats:number;sold:number;boarded:number;closed:boolean;tickets:Ticket[]};
type Ride={id:string;guest:string;phone:string;location:string;destination:string;quantity:number;notes:string;date:string;pickupTime:string;status:string;fareCents:number;roomBilled:boolean;buggyId:string};
type Tab='boarding'|'bookings'|'crew'|'departures'|'boats'|'rides'|'buggies'|'statement';

const mvr=(c:number)=>'MVR '+(Math.max(0,Number(c)||0)/100).toFixed(2);
const usd=(c:number)=>'$'+(Math.max(0,Number(c)||0)/100).toFixed(2);
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const PLACES=['Velana Airport','Dhiffushi',"Male'"];
const niceDate=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'';
const party=(t:{adults:number;children:number;infants:number})=>[t.adults+' adult'+(t.adults===1?'':'s'),t.children?t.children+' child'+(t.children===1?'':'ren'):'',t.infants?t.infants+' infant'+(t.infants===1?'':'s'):''].filter(Boolean).join(', ');
const wa=(phone:string,message='')=>'https://wa.me/'+phone.replace(/\D/g,'')+(message?'?text='+encodeURIComponent(message):'');

const crewNames=(crew:CrewMember[],ids?:string[])=>(ids||[]).map(id=>crew.find(c=>c.id===id)?.name).filter(Boolean).join(', ')||'none yet';

async function call(url:string,body?:any){
 const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const d:any=await r.json().catch(()=>({}));
 if(!r.ok){const e:any=Error(d.error||'Something went wrong. Please try again.');e.status=r.status;throw e;}
 return d;
}

export default function OperatorPortal(){
 const [who,setWho]=useState<{operator:Operator|null;crew:CrewMember|null}|null|undefined>(undefined);
 useEffect(()=>{call('/api/operator-portal/session').then(d=>setWho(d.operator||d.crew?d:null)).catch(()=>setWho(null));},[]);
 if(who===undefined)return <div className="op-wrap"><p className="op-muted">Loading…</p></div>;
 if(!who)return <div className="op-wrap"><Login onSignedIn={setWho}/></div>;
 if(who.crew)return <CrewWorkspace crew={who.crew} onSignedOut={()=>setWho(null)}/>;
 return <Workspace operator={who.operator!} onSignedOut={()=>setWho(null)}/>;
}

function Login({onSignedIn}:{onSignedIn:(who:{operator:Operator|null;crew:CrewMember|null})=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const d=await call('/api/operator-portal/session',{username,password});setPassword('');onSignedIn(d);}
  catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 return <form className="op-login" onSubmit={submit}>
  <span className="op-logo"><Anchor/></span>
  <p className="op-kicker">Nirili Travels</p>
  <h1>Operator portal</h1>
  <p className="op-muted">For speedboat companies, their boat crew and buggy owners working with Nirili. Sign in with the login you were given.</p>
  <label>Username<input required autoComplete="username" autoCapitalize="none" maxLength={40} value={username} onChange={e=>setUsername(e.target.value)}/></label>
  <label>Password<input required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {error&&<p className="op-error" role="alert">{error}</p>}
  <button className="op-primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
  <small className="op-muted">Want to join? <a href="https://wa.me/9609413977" target="_blank" rel="noopener noreferrer">Message Nirili on WhatsApp</a>.</small>
 </form>;
}

function Workspace({operator,onSignedOut}:{operator:Operator;onSignedOut:()=>void}){
 const boats=operator.services.includes('boat'),buggies=operator.services.includes('buggy');
 const tabs:{id:Tab;label:string;icon:any;show:boolean}[]=[
  {id:'boarding',label:'Boarding',icon:Users,show:boats},{id:'bookings',label:'Bookings',icon:ClipboardList,show:boats},
  {id:'departures',label:'Departures',icon:CalendarDays,show:boats},{id:'boats',label:'Boats',icon:Ship,show:boats},{id:'crew',label:'Crew',icon:UserRound,show:boats},
  {id:'rides',label:'Rides',icon:Car,show:buggies},{id:'buggies',label:'Buggies',icon:Car,show:buggies},
  {id:'statement',label:'Statement',icon:Wallet,show:true}];
 const [tab,setTab]=useState<Tab>(boats?'boarding':'rides');
 const [date,setDate]=useState(''),[month,setMonth]=useState('');
 const [sea,setSea]=useState<any>(null),[land,setLand]=useState<any>(null);
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');

 const handle=useCallback((e:any)=>{if(e?.status===401){onSignedOut();return;}setError(e?.message||'Something went wrong.');},[onSignedOut]);
 const loadSea=useCallback(async()=>{if(!boats)return;try{const d=await call('/api/operator-portal/speedboats'+(date||month?'?'+new URLSearchParams({...(date?{date}:{}),...(month?{month}:{})}):''));setSea(d);if(!date)setDate(d.date);if(!month)setMonth(d.month);}catch(e){handle(e)}},[boats,date,month,handle]);
 const loadLand=useCallback(async()=>{if(!buggies)return;try{const d=await call('/api/operator-portal/buggy'+(month?'?month='+month:''));setLand(d);if(!month)setMonth(d.month);}catch(e){handle(e)}},[buggies,month,handle]);
 useEffect(()=>{void loadSea();},[loadSea]);
 useEffect(()=>{void loadLand();},[loadLand]);
 // Keep bookings and ride requests live while the portal is open.
 useEffect(()=>{const t=setInterval(()=>{if(document.visibilityState==='visible'){void loadSea();void loadLand();}},20000);return ()=>clearInterval(t);},[loadSea,loadLand]);

 async function sea$(body:any,done=''){
  if(busy)return false;setBusy(JSON.stringify(body).slice(0,80));setError('');setMessage('');
  try{setSea(await call('/api/operator-portal/speedboats',{...body,viewDate:date,viewMonth:month}));if(done)setMessage(done);return true;}
  catch(e){handle(e);return false}finally{setBusy('')}
 }
 async function land$(body:any,done=''){
  if(busy)return false;setBusy(JSON.stringify(body).slice(0,80));setError('');setMessage('');
  try{setLand(await call('/api/operator-portal/buggy',{...body,viewMonth:month}));if(done)setMessage(done);return true;}
  catch(e){handle(e);return false}finally{setBusy('')}
 }
 async function signOut(){await fetch('/api/operator-portal/session',{method:'DELETE'}).catch(()=>null);onSignedOut();}

 const open:Ride[]=land?.open||[];
 return <div className="op-wrap">
  <header className="op-bar">
   <div><small>Nirili Travels operator</small><strong>{operator.name}</strong><span>{[boats&&'Speedboat transfers',buggies&&'Buggy rides'].filter(Boolean).join(' · ')} · Nirili commission {operator.commissionPercent}%</span></div>
   <div className="op-bar-actions">
    <button type="button" onClick={()=>{void loadSea();void loadLand();}} aria-label="Refresh"><RefreshCw/></button>
    <button type="button" onClick={()=>void signOut()}><LogOut/>Sign out</button>
   </div>
  </header>
  <nav className="op-tabs" aria-label="Portal sections">
   {tabs.filter(t=>t.show).map(t=><button key={t.id} type="button" aria-pressed={tab===t.id} onClick={()=>{setTab(t.id);setMessage('');setError('');}}>
    <t.icon/>{t.label}{t.id==='rides'&&open.length>0&&<b>{open.length}</b>}
   </button>)}
  </nav>
  {message&&<p className="op-message" role="status"><CheckCircle2/>{message}</p>}
  {error&&<p className="op-error" role="alert">{error}</p>}
  {tab==='boarding'&&sea&&<Boarding data={sea} date={date} setDate={setDate} busy={!!busy} act={sea$}/>}
  {tab==='crew'&&sea&&<CrewTab crew={sea.crew||[]} busy={!!busy} act={sea$}/>}
  {tab==='bookings'&&sea&&<Bookings trips={sea.bookings||[]} crew={sea.crew||[]} openDay={d=>{setDate(d);setTab('boarding');}} busy={!!busy} act={sea$}/>}
  {tab==='departures'&&sea&&<Departures sailings={sea.sailings} boats={sea.boats} crew={sea.crew||[]} busy={!!busy} act={sea$}/>}
  {tab==='boats'&&sea&&<Boats boats={sea.boats} busy={!!busy} act={sea$}/>}
  {tab==='rides'&&land&&<Rides data={land} operator={operator} busy={!!busy} act={land$}/>}
  {tab==='buggies'&&land&&<Buggies buggies={land.buggies} busy={!!busy} act={land$}/>}
  {tab==='statement'&&<Statement month={month} setMonth={setMonth} sea={boats?sea?.statement:null} land={buggies?land?.statement:null}/>}
  {((tab!=='statement'&&tab!=='rides'&&tab!=='buggies'&&!sea)||((tab==='rides'||tab==='buggies')&&!land))&&!error&&<p className="op-muted">Loading…</p>}
 </div>;
}

// Every upcoming trip with bookings, grouped by day. Tickets are confirmed at booking.
function Bookings({trips,crew,openDay,busy,act}:{trips:any[];crew:CrewMember[];openDay:(d:string)=>void;busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 if(!trips.length)return <p className="op-empty">No upcoming bookings yet. New bookings appear here as soon as guests choose their seats.</p>;
 return <section className="op-list">{trips.map(trip=><article key={trip.scheduleId+trip.date} className="op-departure">
  <header><div><small>{niceDate(trip.date)} · {trip.boatName||'No boat chosen'}{trip.swapped?' (swapped for this day)':''} · Crew: {crewNames(crew,trip.crewIds)}</small><h3>{trip.depart} · {trip.from} → {trip.to}</h3></div><span className="op-pill is-ok">{trip.sold} seat{trip.sold===1?'':'s'} sold</span></header>
  <div className="op-boat"><ul>{trip.tickets.map((t:Ticket)=><li key={t.bookingId+':'+t.index}>
   <div><strong>{t.name}</strong><small>{t.bookingId} · Seat{t.seats.length===1?'':'s'} {t.seats.slice().sort((a,b)=>a-b).join(', ')} · {party(t)} · {t.source}{t.roomBilled?' · room bill':' · collect '+mvr(t.fareMvr)}</small>{t.pickup&&<small>Pickup: {t.pickup}</small>}{t.notes&&<small className="op-note">{t.notes}</small>}</div>
   <div className="op-actions">
    {t.phone&&<a className="op-ghost" href={wa(t.phone)} target="_blank" rel="noopener noreferrer" aria-label={'WhatsApp '+t.name}><MessageCircle/></a>}
    <CancelTicket t={t} busy={busy} act={act}/>
   </div>
  </li>)}</ul></div>
  <div className="op-actions"><button onClick={()=>openDay(trip.date)}><Users/>Open boarding for this day</button></div>
 </article>)}</section>;
}

function CancelTicket({t,busy,act}:{t:Ticket;busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 if(t.boardedPax>0||t.departed)return null;
 return <button className="op-danger" disabled={busy} onClick={()=>{const reason=window.prompt('Cancel '+t.name+' ('+t.bookingId+')? Tell Nirili why, e.g. the guest asked to cancel.');if(reason)void act({action:'cancel',bookingId:t.bookingId,index:t.index,reason},'Ticket '+t.bookingId+' cancelled. Seats '+t.seats.join(', ')+' are on sale again and Nirili has been told.');}}><XCircle/>Cancel</button>;
}

// The day's trips with seat maps and passengers. Crew (crewMode) see only their own trips and
// can board guests and close the trip; operators also change the boat, crew and cancel tickets.
function Boarding({data,date,setDate,busy,act,crewMode=false}:{data:any;date:string;setDate:(d:string)=>void;busy:boolean;act:(b:any,done?:string)=>Promise<boolean>;crewMode?:boolean}){
 const day:Departure[]=data.day||[],boats:Boat[]=data.boats||[],crew:CrewMember[]=data.crew||[];
 return <section className="op-list">
  <div className="op-toolbar"><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span className="op-muted">{date===data.today?'Today':niceDate(date)}</span></div>
  {!day.length&&<p className="op-empty">{crewMode?'You are not on any trip this day.':'No departures on this day.'}</p>}
  {day.map(d=>{
   const live=d.tickets.filter(t=>t.status!=='Declined'),open=live.filter(t=>!t.departed),total=live.reduce((n,t)=>n+t.pax,0);
   const marks:Record<number,SeatMark>={},titles:Record<number,string>={};
   for(const t of live)for(const n of t.seats){marks[n]=t.departed&&t.noShow?'noshow':t.boardedPax>=t.pax?'boarded':'booked';titles[n]=t.name;}
   const layout=d.layout||defaultLayout(Math.max(1,d.seats||1)),canSwap=!crewMode&&!d.closed&&(date>data.today||date===data.today&&!live.some(t=>t.boardedPax>0));
   return <article key={d.scheduleId} className="op-departure">
    <header><div><small>Arrives {d.arrive} · {d.sold}/{d.seats||'–'} seats sold · {d.boarded}/{total} on board</small><h3>{d.depart} · {d.from} → {d.to}</h3></div>{d.closed?<span className="op-pill">Departed</span>:<span className="op-pill is-ok"><Ship/>{d.boatName||'No boat'}</span>}</header>
    {d.swapped&&<p className="op-note">Running on {d.boatName} instead of the usual boat for this day.</p>}
    {canSwap&&boats.filter(b=>b.active).length>1&&<label className="op-swap">Boat for this trip
     <select value={d.boatId} disabled={busy} onChange={e=>{const b=boats.find(x=>x.id===e.target.value);if(b&&window.confirm('Run the '+d.depart+' trip on '+niceDate(date)+' with '+b.name+'? Booked guests keep their seat numbers.'))void act({action:'trip-boat',scheduleId:d.scheduleId,date,boatId:b.id},'This trip now runs on '+b.name+'.');}}>
      {!d.boatId&&<option value="">Choose…</option>}{boats.filter(b=>b.active||b.id===d.boatId).map(b=><option key={b.id} value={b.id}>{b.name} · {b.capacity} seats</option>)}
     </select></label>}
    {!crewMode&&<TripCrew d={d} date={date} today={data.today} crew={crew} busy={busy} act={act}/>}
    <details className="op-seatmap" open={crewMode||undefined}><summary>Seat map</summary><SeatMap layout={layout} taken={Object.keys(marks).map(Number)} marks={marks} titles={titles} caption={'Seats on '+(d.boatName||'this trip')}/></details>
    {!live.length?<p className="op-muted">No tickets yet.</p>:<div className="op-boat"><ul>{live.map(t=>{const key=t.bookingId+':'+t.index;return <li key={key} className={t.departed?(t.noShow?'is-noshow':'is-gone'):t.boardedPax===t.pax?'is-in':''}>
     <div><strong>{t.name} · Seat{t.seats.length===1?'':'s'} {t.seats.slice().sort((a,b)=>a-b).join(', ')}</strong><small>{t.bookingId} · {party(t)} · {t.source}{t.roomBilled?' · room bill':' · collect '+mvr(t.fareMvr)}</small>{t.notes&&<small className="op-note">{t.notes}</small>}</div>
     {t.departed?<span className="op-pill">{t.noShow?'No-show':'Departed · '+t.boardedPax+'/'+t.pax}</span>
     :<div className="op-actions">
      {t.phone&&<a className="op-ghost" href={wa(t.phone)} target="_blank" rel="noopener noreferrer" aria-label={'WhatsApp '+t.name}><MessageCircle/></a>}
      <select aria-label={'Passengers of '+t.name+' on board'} value={t.boardedPax} disabled={busy||date>data.today} onChange={e=>void act({action:'board',bookingId:t.bookingId,index:t.index,boarded:Number(e.target.value)})}>
       {Array.from({length:t.pax+1},(_,n)=><option key={n} value={n}>{n} on board</option>)}
      </select>
      <button className={t.boardedPax===t.pax?'op-done':'op-primary'} disabled={busy||date>data.today} onClick={()=>void act({action:'board',bookingId:t.bookingId,index:t.index,boarded:t.boardedPax===t.pax?0:t.pax})}>{t.boardedPax===t.pax?'All on board ✓':'Board all'}</button>
      {!crewMode&&<CancelTicket t={t} busy={busy} act={act}/>}
     </div>}
    </li>;})}</ul></div>}
    {open.length>0&&date<=data.today&&<button className="op-close" disabled={busy} onClick={()=>{if(window.confirm('Close the '+d.depart+' trip? Anyone not on board is marked a no-show.'))void act({action:'close',scheduleId:d.scheduleId,date:d.date},'Trip closed.');}}><Anchor/>Close trip</button>}
   </article>;
  })}
 </section>;
}

const emptySailing={id:'',from:'Velana Airport',to:'Dhiffushi',depart:'',arrive:'',boatId:'',crewIds:[] as string[],fare:'',roomFare:'',days:[] as number[],active:true};
function Departures({sailings,boats,crew,busy,act}:{sailings:Sailing[];boats:Boat[];crew:CrewMember[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState<any>(null);
 const sorted=useMemo(()=>sailings.slice().sort((a,b)=>(a.from+a.depart).localeCompare(b.from+b.depart)),[sailings]);
 const usable=boats.filter(b=>b.active),boatName=(id?:string)=>boats.find(b=>b.id===id)?.name;
 async function save(e:React.FormEvent){
  e.preventDefault();
  const sailing={...draft,fare:Math.round(Number(draft.fare)*100),roomFare:draft.roomFare===''?'':Math.round(Number(draft.roomFare)*100)};
  if(await act({action:'save-sailing',sailing},'Departure saved. Guests can book seats on it now.'))setDraft(null);
 }
 if(!usable.length&&!sailings.length)return <p className="op-empty">Add a boat and draw its seats under Boats first. Every departure runs on one of your boats.</p>;
 if(draft)return <form className="op-form" onSubmit={save}>
  <h3>{draft.id?'Edit departure':'New departure'}</h3>
  <div className="op-grid">
   <label>From<input list="op-places" required maxLength={60} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
   <label>To<input list="op-places" required maxLength={60} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
   <label>Departs<TimeField24 required value={draft.depart} onChange={e=>setDraft({...draft,depart:e.target.value})} aria-label="Departure time"/></label>
   <label>Arrives<TimeField24 required value={draft.arrive} onChange={e=>setDraft({...draft,arrive:e.target.value})} aria-label="Arrival time"/></label>
   <label>Boat<select required value={draft.boatId} onChange={e=>setDraft({...draft,boatId:e.target.value})}><option value="">Choose a boat…</option>{usable.map(b=><option key={b.id} value={b.id}>{b.name} · {b.capacity} seats</option>)}</select></label>
   <label>Adult fare (MVR)<input required type="number" min={0} step="0.01" value={draft.fare} onChange={e=>setDraft({...draft,fare:e.target.value})}/></label>
   <label>Fare for Nirili Villa guests (USD, optional)<input type="number" min={0} step="0.01" value={draft.roomFare} onChange={e=>setDraft({...draft,roomFare:e.target.value})} placeholder="Leave empty if not offered"/></label>
  </div>
  <datalist id="op-places">{PLACES.map(p=><option key={p} value={p}/>)}</datalist>
  {crew.some(c=>c.active)&&<fieldset className="op-days"><legend>Regular crew (change it for one day under Boarding)</legend>{crew.filter(c=>c.active||draft.crewIds.includes(c.id)).map(c=><label key={c.id}><input type="checkbox" checked={draft.crewIds.includes(c.id)} onChange={e=>setDraft({...draft,crewIds:e.target.checked?[...draft.crewIds,c.id]:draft.crewIds.filter((x:string)=>x!==c.id)})}/>{c.name} · {c.role}</label>)}</fieldset>}
  <fieldset className="op-days"><legend>Runs on (none ticked = every day)</legend>{DAYS.map((d,i)=><label key={d}><input type="checkbox" checked={draft.days.includes(i)} onChange={e=>setDraft({...draft,days:e.target.checked?[...draft.days,i]:draft.days.filter((x:number)=>x!==i)})}/>{d}</label>)}</fieldset>
  <label className="op-check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>On sale</label>
  <p className="op-muted">Guests choose their seats on this boat's seat map. To use a different boat on one day only, change it in Boarding for that date. Children pay half the adult fare; infants travel free on a lap.</p>
  <div className="op-actions"><button className="op-primary" disabled={busy}>Save departure</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
 </form>;
 return <section className="op-list">
  <button className="op-add" disabled={!usable.length} onClick={()=>setDraft({...emptySailing,boatId:usable.length===1?usable[0].id:''})}><Plus/>New departure</button>
  {!sorted.length&&<p className="op-empty">Publish your first departure so guests can book seats.</p>}
  {sorted.map(s=><article key={s.id} className={'op-card'+(s.active?'':' is-off')}>
   <header><div><small>{s.days?.length?s.days.map(d=>DAYS[d]).join(' · '):'Every day'}</small><h3>{s.depart} {s.from} → {s.to}</h3></div><span className={'op-pill'+(s.active?' is-ok':'')}>{s.active?'On sale':'Off sale'}</span></header>
   <p>Arrives {s.arrive} · {boatName(s.boatId)?boatName(s.boatId)+' · '+s.capacity+' seats':s.capacity+' seats'} · {mvr(s.fare)} adult{Number.isInteger(s.roomFare)?' · Villa guests '+usd(s.roomFare!):''}</p>
   {crew.length>0&&<p className="op-muted">Crew: {crewNames(crew,s.crewIds)}</p>}
   {!s.boatId&&<p className="op-note">Choose the boat for this departure so guests see its seat map. Tap Edit.</p>}
   <div className="op-actions"><button onClick={()=>setDraft({...s,boatId:s.boatId||'',crewIds:s.crewIds||[],fare:(s.fare/100).toFixed(2),roomFare:Number.isInteger(s.roomFare)?(s.roomFare!/100).toFixed(2):'',days:s.days||[]})}>Edit</button>
    {s.boatId&&<button disabled={busy} onClick={()=>void act({action:'save-sailing',sailing:{...s,active:!s.active}},s.active?'Taken off sale.':'Back on sale.')}>{s.active?'Take off sale':'Put on sale'}</button>}</div>
  </article>)}
 </section>;
}

function Boats({boats,busy,act}:{boats:Boat[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState<any>(null);
 async function save(e:React.FormEvent){e.preventDefault();if(await act({action:'save-boat',boat:draft},'Boat saved. Departures on it now show this seat map.'))setDraft(null);}
 if(draft)return <form className="op-form" onSubmit={save}>
  <h3>{draft.id?'Edit boat':'Add a boat'}</h3>
  <div className="op-grid">
   <label>Boat name<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Registration number<input maxLength={40} value={draft.registration} onChange={e=>setDraft({...draft,registration:e.target.value})}/></label>
  </div>
  <h4 className="op-h">Seat map</h4>
  <p className="op-muted">Draw the passenger seats as they are on board, with the front of the boat at the top. Guests pick their seats from this map.</p>
  <SeatEditor value={draft.layout} onChange={layout=>setDraft((d:any)=>({...d,layout}))}/>
  <label className="op-check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>In service</label>
  <div className="op-actions"><button className="op-primary" disabled={busy}>Save boat</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
 </form>;
 return <section className="op-list">
  <button className="op-add" onClick={()=>setDraft({id:'',name:'',registration:'',layout:defaultLayout(20,4),active:true})}><Plus/>Add a boat</button>
  {!boats.length&&<p className="op-empty">Add the boats you use and draw their seats. Each departure runs on one of your boats.</p>}
  {boats.map(b=><article key={b.id} className={'op-card'+(b.active?'':' is-off')}>
   <header><div><small>{b.registration||'No registration recorded'}</small><h3>{b.name}</h3></div><span className={'op-pill'+(b.active?' is-ok':'')}>{b.active?'In service':'Out of service'}</span></header>
   <p>{b.capacity} passenger seats{b.layout?'':' · seat map not drawn yet'}</p>
   <details className="op-seatmap"><summary>Seat map</summary><SeatMap layout={b.layout||defaultLayout(b.capacity)} legend={false} caption={'Seats on '+b.name}/></details>
   <div className="op-actions"><button onClick={()=>setDraft({...b,layout:b.layout||defaultLayout(b.capacity)})}>Edit boat and seats</button></div>
  </article>)}
 </section>;
}

// Who works a trip. The departure's regular crew apply unless the operator changes them for the day.
function TripCrew({d,date,today,crew,busy,act}:{d:Departure;date:string;today:string;crew:CrewMember[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [pick,setPick]=useState<string[]|null>(null);
 if(!crew.length)return null;
 const ids=d.crewIds||[];
 if(pick)return <div className="op-crew-pick">
  <p className="op-h">Crew for the {d.depart} trip on {niceDate(date)}</p>
  <div className="op-days">{crew.filter(c=>c.active||ids.includes(c.id)).map(c=><label key={c.id}><input type="checkbox" checked={pick.includes(c.id)} onChange={e=>setPick(e.target.checked?[...pick,c.id]:pick.filter(x=>x!==c.id))}/>{c.name} · {c.role}</label>)}</div>
  <div className="op-actions">
   <button className="op-primary" disabled={busy} onClick={async()=>{if(await act({action:'trip-crew',scheduleId:d.scheduleId,date,crewIds:pick},'Crew updated for this trip. They see it when they sign in.'))setPick(null);}}>Save crew</button>
   {d.crewChanged&&<button disabled={busy} onClick={async()=>{if(await act({action:'trip-crew',scheduleId:d.scheduleId,date,regular:true},'This trip is back to the regular crew.'))setPick(null);}}>Use regular crew</button>}
   <button type="button" onClick={()=>setPick(null)}>Cancel</button>
  </div>
 </div>;
 return <p className="op-crew-line"><UserRound/><span>Crew: {crewNames(crew,ids)}{d.crewChanged?' (changed for this day)':''}</span>{!d.closed&&date>=today&&<button disabled={busy} onClick={()=>setPick(ids)}>Change crew</button>}</p>;
}

// The operator's crew logins.
function CrewTab({crew,busy,act}:{crew:CrewMember[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState<any>(null);
 async function save(e:React.FormEvent){
  e.preventDefault();
  const done=draft.id?draft.name+' saved.'+(draft.password?' The new password signs them out of other devices.':''):draft.name+' can now sign in at this page with username '+draft.username+'.';
  if(await act({action:'save-crew',crew:draft},done))setDraft(null);
 }
 if(draft)return <form className="op-form" onSubmit={save}>
  <h3>{draft.id?'Edit crew member':'Add a crew member'}</h3>
  <div className="op-grid">
   <label>Name<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Role<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}><option>Captain</option><option>Crew</option></select></label>
   <label>WhatsApp (optional)<input maxLength={30} inputMode="tel" value={draft.phone} onChange={e=>setDraft({...draft,phone:e.target.value})} placeholder="+960 7XX XXXX"/></label>
   {draft.id?<label>Username<input value={draft.username} disabled/></label>
   :<label>Username<input required minLength={3} maxLength={40} pattern="[a-z0-9._\-]+" autoCapitalize="none" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})} placeholder="e.g. ali.captain"/></label>}
   <label>{draft.id?'New password (leave empty to keep)':'Password (8+ characters)'}<input type="password" autoComplete="new-password" required={!draft.id} minLength={8} maxLength={128} value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label>
  </div>
  {draft.id&&<label className="op-check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Can sign in</label>}
  <p className="op-muted">Crew sign in on this page. They only see the trips you put them on, where they board guests and close the trip. They cannot change departures, boats, fares or bookings.</p>
  <div className="op-actions"><button className="op-primary" disabled={busy}>Save</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
 </form>;
 return <section className="op-list">
  <button className="op-add" onClick={()=>setDraft({id:'',name:'',role:'Crew',phone:'',username:'',password:'',active:true})}><Plus/>Add a crew member</button>
  {!crew.length&&<p className="op-empty">Add your captains and crew so they can board guests on the trips you give them.</p>}
  {crew.map(c=><article key={c.id} className={'op-card'+(c.active?'':' is-off')}>
   <header><div><small>{c.role} · Username {c.username}</small><h3>{c.name}</h3></div><span className={'op-pill'+(c.active?' is-ok':'')}>{c.active?'Can sign in':'Paused'}</span></header>
   {c.phone&&<p><a href={wa(c.phone)} target="_blank" rel="noopener noreferrer">{c.phone}</a></p>}
   <div className="op-actions"><button onClick={()=>setDraft({...c,password:''})}>Edit</button>
    <button disabled={busy} onClick={()=>void act({action:'save-crew',crew:{...c,active:!c.active}},c.active?c.name+' can no longer sign in.':c.name+' can sign in again.')}>{c.active?'Pause login':'Allow sign-in'}</button></div>
  </article>)}
 </section>;
}

// What a crew member sees: their trips for the next 7 days and boarding for the chosen day.
function CrewWorkspace({crew,onSignedOut}:{crew:CrewMember;onSignedOut:()=>void}){
 const [date,setDate]=useState(''),[data,setData]=useState<any>(null);
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const handle=useCallback((e:any)=>{if(e?.status===401){onSignedOut();return;}setError(e?.message||'Something went wrong.');},[onSignedOut]);
 const load=useCallback(async()=>{try{const d=await call('/api/operator-portal/crew'+(date?'?date='+date:''));setData(d);if(!date)setDate(d.date);}catch(e){handle(e)}},[date,handle]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},20000);return ()=>clearInterval(t);},[load]);
 async function act(body:any,done=''){
  if(busy)return false;setBusy(true);setError('');setMessage('');
  try{setData(await call('/api/operator-portal/crew',{...body,viewDate:date}));if(done)setMessage(done);return true;}
  catch(e){handle(e);return false}finally{setBusy(false)}
 }
 async function signOut(){await fetch('/api/operator-portal/session',{method:'DELETE'}).catch(()=>null);onSignedOut();}
 return <div className="op-wrap">
  <header className="op-bar">
   <div><small>{crew.operatorName} · {crew.role}</small><strong>{crew.name}</strong><span>Board guests on your trips</span></div>
   <div className="op-bar-actions">
    <button type="button" onClick={()=>void load()} aria-label="Refresh"><RefreshCw/></button>
    <button type="button" onClick={()=>void signOut()}><LogOut/>Sign out</button>
   </div>
  </header>
  {message&&<p className="op-message" role="status"><CheckCircle2/>{message}</p>}
  {error&&<p className="op-error" role="alert">{error}</p>}
  {!data?<p className="op-muted">Loading…</p>:<>
   <section className="op-departure">
    <h3>Your trips</h3>
    {!data.upcoming.length?<p className="op-muted">You are not on any trip in the next 7 days. Your operator assigns trips to you.</p>
    :<ul className="op-trips">{data.upcoming.map((t:any)=><li key={t.scheduleId+t.date}><button aria-pressed={t.date===date} onClick={()=>setDate(t.date)}>
     <b>{t.date===data.today?'Today':niceDate(t.date)} · {t.depart}</b><span>{t.from} → {t.to} · {t.boatName||'Boat to be confirmed'} · {t.sold}/{t.seats} seats{t.closed?' · departed':''}</span>
    </button></li>)}</ul>}
   </section>
   <Boarding data={data} date={date} setDate={setDate} busy={busy} act={act} crewMode/>
  </>}
 </div>;
}

const NEXT:Record<string,{step:string;label:string}>={Assigned:{step:'on-the-way',label:'Start pickup'},'Driver on the way':{step:'arrived',label:'I have arrived'},Arrived:{step:'boarded',label:'Guest on board'},'On trip':{step:'complete',label:'Complete ride'}};
function Rides({data,operator,busy,act}:{data:any;operator:Operator;busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const buggies=(data.buggies||[]) as any[],free=buggies.filter(b=>b.status==='Available');
 const [pick,setPick]=useState<Record<string,string>>({});
 return <section className="op-list">
  <div className={'op-online'+(data.online?' is-on':'')}>
   <div><strong>{data.online?'You are online':'You are offline'}</strong><span>{data.online?'Ride requests appear below. The first owner to accept gets the ride.':'Go online to see and accept ride requests.'}</span></div>
   <button className={data.online?'':'op-primary'} disabled={busy||(!data.online&&!buggies.length)} onClick={()=>void act({action:'online',online:!data.online})}>{data.online?'Go offline':'Go online'}</button>
  </div>
  {!buggies.length&&<p className="op-empty">Add your buggies under Buggies first.</p>}
  {data.active.map((r:Ride)=>{const next=NEXT[r.status];const buggy=buggies.find(b=>b.id===r.buggyId);return <article key={r.id} className="op-card op-ride">
   <header><div><small>{r.id} · {buggy?.name||'Buggy'}</small><h3>{r.location} → {r.destination}</h3></div><span className="op-pill is-ok">{r.status}</span></header>
   <p><strong>{r.guest}</strong> · {r.quantity} passenger{r.quantity===1?'':'s'} · {r.roomBilled?'charged to Nirili Villa room':'collect '+usd(r.fareCents)}</p>
   {r.notes&&<p className="op-note">{r.notes}</p>}
   <div className="op-actions">
    {r.phone&&<a className="op-ghost" href={wa(r.phone,'Hello '+r.guest+', this is your Nirili Ride driver from '+operator.name+'.')} target="_blank" rel="noopener noreferrer"><MessageCircle/>WhatsApp</a>}
    {next&&<button className="op-primary" disabled={busy} onClick={()=>void act({action:'advance',rideId:r.id,step:next.step})}>{next.label}</button>}
    {['Assigned','Driver on the way'].includes(r.status)&&<button className="op-danger" disabled={busy} onClick={()=>{if(window.confirm('Hand this ride back so another driver can take it?'))void act({action:'advance',rideId:r.id,step:'release'},'Ride handed back.');}}>Hand back</button>}
   </div>
  </article>;})}
  {data.online&&<h3 className="op-h">Waiting requests</h3>}
  {data.online&&!data.open.length&&<p className="op-empty">No waiting requests right now. This list refreshes by itself.</p>}
  {data.open.map((r:Ride)=><article key={r.id} className="op-card op-new">
   <header><div><small>Requested {r.pickupTime}</small><h3>{r.location} → {r.destination}</h3></div><span className="op-pill is-new">Waiting</span></header>
   <p>{r.quantity} passenger{r.quantity===1?'':'s'} · {r.roomBilled?'Nirili Villa guest (room bill)':'collect '+usd(r.fareCents)}</p>
   {r.notes&&<p className="op-note">{r.notes}</p>}
   <div className="op-actions">
    <select aria-label="Buggy" value={pick[r.id]||free[0]?.id||''} onChange={e=>setPick(p=>({...p,[r.id]:e.target.value}))}>{free.map(b=><option key={b.id} value={b.id} disabled={b.capacity<r.quantity}>{b.name} · {b.capacity} seats</option>)}</select>
    <button className="op-primary" disabled={busy||!free.length} onClick={()=>void act({action:'accept',rideId:r.id,buggyId:pick[r.id]||free[0]?.id},'Ride accepted. Head to the pickup point.')}>Accept ride</button>
   </div>
  </article>)}
  {data.recent.length>0&&<details className="op-recent"><summary>Recent rides</summary><ul>{data.recent.map((r:Ride)=><li key={r.id}>{r.date} {r.pickupTime} · {r.location} → {r.destination} · {r.status}</li>)}</ul></details>}
 </section>;
}

function Buggies({buggies,busy,act}:{buggies:any[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState<any>(null);
 async function save(e:React.FormEvent){e.preventDefault();if(await act({action:'save-buggy',buggy:{...draft,capacity:Number(draft.capacity)}},'Buggy saved.'))setDraft(null);}
 if(draft)return <form className="op-form" onSubmit={save}>
  <h3>{draft.id?'Edit buggy':'Add a buggy'}</h3>
  <div className="op-grid">
   <label>Buggy name or plate<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Passenger seats<input required type="number" min={1} max={20} value={draft.capacity} onChange={e=>setDraft({...draft,capacity:e.target.value})}/></label>
   <label>Driver name<input maxLength={100} value={draft.driver} onChange={e=>setDraft({...draft,driver:e.target.value})}/></label>
   <label>Driver WhatsApp<input maxLength={30} inputMode="tel" value={draft.driverPhone} onChange={e=>setDraft({...draft,driverPhone:e.target.value})} placeholder="+960 7XX XXXX"/></label>
   <label>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option>Available</option><option>Out of Service</option></select></label>
  </div>
  <div className="op-actions"><button className="op-primary" disabled={busy}>Save buggy</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
 </form>;
 return <section className="op-list">
  <button className="op-add" onClick={()=>setDraft({id:'',name:'',capacity:4,driver:'',driverPhone:'',status:'Available'})}><Plus/>Add a buggy</button>
  {!buggies.length&&<p className="op-empty">Add your buggies to start taking rides.</p>}
  {buggies.map(b=><article key={b.id} className="op-card">
   <header><div><small>{b.driver||'No driver recorded'}</small><h3>{b.name}</h3></div><span className={'op-pill'+(b.status==='Available'?' is-ok':'')}>{b.status}</span></header>
   <p>{b.capacity} passenger seats</p>
   <div className="op-actions"><button onClick={()=>setDraft({...b,status:b.status==='Assigned'?'Available':b.status})}>Edit</button></div>
  </article>)}
 </section>;
}

function Statement({month,setMonth,sea,land}:{month:string;setMonth:(m:string)=>void;sea:any;land:any}){
 return <section className="op-list">
  <div className="op-toolbar"><label>Month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button onClick={()=>window.print()}><ClipboardList/>Print</button></div>
  {sea&&<article className="op-card">
   <h3>Speedboat trips travelled · {sea.tickets} tickets · {sea.passengers} passengers{sea.noShows?' · '+sea.noShows+' no-shows':''}</h3>{sea.upcoming>0&&<p className="op-muted">{sea.upcoming} accepted ticket(s) later this month are added once they travel.</p>}
   <dl className="op-sums">
    <div><dt>Fares you collect</dt><dd>{mvr(sea.fareMvr)}</dd></div>
    <div><dt>Nirili commission ({sea.rate}%)</dt><dd>{mvr(sea.commissionMvr)}</dd></div>
    <div><dt>Villa guests, collected by Nirili</dt><dd>{usd(sea.roomUsd)}</dd></div>
    <div><dt>Nirili pays you (after commission)</dt><dd>{usd(sea.payableToOperatorUsd)}</dd></div>
   </dl>
   {sea.rows.length>0&&<div className="op-table"><table><thead><tr><th>Date</th><th>Departure</th><th>Guest</th><th>Pax</th><th>Boat</th><th>Fare</th><th>Commission</th></tr></thead>
    <tbody>{sea.rows.map((r:any)=><tr key={r.bookingId+r.date+r.depart}><td>{r.date}</td><td>{r.depart} {r.route}</td><td>{r.guest}{r.noShow?' (no-show)':''}</td><td>{r.pax}</td><td>{r.boat}</td><td>{r.roomBilled?usd(r.roomUsd):r.noShow?'Not collected':mvr(r.fareMvr)}</td><td>{r.roomBilled?usd(r.commissionUsd):mvr(r.commissionMvr)}</td></tr>)}</tbody></table></div>}
  </article>}
  {land&&<article className="op-card">
   <h3>Buggy rides · {land.rides} completed</h3>
   <dl className="op-sums">
    <div><dt>Fares you collect</dt><dd>{usd(land.collectedByOwner)}</dd></div>
    <div><dt>Nirili commission ({land.rate}%)</dt><dd>{usd(land.commissionOwed)}</dd></div>
    <div><dt>Villa guests, collected by Nirili</dt><dd>{usd(land.collectedByNirili)}</dd></div>
    <div><dt>Nirili pays you (after commission)</dt><dd>{usd(land.payableToOwner)}</dd></div>
   </dl>
  </article>}
  {!sea&&!land&&<p className="op-muted">Loading…</p>}
 </section>;
}
