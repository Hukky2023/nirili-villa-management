'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Anchor,CalendarDays,Car,CheckCircle2,ClipboardList,Inbox,LogOut,MessageCircle,Plus,RefreshCw,Ship,Users,Wallet,XCircle} from 'lucide-react';
import TimeField24 from '../time-field-24';

type Operator={id:string;name:string;contactName:string;services:('boat'|'buggy')[];commissionPercent:number;buggyOnline?:boolean};
type Boat={id:string;name:string;registration:string;capacity:number;active:boolean};
type Sailing={id:string;from:string;to:string;depart:string;arrive:string;capacity:number;fare:number;roomFare?:number;days?:number[];active:boolean};
type Ticket={bookingId:string;index:number;name:string;phone:string;adults:number;children:number;infants:number;pax:number;notes:string;source:string;pickup:string;date:string;depart:string;arrive:string;from:string;to:string;scheduleId:string;status:'New'|'Accepted'|'Declined';boatId:string;boatName:string;boardedPax:number;departed:boolean;noShow:boolean;declineReason:string;roomBilled:boolean;fareMvr:number};
type Departure={scheduleId:string;date:string;from:string;to:string;depart:string;arrive:string;seats:number;sold:number;boarded:number;tickets:Ticket[]};
type Ride={id:string;guest:string;phone:string;location:string;destination:string;quantity:number;notes:string;date:string;pickupTime:string;status:string;fareCents:number;roomBilled:boolean;buggyId:string};
type Tab='boarding'|'tickets'|'departures'|'boats'|'rides'|'buggies'|'statement';

const mvr=(c:number)=>'MVR '+(Math.max(0,Number(c)||0)/100).toFixed(2);
const usd=(c:number)=>'$'+(Math.max(0,Number(c)||0)/100).toFixed(2);
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const PLACES=['Velana Airport','Dhiffushi',"Male'"];
const niceDate=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'';
const party=(t:{adults:number;children:number;infants:number})=>[t.adults+' adult'+(t.adults===1?'':'s'),t.children?t.children+' child'+(t.children===1?'':'ren'):'',t.infants?t.infants+' infant'+(t.infants===1?'':'s'):''].filter(Boolean).join(', ');
const wa=(phone:string,message='')=>'https://wa.me/'+phone.replace(/\D/g,'')+(message?'?text='+encodeURIComponent(message):'');

async function call(url:string,body?:any){
 const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const d:any=await r.json().catch(()=>({}));
 if(!r.ok){const e:any=Error(d.error||'Something went wrong. Please try again.');e.status=r.status;throw e;}
 return d;
}

export default function OperatorPortal(){
 const [operator,setOperator]=useState<Operator|null|undefined>(undefined);
 useEffect(()=>{call('/api/operator-portal/session').then(d=>setOperator(d.operator)).catch(()=>setOperator(null));},[]);
 if(operator===undefined)return <div className="op-wrap"><p className="op-muted">Loading…</p></div>;
 if(!operator)return <div className="op-wrap"><Login onSignedIn={setOperator}/></div>;
 return <Workspace operator={operator} onSignedOut={()=>setOperator(null)}/>;
}

function Login({onSignedIn}:{onSignedIn:(o:Operator)=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const d=await call('/api/operator-portal/session',{username,password});setPassword('');onSignedIn(d.operator);}
  catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 return <form className="op-login" onSubmit={submit}>
  <span className="op-logo"><Anchor/></span>
  <p className="op-kicker">Nirili Travels</p>
  <h1>Operator portal</h1>
  <p className="op-muted">For speedboat companies and buggy owners working with Nirili. Sign in with the login Nirili gave you.</p>
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
  {id:'boarding',label:'Boarding',icon:Users,show:boats},{id:'tickets',label:'New tickets',icon:Inbox,show:boats},
  {id:'departures',label:'Departures',icon:CalendarDays,show:boats},{id:'boats',label:'Boats',icon:Ship,show:boats},
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
 // Keep the inbox and ride requests live while the portal is open.
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

 const inbox:Ticket[]=sea?.inbox||[],open:Ride[]=land?.open||[];
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
    <t.icon/>{t.label}{t.id==='tickets'&&inbox.length>0&&<b>{inbox.length}</b>}{t.id==='rides'&&open.length>0&&<b>{open.length}</b>}
   </button>)}
  </nav>
  {message&&<p className="op-message" role="status"><CheckCircle2/>{message}</p>}
  {error&&<p className="op-error" role="alert">{error}</p>}
  {tab==='boarding'&&sea&&<Boarding data={sea} date={date} setDate={setDate} busy={!!busy} act={sea$}/>}
  {tab==='tickets'&&sea&&<Tickets tickets={inbox} boats={sea.boats} busy={!!busy} act={sea$}/>}
  {tab==='departures'&&sea&&<Departures sailings={sea.sailings} busy={!!busy} act={sea$}/>}
  {tab==='boats'&&sea&&<Boats boats={sea.boats} busy={!!busy} act={sea$}/>}
  {tab==='rides'&&land&&<Rides data={land} operator={operator} busy={!!busy} act={land$}/>}
  {tab==='buggies'&&land&&<Buggies buggies={land.buggies} busy={!!busy} act={land$}/>}
  {tab==='statement'&&<Statement month={month} setMonth={setMonth} sea={boats?sea?.statement:null} land={buggies?land?.statement:null}/>}
  {((tab!=='statement'&&tab!=='rides'&&tab!=='buggies'&&!sea)||((tab==='rides'||tab==='buggies')&&!land))&&!error&&<p className="op-muted">Loading…</p>}
 </div>;
}

