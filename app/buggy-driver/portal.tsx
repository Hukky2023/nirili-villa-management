'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {BellRing,CheckCircle2,Clock3,MapPin,Phone,Plus,Users} from 'lucide-react';
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
 const [booking,setBooking]=useState<any>(null);
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

 async function createBuggyBooking(e:React.FormEvent){
  e.preventDefault();if(!booking||busy)return;setBusy('new');setError('');
  try{
   const r=await fetch('/api/buggy-driver',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(booking)}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not book buggy.');
   setBooking(null);
   const created=d.pickup;
   if(created?.date===date){
    setPickups(list=>[...list.filter(item=>item.id!==created.id),created].sort((a:any,b:any)=>(a.pickupTime||a.excursionTime).localeCompare(b.pickupTime||b.excursionTime)||a.guest.localeCompare(b.guest)));
   }else if(created?.date){
    setDate(created.date);
   }else{
    await load(date);
   }
   window.dispatchEvent(new Event('services-updated'));
  }catch(e){setError(e instanceof Error?e.message:'Could not book buggy.');}
  finally{setBusy('');}
 }

 async function update(id:string,action:'arrived'|'boarded'|'dinner-dropoff'|'return-arrived'|'return-boarded'|'return-complete'){
  if(busy)return;setBusy(id+action);setError('');
  try{
   const r=await fetch('/api/buggy-driver',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not update pickup.');
   setPickups(list=>list.map(item=>item.id===id?d.pickup:item));
   window.dispatchEvent(new Event('services-updated'));
  }catch(e){setError(e instanceof Error?e.message:'Could not update pickup.');}
  finally{setBusy('');}
 }

 const pending=pickups.filter(p=>['Pending pickup','Waiting for dinner to finish'].includes(p.status)).length,arrived=pickups.filter(p=>['Arrived','Return pickup arrived'].includes(p.status)).length,boarded=pickups.filter(p=>['Boarded','Going to dinner','Returning','Round trip complete'].includes(p.status)).length;

 return <main className="buggy-driver">
  <header className="buggy-driver-header"><div><small>NIRILI TOURS · DHIFFUSHI</small><h1>Buggy Driver</h1><p>{driver} · Guest pickup list</p></div><SessionButton signedIn inline/></header>

  <section className="buggy-driver-datebar">
   <button type="button" onClick={()=>setDate(shift(date,-1))}>← Previous</button>
   <label>Pickup date<DateFieldDMY value={date} onChange={setDate} ariaLabel="Buggy pickup date"/></label>
   <button type="button" onClick={()=>setDate(shift(date,1))}>Next →</button>
   <button type="button" className="buggy-refresh" onClick={()=>setBooking({guest:'',phone:'',date,pickupTime:'',location:'',destination:'',quantity:1,notes:''})}><Plus size={17}/>Book buggy</button>
  </section>

  <section className="buggy-driver-stats">
   <article><strong>{pickups.length}</strong><span>Total pickups</span></article>
   <article><strong>{pending}</strong><span>Waiting</span></article>
   <article><strong>{arrived}</strong><span>Driver arrived</span></article>
   <article><strong>{boarded}</strong><span>On buggy</span></article>
  </section>

  {error&&<p className="buggy-error" role="alert">{error}</p>}

  {booking&&<div className="buggy-booking-overlay" role="presentation"><form className="buggy-booking-dialog" onSubmit={createBuggyBooking}><header><div><small>BUGGY BOOKING</small><h2>Book buggy</h2><p>Add a manual buggy pickup.</p></div><button type="button" onClick={()=>setBooking(null)} aria-label="Close">×</button></header><div className="buggy-booking-grid"><label>Guest name<input required maxLength={100} value={booking.guest} onChange={e=>setBooking({...booking,guest:e.target.value})}/></label><label>Phone number<input type="tel" maxLength={30} value={booking.phone} onChange={e=>setBooking({...booking,phone:e.target.value})}/></label><label>Date<DateFieldDMY required value={booking.date} onChange={value=>setBooking({...booking,date:value})} ariaLabel="Buggy booking date"/></label><label>Pickup time<input required type="time" value={booking.pickupTime} onChange={e=>setBooking({...booking,pickupTime:e.target.value})}/></label><label>Pickup point<input required maxLength={150} value={booking.location} onChange={e=>setBooking({...booking,location:e.target.value})} placeholder="Pickup location"/></label><label>Drop-off point<input required maxLength={150} value={booking.destination} onChange={e=>setBooking({...booking,destination:e.target.value})} placeholder="Drop-off location"/></label><label>Guests<input required type="number" min={1} max={20} value={booking.quantity} onChange={e=>setBooking({...booking,quantity:Number(e.target.value)})}/></label><label className="full">Notes<textarea rows={3} maxLength={500} value={booking.notes} onChange={e=>setBooking({...booking,notes:e.target.value})}/></label></div><footer><button type="button" onClick={()=>setBooking(null)}>Cancel</button><button type="submit" className="boarded" disabled={busy==='new'}>{busy==='new'?'Booking…':'Add buggy booking'}</button></footer></form></div>}

  <section className="buggy-pickup-panel">
   <div className="buggy-panel-title"><div><small>{displayDate(date)}</small><h2>Guest pickups</h2></div><span>{pickups.length} pickup{pickups.length===1?'':'s'}</span></div>
   {loading&&!pickups.length?<div className="buggy-empty">Loading pickups…</div>:!pickups.length?<div className="buggy-empty"><strong>No buggy pickups for this date.</strong><span>Confirmed excursion guests who need buggy transport will appear here.</span></div>:<div className="buggy-pickup-list">{pickups.map(p=><article key={p.id} className={'buggy-pickup-card '+p.status.toLowerCase().replace(/\s+/g,'-')}>
    <div className="buggy-time"><small>{p.roundTrip?'DINNER TRANSFER':'PICKUP'}</small><strong>{p.pickupTime||'Arrange'}</strong><span><Clock3 size={14}/>{p.romanticDinner?(p.pickupTimingNote||'Pickup time arranged'):p.excursionTime+' excursion'}</span></div>
    <div className="buggy-guest">
     <div className="buggy-name-row"><h3>{p.guest}</h3><span className={'buggy-status '+p.status.toLowerCase().replace(/\s+/g,'-')}>{p.status}</span></div>
     <p className="buggy-excursion">{p.excursion}{p.roundTrip&&<span className="buggy-roundtrip-badge">Round trip</span>}</p>
     <div className="buggy-meta"><span><MapPin size={16}/><b>Pickup: {p.location}</b>{p.room?' · Room '+p.room:''}</span>{p.destination&&<span><MapPin size={16}/>Destination: {p.destination}</span>}<span><Users size={16}/>{p.quantity} guest{p.quantity===1?'':'s'}</span>{p.phone&&<a href={'tel:'+p.phone}><Phone size={16}/>{p.phone}</a>}</div>
     {p.notes&&<p className="buggy-notes">{p.notes}</p>}
    </div>
    <div className="buggy-actions">
     {p.status==='Pending pickup'&&<button type="button" className="arrived" disabled={busy===p.id+'arrived'} onClick={()=>update(p.id,'arrived')}><BellRing size={18}/>{busy===p.id+'arrived'?'Notifying…':'I arrived · Notify guest'}</button>}
     {p.status==='Arrived'&&<><div className="buggy-arrived-note"><BellRing size={17}/>Guest notified that the buggy has arrived.</div><button type="button" className="boarded" disabled={busy===p.id+'boarded'} onClick={()=>update(p.id,'boarded')}><CheckCircle2 size={18}/>{busy===p.id+'boarded'?'Saving…':p.roundTrip?'Guests on buggy · To dinner':'Guests on buggy'}</button></>}
     {!p.roundTrip&&p.status==='Boarded'&&<div className="buggy-boarded"><CheckCircle2 size={20}/><strong>Pickup complete</strong><span>Guests are on the buggy.</span></div>}
     {p.roundTrip&&p.status==='Going to dinner'&&<button type="button" className="boarded" disabled={busy===p.id+'dinner-dropoff'} onClick={()=>update(p.id,'dinner-dropoff')}><MapPin size={18}/>{busy===p.id+'dinner-dropoff'?'Saving…':'Dropped guests at dinner'}</button>}
     {p.roundTrip&&p.status==='Waiting for dinner to finish'&&<><div className="buggy-arrived-note"><Clock3 size={17}/>Return pickup is required after dinner.</div><button type="button" className="arrived" disabled={busy===p.id+'return-arrived'} onClick={()=>update(p.id,'return-arrived')}><BellRing size={18}/>{busy===p.id+'return-arrived'?'Notifying…':'I arrived for return · Notify guest'}</button></>}
     {p.roundTrip&&p.status==='Return pickup arrived'&&<><div className="buggy-arrived-note"><BellRing size={17}/>Guest notified for the return pickup.</div><button type="button" className="boarded" disabled={busy===p.id+'return-boarded'} onClick={()=>update(p.id,'return-boarded')}><CheckCircle2 size={18}/>{busy===p.id+'return-boarded'?'Saving…':'Guests on buggy · Returning'}</button></>}
     {p.roundTrip&&p.status==='Returning'&&<button type="button" className="boarded" disabled={busy===p.id+'return-complete'} onClick={()=>update(p.id,'return-complete')}><CheckCircle2 size={18}/>{busy===p.id+'return-complete'?'Saving…':'Returned guests to hotel'}</button>}
     {p.roundTrip&&p.status==='Round trip complete'&&<div className="buggy-boarded"><CheckCircle2 size={20}/><strong>Round trip complete</strong><span>Guests were taken to dinner and returned to their hotel.</span></div>}
    </div>
   </article>)}</div>}
  </section>
 </main>;
}
