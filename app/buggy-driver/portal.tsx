'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {BellRing,CheckCircle2,Clock3,MapPin,Phone,Trash2,Users} from 'lucide-react';
import {startLiveRefresh,REFRESH_INTERVALS} from '../../lib/live-refresh';
import {buggyDriverWhatsAppUrl,type BuggyWhatsAppEvent} from '../../lib/buggy-whatsapp';
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

function WhatsAppLogo({size=18}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.52 3.48A11.91 11.91 0 0 0 12.05 0C5.46 0 .1 5.36.1 11.95c0 2.11.55 4.17 1.6 5.99L0 24l6.24-1.64a11.94 11.94 0 0 0 5.81 1.48h.01c6.58 0 11.94-5.36 11.94-11.95 0-3.19-1.24-6.19-3.48-8.41ZM12.05 21.82a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.7.97.99-3.61-.24-.37a9.87 9.87 0 0 1-1.51-5.27c0-5.48 4.46-9.94 9.95-9.94a9.88 9.88 0 0 1 7.03 2.92 9.88 9.88 0 0 1 2.91 7.04c0 5.48-4.46 9.94-9.94 9.94Zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.77-1.65-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.35.19 1.86.11.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg>;
}

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

 useEffect(()=>{void load(date);const stop=startLiveRefresh(()=>load(date,true),REFRESH_INTERVALS.live);return()=>{stop();request.current?.abort();}},[date,load]);

 function openWhatsApp(pickup:any,event:BuggyWhatsAppEvent='general'){
  const url=buggyDriverWhatsAppUrl(pickup,event,driver);
  if(!url){setError('This guest does not have a valid WhatsApp number saved.');return;}
  window.open(url,'_blank','noopener,noreferrer');
 }

 async function update(id:string,action:'on-the-way'|'arrived'|'boarded'|'complete'|'cancel'|'dinner-dropoff'|'return-arrived'|'return-boarded'|'return-complete',whatsAppEvent?:BuggyWhatsAppEvent){
  if(busy)return;
  const current=pickups.find(item=>item.id===id);
  let whatsappWindow:Window|null=null;
  if(whatsAppEvent&&current?.phone){
   whatsappWindow=window.open('about:blank','_blank');
   if(whatsappWindow)try{whatsappWindow.document.title='Opening WhatsApp…';}catch{}
  }
  setBusy(id+action);setError('');
  try{
   const r=await fetch('/api/buggy-driver',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not update pickup.');
   const nextPickup=d.pickup||current;
   setPickups(list=>action==='cancel'?list.filter(item=>item.id!==id):list.map(item=>item.id===id?nextPickup:item));
   window.dispatchEvent(new Event('services-updated'));
   if(whatsAppEvent){
    const url=buggyDriverWhatsAppUrl(nextPickup,whatsAppEvent,driver);
    if(!url){whatsappWindow?.close();setError('Ride updated, but this guest does not have a valid WhatsApp number saved.');}
    else if(whatsappWindow){try{whatsappWindow.opener=null;whatsappWindow.location.href=url;}catch{window.open(url,'_blank','noopener,noreferrer');}}
    else window.open(url,'_blank','noopener,noreferrer');
   }
  }catch(e){whatsappWindow?.close();setError(e instanceof Error?e.message:'Could not update pickup.');}
  finally{setBusy('');}
 }

 const pending=pickups.filter(p=>['Requested','Assigned','Driver on the way','Pending pickup','Waiting for dinner to finish'].includes(p.status)).length,arrived=pickups.filter(p=>['Arrived','Return pickup arrived'].includes(p.status)).length,boarded=pickups.filter(p=>['Boarded','On trip','Going to dinner','Returning','Round trip complete','Completed'].includes(p.status)).length;

 return <main className="buggy-driver">
  <header className="buggy-driver-header"><div><small>NIRILI TOURS · DHIFFUSHI</small><h1>Buggy Driver</h1><p>{driver} · Guest pickup list</p></div><SessionButton signedIn inline/></header>

  <section className="buggy-driver-datebar">
   <button type="button" onClick={()=>setDate(shift(date,-1))}>← Previous</button>
   <label>Pickup date<DateFieldDMY value={date} onChange={setDate} ariaLabel="Buggy pickup date"/></label>
   <button type="button" onClick={()=>setDate(shift(date,1))}>Next →</button>
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
    <div className="buggy-time"><small>{p.guestRide?'GUEST RIDE':p.roundTrip?'DINNER TRANSFER':'PICKUP'}</small><strong>{p.pickupTime||'Arrange'}</strong><span><Clock3 size={14}/>{p.guestRide?'Requested now':p.romanticDinner?(p.pickupTimingNote||'Pickup time arranged'):p.excursionTime+' excursion'}</span></div>
    <div className="buggy-guest">
     <div className="buggy-name-row"><h3>{p.guest}</h3><span className={'buggy-status '+p.status.toLowerCase().replace(/\s+/g,'-')}>{p.status}</span></div>
     <p className="buggy-excursion">{p.excursion}{p.roundTrip&&<span className="buggy-roundtrip-badge">Round trip</span>}{p.guestRide&&p.chargeToRoom&&<span className="buggy-roundtrip-badge">{p.fareCents>0?'Room bill USD '+(p.fareCents/100).toFixed(2):'No configured fare'}</span>}</p>
     <div className="buggy-meta"><span><MapPin size={16}/><b>Pickup: {p.location}</b>{p.room?' · Room '+p.room:''}</span>{p.destination&&<span><MapPin size={16}/>Destination: {p.destination}</span>}<span><Users size={16}/>{p.quantity} guest{p.quantity===1?'':'s'}</span>{p.buggyName&&<span>Buggy: {p.buggyName}</span>}{p.driver&&<span>Driver: {p.driver}</span>}{p.phone&&<><a href={'tel:'+p.phone}><Phone size={16}/>{p.phone}</a><button type="button" className="buggy-whatsapp-inline" onClick={()=>openWhatsApp(p)}><WhatsAppLogo size={16}/>WhatsApp</button></>}</div>
     {p.notes&&<p className="buggy-notes">{p.notes}</p>}
    </div>
    <div className="buggy-actions">
     {p.phone&&<button type="button" className="whatsapp" onClick={()=>openWhatsApp(p)}><WhatsAppLogo/>WhatsApp guest</button>}
     {p.status==='Requested'&&p.guestRide&&<div className="buggy-arrived-note"><Clock3 size={17}/>Waiting for dispatch to assign a buggy.</div>}
     {p.status==='Assigned'&&(p.guestRide||p.transportRide)&&<><button type="button" className="arrived" disabled={busy===p.id+'on-the-way'} onClick={()=>update(p.id,'on-the-way','on-the-way')}><Clock3 size={18}/>{busy===p.id+'on-the-way'?'Starting…':p.phone?'Start pickup · WhatsApp on the way':'Start pickup · Driver on the way'}</button>{p.manual&&<button type="button" className="cancel-manual" disabled={busy===p.id+'cancel'} onClick={()=>{if(confirm('Cancel this buggy booking?'))void update(p.id,'cancel')}}><Trash2 size={18}/>{busy===p.id+'cancel'?'Cancelling…':'Cancel'}</button>}</>}
     {['Pending pickup','Driver on the way'].includes(p.status)&&<><button type="button" className="arrived" disabled={busy===p.id+'arrived'} onClick={()=>update(p.id,'arrived','arrived')}><BellRing size={18}/>{busy===p.id+'arrived'?'Notifying…':p.phone?'I arrived · WhatsApp guest':'I arrived · Notify guest'}</button>{p.manual&&<button type="button" className="cancel-manual" disabled={busy===p.id+'cancel'} onClick={()=>{if(confirm('Cancel this buggy booking?'))void update(p.id,'cancel')}}><Trash2 size={18}/>{busy===p.id+'cancel'?'Cancelling…':'Cancel'}</button>}</>}
     {p.status==='Arrived'&&<><div className="buggy-arrived-note"><BellRing size={17}/>Guest notified that the buggy has arrived.</div><button type="button" className="boarded" disabled={busy===p.id+'boarded'} onClick={()=>update(p.id,'boarded')}><CheckCircle2 size={18}/>{busy===p.id+'boarded'?'Saving…':p.roundTrip?'Guests on buggy · To dinner':'Guests on buggy'}</button></>}
     {!p.guestRide&&!p.roundTrip&&p.status==='Boarded'&&<div className="buggy-boarded"><CheckCircle2 size={20}/><strong>Pickup complete</strong><span>Guests are on the buggy.</span></div>}
     {(p.guestRide||p.transportRide)&&p.status==='On trip'&&<button type="button" className="boarded" disabled={busy===p.id+'complete'} onClick={()=>update(p.id,'complete')}><CheckCircle2 size={18}/>{busy===p.id+'complete'?'Completing…':'Complete ride · Guest dropped off'}</button>}
     {(p.guestRide||p.transportRide)&&p.status==='Completed'&&<div className="buggy-boarded"><CheckCircle2 size={20}/><strong>Ride completed</strong><span>Guest dropped off. Buggy returned to available status.</span></div>}
     {p.roundTrip&&p.status==='Going to dinner'&&<button type="button" className="boarded" disabled={busy===p.id+'dinner-dropoff'} onClick={()=>update(p.id,'dinner-dropoff')}><MapPin size={18}/>{busy===p.id+'dinner-dropoff'?'Saving…':'Dropped guests at dinner'}</button>}
     {p.roundTrip&&p.status==='Waiting for dinner to finish'&&<><div className="buggy-arrived-note"><Clock3 size={17}/>Return pickup is required after dinner.</div><button type="button" className="arrived" disabled={busy===p.id+'return-arrived'} onClick={()=>update(p.id,'return-arrived','return-arrived')}><BellRing size={18}/>{busy===p.id+'return-arrived'?'Notifying…':p.phone?'I arrived for return · WhatsApp guest':'I arrived for return · Notify guest'}</button></>}
     {p.roundTrip&&p.status==='Return pickup arrived'&&<><div className="buggy-arrived-note"><BellRing size={17}/>Guest notified for the return pickup.</div><button type="button" className="boarded" disabled={busy===p.id+'return-boarded'} onClick={()=>update(p.id,'return-boarded')}><CheckCircle2 size={18}/>{busy===p.id+'return-boarded'?'Saving…':'Guests on buggy · Returning'}</button></>}
     {p.roundTrip&&p.status==='Returning'&&<button type="button" className="boarded" disabled={busy===p.id+'return-complete'} onClick={()=>update(p.id,'return-complete')}><CheckCircle2 size={18}/>{busy===p.id+'return-complete'?'Saving…':'Returned guests to hotel'}</button>}
     {p.roundTrip&&p.status==='Round trip complete'&&<div className="buggy-boarded"><CheckCircle2 size={20}/><strong>Round trip complete</strong><span>Guests were taken to dinner and returned to their hotel.</span></div>}
    </div>
   </article>)}</div>}
  </section>
 </main>;
}