function BoatPicker({boats,value,onChange,need}:{boats:Boat[];value:string;onChange:(v:string)=>void;need:number}){
 const usable=boats.filter(b=>b.active);
 return <select value={value} onChange={e=>onChange(e.target.value)} aria-label="Boat">
  <option value="">Choose boat…</option>
  {usable.map(b=><option key={b.id} value={b.id} disabled={b.capacity<need}>{b.name} · {b.capacity} seats{b.capacity<need?' (too small)':''}</option>)}
 </select>;
}

function Tickets({tickets,boats,busy,act}:{tickets:Ticket[];boats:Boat[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [pick,setPick]=useState<Record<string,string>>({});
 if(!boats.filter(b=>b.active).length)return <p className="op-empty">Add your boats under Boats first, then accept tickets onto them.</p>;
 if(!tickets.length)return <p className="op-empty">No new tickets. New bookings appear here automatically.</p>;
 return <section className="op-list">{tickets.map(t=>{const key=t.bookingId+':'+t.index;return <article key={key} className="op-card op-new">
  <header><div><small>{t.bookingId} · {t.source}</small><h3>{niceDate(t.date)} · {t.depart} {t.from} → {t.to}</h3></div><span className="op-pill is-new">New</span></header>
  <p><strong>{t.name}</strong> · {party(t)}{t.roomBilled?' · charged to Nirili Villa room':' · '+mvr(t.fareMvr)+' to collect'}</p>
  {t.pickup&&<p className="op-muted">Pickup: {t.pickup}</p>}
  {t.notes&&<p className="op-note">{t.notes}</p>}
  <div className="op-actions">
   <BoatPicker boats={boats} value={pick[key]||''} onChange={v=>setPick(p=>({...p,[key]:v}))} need={t.pax}/>
   <button className="op-primary" disabled={busy||!pick[key]} onClick={()=>void act({action:'accept',bookingId:t.bookingId,index:t.index,boatId:pick[key]},'Ticket '+t.bookingId+' accepted. The guest details are now on your boarding list.')}>Accept</button>
   <button className="op-danger" disabled={busy} onClick={()=>{const reason=window.prompt('Why can’t you take this ticket? The guest and Nirili will see this.');if(reason)void act({action:'decline',bookingId:t.bookingId,index:t.index,reason},'Ticket declined. Nirili will help the guest rebook.');}}><XCircle/>Decline</button>
  </div>
 </article>;})}</section>;
}

function Boarding({data,date,setDate,busy,act}:{data:any;date:string;setDate:(d:string)=>void;busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const day:Departure[]=data.day||[],boats:Boat[]=data.boats||[];
 const [pick,setPick]=useState<Record<string,string>>({});
 return <section className="op-list">
  <div className="op-toolbar"><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span className="op-muted">{date===data.today?'Today':niceDate(date)}</span></div>
  {!day.length&&<p className="op-empty">No departures on this day.</p>}
  {day.map(d=>{
   const groups=new Map<string,Ticket[]>();
   for(const t of d.tickets.filter(t=>t.status!=='Declined')){const k=t.status==='Accepted'?t.boatId:'';groups.set(k,[...(groups.get(k)||[]),t]);}
   return <article key={d.scheduleId} className="op-departure">
    <header><div><h3>{d.depart} · {d.from} → {d.to}</h3><small>Arrives {d.arrive} · {d.sold}/{d.seats||'–'} sold · {d.boarded} on board</small></div></header>
    {!d.tickets.length&&<p className="op-muted">No tickets yet.</p>}
    {[...groups.entries()].map(([boatId,tickets])=>{
     const boat=boats.find(b=>b.id===boatId),open=tickets.filter(t=>!t.departed),onBoard=tickets.reduce((n,t)=>n+t.boardedPax,0),total=tickets.reduce((n,t)=>n+t.pax,0);
     return <div key={boatId||'new'} className="op-boat">
      <h4>{boatId?<><Ship/>{boat?.name||tickets[0].boatName} · {onBoard}/{total} on board{boat?' · '+boat.capacity+' seats':''}</>:<><Inbox/>Waiting for you to accept</>}</h4>
      <ul>{tickets.map(t=>{const key=t.bookingId+':'+t.index;return <li key={key} className={t.departed?(t.noShow?'is-noshow':'is-gone'):t.boardedPax===t.pax?'is-in':''}>
       <div><strong>{t.name}</strong><small>{t.bookingId} · {party(t)} · {t.source}{t.roomBilled?' · room bill':' · collect '+mvr(t.fareMvr)}</small>{t.notes&&<small className="op-note">{t.notes}</small>}</div>
       {t.status==='New'?<div className="op-actions"><BoatPicker boats={boats} value={pick[key]||''} onChange={v=>setPick(p=>({...p,[key]:v}))} need={t.pax}/><button className="op-primary" disabled={busy||!pick[key]} onClick={()=>void act({action:'accept',bookingId:t.bookingId,index:t.index,boatId:pick[key]},'Accepted.')}>Accept</button></div>
       :t.departed?<span className="op-pill">{t.noShow?'No-show':'Departed · '+t.boardedPax+'/'+t.pax}</span>
       :<div className="op-actions">
        {t.phone&&<a className="op-ghost" href={wa(t.phone)} target="_blank" rel="noopener noreferrer" aria-label={'WhatsApp '+t.name}><MessageCircle/></a>}
        <select aria-label={'Passengers of '+t.name+' on board'} value={t.boardedPax} disabled={busy||date>data.today} onChange={e=>void act({action:'board',bookingId:t.bookingId,index:t.index,boarded:Number(e.target.value)})}>
         {Array.from({length:t.pax+1},(_,n)=><option key={n} value={n}>{n} on board</option>)}
        </select>
        <button className={t.boardedPax===t.pax?'op-done':'op-primary'} disabled={busy||date>data.today} onClick={()=>void act({action:'board',bookingId:t.bookingId,index:t.index,boarded:t.boardedPax===t.pax?0:t.pax})}>{t.boardedPax===t.pax?'All on board ✓':'Board all'}</button>
        <select aria-label={'Move '+t.name+' to another boat'} value="" disabled={busy||t.boardedPax>0} onChange={e=>e.target.value&&void act({action:'accept',bookingId:t.bookingId,index:t.index,boatId:e.target.value},'Ticket moved.')}>
         <option value="">Move…</option>{boats.filter(b=>b.active&&b.id!==t.boatId).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
       </div>}
      </li>;})}</ul>
      {boatId&&open.length>0&&date<=data.today&&<button className="op-close" disabled={busy} onClick={()=>{if(window.confirm('Close '+(boat?.name||'this boat')+' for the '+d.depart+' departure? Anyone not on board is marked a no-show.'))void act({action:'close',scheduleId:d.scheduleId,date:d.date,boatId},'Departure closed.');}}><Anchor/>Close departure</button>}
     </div>;
    })}
   </article>;
  })}
 </section>;
}

const emptySailing={id:'',from:'Velana Airport',to:'Dhiffushi',depart:'',arrive:'',capacity:20,fare:'',roomFare:'',days:[] as number[],active:true};
function Departures({sailings,busy,act}:{sailings:Sailing[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState<any>(null);
 const sorted=useMemo(()=>sailings.slice().sort((a,b)=>(a.from+a.depart).localeCompare(b.from+b.depart)),[sailings]);
 async function save(e:React.FormEvent){
  e.preventDefault();
  const sailing={...draft,capacity:Number(draft.capacity),fare:Math.round(Number(draft.fare)*100),roomFare:draft.roomFare===''?'':Math.round(Number(draft.roomFare)*100)};
  if(await act({action:'save-sailing',sailing},'Departure saved. Guests can book it now.'))setDraft(null);
 }
 if(draft)return <form className="op-form" onSubmit={save}>
  <h3>{draft.id?'Edit departure':'New departure'}</h3>
  <div className="op-grid">
   <label>From<input list="op-places" required maxLength={60} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
   <label>To<input list="op-places" required maxLength={60} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
   <label>Departs<TimeField24 required value={draft.depart} onChange={e=>setDraft({...draft,depart:e.target.value})} aria-label="Departure time"/></label>
   <label>Arrives<TimeField24 required value={draft.arrive} onChange={e=>setDraft({...draft,arrive:e.target.value})} aria-label="Arrival time"/></label>
   <label>Seats you sell<input required type="number" min={1} max={100} value={draft.capacity} onChange={e=>setDraft({...draft,capacity:e.target.value})}/></label>
   <label>Adult fare (MVR)<input required type="number" min={0} step="0.01" value={draft.fare} onChange={e=>setDraft({...draft,fare:e.target.value})}/></label>
   <label>Fare for Nirili Villa guests (USD, optional)<input type="number" min={0} step="0.01" value={draft.roomFare} onChange={e=>setDraft({...draft,roomFare:e.target.value})} placeholder="Leave empty if not offered"/></label>
  </div>
  <datalist id="op-places">{PLACES.map(p=><option key={p} value={p}/>)}</datalist>
  <fieldset className="op-days"><legend>Runs on (none ticked = every day)</legend>{DAYS.map((d,i)=><label key={d}><input type="checkbox" checked={draft.days.includes(i)} onChange={e=>setDraft({...draft,days:e.target.checked?[...draft.days,i]:draft.days.filter((x:number)=>x!==i)})}/>{d}</label>)}</fieldset>
  <label className="op-check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>On sale</label>
  <p className="op-muted">Children pay half the adult fare; infants travel free. Guests pay you when they board; Nirili invoices its commission monthly.</p>
  <div className="op-actions"><button className="op-primary" disabled={busy}>Save departure</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
 </form>;
 return <section className="op-list">
  <button className="op-add" onClick={()=>setDraft({...emptySailing})}><Plus/>New departure</button>
  {!sorted.length&&<p className="op-empty">Publish your first departure so guests can book seats.</p>}
  {sorted.map(s=><article key={s.id} className={'op-card'+(s.active?'':' is-off')}>
   <header><div><small>{s.days?.length?s.days.map(d=>DAYS[d]).join(' · '):'Every day'}</small><h3>{s.depart} {s.from} → {s.to}</h3></div><span className={'op-pill'+(s.active?' is-ok':'')}>{s.active?'On sale':'Off sale'}</span></header>
   <p>Arrives {s.arrive} · {s.capacity} seats · {mvr(s.fare)} adult{Number.isInteger(s.roomFare)?' · Villa guests '+usd(s.roomFare!):''}</p>
   <div className="op-actions"><button onClick={()=>setDraft({...s,fare:(s.fare/100).toFixed(2),roomFare:Number.isInteger(s.roomFare)?(s.roomFare!/100).toFixed(2):'',days:s.days||[]})}>Edit</button>
    <button disabled={busy} onClick={()=>void act({action:'save-sailing',sailing:{...s,active:!s.active}},s.active?'Taken off sale.':'Back on sale.')}>{s.active?'Take off sale':'Put on sale'}</button></div>
  </article>)}
 </section>;
}

function Boats({boats,busy,act}:{boats:Boat[];busy:boolean;act:(b:any,done?:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState<any>(null);
 async function save(e:React.FormEvent){e.preventDefault();if(await act({action:'save-boat',boat:{...draft,capacity:Number(draft.capacity)}},'Boat saved.'))setDraft(null);}
 if(draft)return <form className="op-form" onSubmit={save}>
  <h3>{draft.id?'Edit boat':'Add a boat'}</h3>
  <div className="op-grid">
   <label>Boat name<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Registration number<input maxLength={40} value={draft.registration} onChange={e=>setDraft({...draft,registration:e.target.value})}/></label>
   <label>Passenger seats<input required type="number" min={1} max={100} value={draft.capacity} onChange={e=>setDraft({...draft,capacity:e.target.value})}/></label>
  </div>
  <label className="op-check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>In service</label>
  <div className="op-actions"><button className="op-primary" disabled={busy}>Save boat</button><button type="button" onClick={()=>setDraft(null)}>Cancel</button></div>
 </form>;
 return <section className="op-list">
  <button className="op-add" onClick={()=>setDraft({id:'',name:'',registration:'',capacity:20,active:true})}><Plus/>Add a boat</button>
  {!boats.length&&<p className="op-empty">Add the boats you use. You choose a boat for every ticket you accept.</p>}
  {boats.map(b=><article key={b.id} className={'op-card'+(b.active?'':' is-off')}>
   <header><div><small>{b.registration||'No registration recorded'}</small><h3>{b.name}</h3></div><span className={'op-pill'+(b.active?' is-ok':'')}>{b.active?'In service':'Out of service'}</span></header>
   <p>{b.capacity} passenger seats</p>
   <div className="op-actions"><button onClick={()=>setDraft({...b})}>Edit</button></div>
  </article>)}
 </section>;
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
