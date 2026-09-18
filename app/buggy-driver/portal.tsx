'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {BellRing,CheckCircle2,Clock3,MapPin,Phone,RefreshCw,Users} from 'lucide-react';
import {startLiveRefresh} from '../../lib/live-refresh';
import DateFieldDMY from '../date-field-dmy';
import SessionButton from '../session-button';
import './style.css';

function maldivesToday(){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const g=(t:string)=>p.find(x=>x.type===t)?.value||'';
 return `${g('year')}-${g('month')}-${g('day')}`;
}
const shift=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const displayDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):value;

export default function BuggyDriverPortal(){
 const [date,setDate]=useState(maldivesToday()),[pickups,setPickups]=useState<any[]>([]),[driver,setDriver]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const request=useRef<AbortController|null>(null);

 const load=useCallback(async(selected=date,background=false)=>{
  if(background&&request.current)return;
  request.current?.abort();
  const controller=new AbortController();request.current=controller;
  if(!background)setLoading(true);
  try{
   const r=await fetch('/api/buggy-driver?date='+encodeURIComponent(selected),{cache:'no-store',signal:controller.signal}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load pickups.');
   setPickups(d.pickups||[]);setDriver(d.driver||'Buggy Driver');setError('');
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load pickups.');}
  finally{if(request.current===controller){request.current=null;setLoading(false);}}
 },[date]);

 useEffect(()=>{void load(date);const stop=startLiveRefresh(()=>load(date,true));window.addEventListener('focus',()=>load(date,true));return()=>{stop();request.current?.abort();}},[date,load]);

 async function update(id:string,action:'arrived'|'boarded'){
  if(busy)return;setBusy(id+action);setError('');
  try{
   const r=await fetch('/api/buggy-driver',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not update pickup.');
   setPickups(list=>list.map(item=>item.id===id?d.pickup:item));
   window.dispatchEvent(new Event('services-updated'));
  }catch(e){setError(e instanceof Error?e.message:'Could not update pickup.');}
  finally{setBusy('');}
 }

 const pending=pickups.filter(p=>p.status==='Pending pickup').length,arrived=pickups.filter(p=>p.status==='Arrived').length,boarded=pickups.filter(p=>p.status==='Boarded').length;

 return <main className="buggy-driver">
  <header className="buggy-driver-header"><div><small>NIRILI TOURS · DHIFFUSHI</small><h1>Buggy Driver</h1><p>{driver} · Guest pickup list</p></div><SessionButton signedIn inline/></header>

  <section className="buggy-driver-datebar">
   <button type="button" onClick={()=>setDate(shift(date,-1))}>← Previous</button>
   <label>Pickup date<DateFieldDMY value={date} onChange={setDate} ariaLabel="Buggy pickup date"/></label>
   <button type="button" onClick={()=>setDate(shift(date,1))}>Next →</button>
   <button type="button" className="buggy-refresh" disabled={loading} onClick={()=>load(date)}><RefreshCw size={17}/>{loading?'Loading…':'Refresh'}</button>
  </section>

  <section className="buggy-driver-stats">
   <article><strong>{pickups.length}</strong><span>Total pickups</span></article>
   <article><strong>{pending}</strong><span>Waiting</span></article>
   <article><strong>{arrived}</strong><span>Driver arrived</span></article>
   <article><strong>{boarded}</strong><span>On buggy</span></article>
  </section>

  {error&&<p className="buggy-error" role="alert">{error}</p>}

  <section className="buggy-pickup-panel">
   <div className="buggy-panel-title"><div><small>{displayDate(date)}</small><h2>Guest pickups</h2></div><span>{pickups.length} pickup{pickups.length===1?'':'s'}</span></div>
   {loading&&!pickups.length?<div className="buggy-empty">Loading pickups…</div>:!pickups.length?<div className="buggy-empty"><strong>No buggy pickups for this date.</strong><span>Confirmed excursion guests who need buggy transport will appear here.</span></div>:<div className="buggy-pickup-list">{pickups.map(p=><article key={p.id} className={'buggy-pickup-card '+p.status.toLowerCase().replace(/\s+/g,'-')}>
    <div className="buggy-time"><small>PICKUP</small><strong>{p.pickupTime||'—'}</strong><span><Clock3 size={14}/>{p.excursionTime} excursion</span></div>
    <div className="buggy-guest">
     <div className="buggy-name-row"><h3>{p.guest}</h3><span className={'buggy-status '+p.status.toLowerCase().replace(/\s+/g,'-')}>{p.status}</span></div>
     <p className="buggy-excursion">{p.excursion}</p>
     <div className="buggy-meta"><span><MapPin size={16}/><b>{p.location}</b>{p.room?' · Room '+p.room:''}</span><span><Users size={16}/>{p.quantity} guest{p.quantity===1?'':'s'}</span>{p.phone&&<a href={'tel:'+p.phone}><Phone size={16}/>{p.phone}</a>}</div>
     {p.notes&&<p className="buggy-notes">{p.notes}</p>}
    </div>
    <div className="buggy-actions">
     {p.status==='Pending pickup'&&<button type="button" className="arrived" disabled={busy===p.id+'arrived'} onClick={()=>update(p.id,'arrived')}><BellRing size={18}/>{busy===p.id+'arrived'?'Notifying…':'I arrived · Notify guest'}</button>}
     {p.status==='Arrived'&&<><div className="buggy-arrived-note"><BellRing size={17}/>Guest notified that the buggy has arrived.</div><button type="button" className="boarded" disabled={busy===p.id+'boarded'} onClick={()=>update(p.id,'boarded')}><CheckCircle2 size={18}/>{busy===p.id+'boarded'?'Saving…':'Guests on buggy'}</button></>}
     {p.status==='Boarded'&&<div className="buggy-boarded"><CheckCircle2 size={20}/><strong>Pickup complete</strong><span>Guests are on the buggy.</span></div>}
    </div>
   </article>)}</div>}
  </section>
 </main>;
}
