"use client";
import {useState} from 'react';
import {CalendarDays,RotateCcw,X} from 'lucide-react';
import {UiField,UiText} from './ui-language';
import {islandToday} from '../lib/guest-catalog';

function addDays(date:string,days:number){
 return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}

export default function BookingClosures(){
 const today=islandToday();
 const [open,setOpen]=useState(false),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [from,setFrom]=useState(today),[through,setThrough]=useState(today),[reason,setReason]=useState(''),[allRooms,setAllRooms]=useState(true),[rooms,setRooms]=useState<string[]>([]);

 async function refresh(){
  const response=await fetch('/api/stays',{cache:'no-store'});
  const next=await response.json();
  if(!response.ok)throw Error(next.error||'Could not load closed dates.');
  setData(next);
  return next;
 }

 async function show(){
  setOpen(true);setError('');
  try{await refresh()}catch(e){setError((e as Error).message)}
 }

 async function mutate(payload:any){
  if(!data)throw Error('Refresh the booking calendar and try again.');
  const response=await fetch('/api/stays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,revision:data.revision})});
  const next=await response.json();
  if(!response.ok){
   if(response.status===409)try{await refresh()}catch{}
   throw Error(next.error||'Could not update closed dates.');
  }
  setData(next);
  window.dispatchEvent(new Event('services-updated'));
  return next;
 }

 async function closeDates(event:React.FormEvent){
  event.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   await mutate({action:'close-booking-dates',from,through,reason,rooms:allRooms?[]:rooms});
   setReason('');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 async function reopen(id:string){
  if(busy)return;
  setBusy(true);setError('');
  try{await mutate({action:'reopen-booking-dates',id})}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 const closures=[...(data?.bookingClosures||[])].sort((a:any,b:any)=>String(a.start).localeCompare(String(b.start)));

 return <>
  <button type="button" className="booking-close-trigger" onClick={()=>void show()}><CalendarDays/><UiText>Close dates</UiText></button>
  {open&&<div className="backdrop" style={{zIndex:10002}}>
   <form className="modal booking-close-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-close-title" onSubmit={closeDates}>
    <header><div><small><UiText>ROOM INVENTORY</UiText></small><h2 id="booking-close-title"><UiText>Close booking dates</UiText></h2></div><UiField as="button" type="button" disabled={busy} onClick={()=>setOpen(false)} aria-label="Close"><X/></UiField></header>
    <div className="booking-close-body">
     <p><UiText>Block new room bookings for selected rooms and dates. Existing reservations are not changed.</UiText></p>
     <section className="booking-close-room-picker">
      <div className="booking-close-room-head"><div><b><UiText>Rooms to close</UiText></b><small><UiText>Choose specific rooms, or close all rooms at once.</UiText></small></div>
       <label className="booking-close-all"><input type="checkbox" checked={allRooms} onChange={e=>{setAllRooms(e.target.checked);if(e.target.checked)setRooms([])}}/><span><UiText>All rooms</UiText></span></label>
      </div>
      {!allRooms&&<div className="booking-close-room-grid">{(data?.rooms||[]).map((room:any)=>{const number=String(room.number||'');const checked=rooms.includes(number);return <label key={number} className={checked?"selected":""}><input type="checkbox" checked={checked} onChange={e=>setRooms(old=>e.target.checked?[...old,number]:old.filter(x=>x!==number))}/><span><b><UiText>Room </UiText>{number}</b><small>{room.type||'Room'}</small></span></label>})}</div>}
     </section>
     <div className="booking-close-fields">
      <label><UiText>From</UiText><input required type="date" min={today} value={from} onChange={e=>{setFrom(e.target.value);if(e.target.value>through)setThrough(e.target.value)}}/></label>
      <label><UiText>Through</UiText><input required type="date" min={from||today} value={through} onChange={e=>setThrough(e.target.value)}/></label>
     </div>
     <label><UiText>Reason (optional)</UiText><input maxLength={200} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Private use, maintenance, group hold…"/></label>
     <button className="primary booking-close-save" disabled={busy||!data||!from||!through||through<from||(!allRooms&&rooms.length===0)}><CalendarDays/><UiText>{busy?'Saving…':allRooms?'Close all rooms':'Close selected rooms'}</UiText></button>
     {error&&<p className="booking-close-error" role="alert"><UiText>{error}</UiText></p>}
     <section className="booking-close-list"><h3><UiText>Currently closed</UiText></h3>
      {!data?<p><UiText>Loading…</UiText></p>:!closures.length?<p><UiText>No booking dates are closed.</UiText></p>:closures.map((closure:any)=><article key={closure.id}>
       <div><b>{closure.start} → {addDays(closure.endExclusive,-1)}</b><small>{Array.isArray(closure.rooms)&&closure.rooms.length?'Rooms '+closure.rooms.join(', '):'All rooms'} · {closure.reason||'No reason added'} · {closure.createdBy||'Admin'}</small></div>
       <button type="button" disabled={busy} onClick={()=>void reopen(closure.id)}><RotateCcw/><UiText>Reopen</UiText></button>
      </article>)}
     </section>
    </div>
    <footer><button type="button" disabled={busy} onClick={()=>setOpen(false)}><UiText>Done</UiText></button></footer>
   </form>
  </div>}
 </>;
}
