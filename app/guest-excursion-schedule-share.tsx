'use client';

import {useEffect,useId,useRef,useState} from 'react';
import './excursion-share-timetable.css';

type GuestTrip={
 id:string; excursion:string; date:string; time:string; endTime:string; returnTime:string;
 guests:number; vessel:string; crew:string[]; tripStatus:string;
};

const dateLabel=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)
 ?new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
 :value;

export default function GuestExcursionScheduleShare({stayId,guest,room,disabled=false}:{stayId:string;guest:string;room:string;disabled?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),messageBox=useRef<HTMLTextAreaElement>(null);
 const titleId=useId();
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [trips,setTrips]=useState<GuestTrip[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[manualCopy,setManualCopy]=useState(false);

 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();
  setLoading(true);setError('');setNotice('');setTrips([]);setManualCopy(false);
  (async()=>{
   try{
    const response=await fetch('/api/excursion-bookings?stayId='+encodeURIComponent(stayId),{cache:'no-store',signal:controller.signal});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not load this guest excursion schedule.');
    const next=(result.bookings||[])
     .filter((item:any)=>!['Cancelled'].includes(String(item.tripStatus||'')))
     .map((item:any)=>({
      id:String(item.id||''),excursion:String(item.excursion||'Excursion'),date:String(item.date||''),
      time:String(item.time||''),endTime:String(item.endTime||''),returnTime:String(item.returnTime||''),
      guests:Number(item.guests)||0,vessel:String(item.vessel||'Not assigned'),
      crew:Array.isArray(item.crew)?item.crew.map(String):[],tripStatus:String(item.tripStatus||'Scheduled')
     }))
     .sort((a:GuestTrip,b:GuestTrip)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.excursion.localeCompare(b.excursion));
    if(!controller.signal.aborted)setTrips(next);
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load schedule.')}
   finally{if(!controller.signal.aborted)setLoading(false)}
  })();
  return()=>controller.abort();
 },[open,stayId,revision]);

 useEffect(()=>{if(manualCopy){messageBox.current?.focus();messageBox.current?.select()}},[manualCopy]);

 const text=[
  'NIRILI VILLA · GUEST EXCURSION SCHEDULE',
  'Guest: '+guest+(room?' · Room '+room:''),
  'Maldives time (UTC+5)',
  '',
  ...trips.flatMap((trip,index)=>[
   (index+1)+'. '+trip.excursion,
   'Date: '+dateLabel(trip.date),
   'Time: '+(trip.time||'To be confirmed')+(trip.endTime?' – '+trip.endTime:'')+(trip.returnTime?' · Return '+trip.returnTime:''),
   'Guests: '+trip.guests,
   'Vessel: '+trip.vessel,
   'Crew: '+(trip.crew.join(', ')||'Not assigned'),
   'Status: '+trip.tripStatus,
   ''
  ]),
  'Nirili Villa · Dhiffushi, Maldives',
  'Arrive as a Guest, Leave as a Friend.'
 ].join('\n');

 const ready=trips.length>0&&!loading&&!busy;
 function show(){setOpen(true);dialog.current?.showModal()}
 function close(){dialog.current?.close();setOpen(false)}
 async function copy(){
  if(!ready)return;setBusy(true);setNotice('');
  try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);setNotice('Guest schedule copied.')}
  catch{setManualCopy(true);setNotice('Select and copy the schedule below.')}
  finally{setBusy(false)}
 }
 async function share(){
  if(!ready)return;setNotice('');
  if(!navigator.share){setNotice('Use WhatsApp or Copy schedule from this browser.');return}
  setBusy(true);
  try{await navigator.share({title:'Nirili Villa excursion schedule · '+guest,text});setNotice('Schedule handed to your selected sharing app.')}
  catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setNotice('Sharing could not open. Use WhatsApp or Copy schedule.')}
  finally{setBusy(false)}
 }

 return <>
  <button type="button" className="excursion-secondary-btn excursion-share-trigger guest-schedule-share-button" disabled={disabled} onClick={show}>Share Guest Schedule</button>
  <dialog ref={dialog} className="excursion-share-dialog" aria-labelledby={titleId} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
   <header className="excursion-share-heading"><div><small>NIRILI VILLA · EXCURSIONS</small><h3 id={titleId}>Guest excursion schedule</h3><p>{guest}{room?' · Room '+room:''} · Maldives time (UTC+5)</p></div><button type="button" className="excursion-share-close" onClick={close} aria-label="Close guest schedule">×</button></header>
   <div className="excursion-share-body" aria-busy={loading}>
    <p className="excursion-share-info">Only this guest's confirmed excursion schedule is included. Other guests, payment details and unrelated trips are excluded.</p>
    {loading&&<p role="status">Loading this guest's latest excursion schedule…</p>}
    {error&&<p className="excursion-share-error" role="alert">{error}</p>}
    {!loading&&!error&&<>
     <div className="excursion-share-summary"><strong>{trips.length} excursion{trips.length===1?'':'s'}</strong><strong>{guest}{room?' · Room '+room:''}</strong></div>
     {!trips.length?<p>No confirmed excursion schedule is available for this guest.</p>:<div className="excursion-share-table-wrap"><table className="excursion-share-table"><thead><tr><th>Date / time</th><th>Excursion</th><th>Guests</th><th>Vessel</th><th>Crew</th></tr></thead><tbody>
      {trips.map(trip=><tr key={trip.id}><td data-label="Date / time"><strong>{dateLabel(trip.date)}</strong><small>{trip.time||'Time pending'}{trip.endTime?' – '+trip.endTime:''}{trip.returnTime?' · Return '+trip.returnTime:''}</small></td><td data-label="Excursion"><strong>{trip.excursion}</strong><small>{trip.tripStatus}</small></td><td data-label="Guests"><strong>{trip.guests}</strong></td><td data-label="Vessel">{trip.vessel}</td><td data-label="Crew">{trip.crew.join(', ')||'Not assigned'}</td></tr>)}
     </tbody></table></div>}
     {trips.length>0&&<details open={manualCopy||undefined} className="excursion-share-message"><summary>View message / copy manually</summary><textarea ref={messageBox} readOnly value={text} aria-label="Guest excursion schedule message" rows={12}/></details>}
    </>}
    {notice&&<p role="status" className="excursion-share-notice">{notice}</p>}
   </div>
   <footer className="excursion-share-footer">
    <button type="button" disabled={loading||busy} onClick={()=>setRevision(v=>v+1)}>Refresh</button>
    <button type="button" disabled={!ready} onClick={copy}>Copy schedule</button>
    {ready&&<a href={'https://wa.me/?text='+encodeURIComponent(text)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
    <button type="button" className="excursion-share-primary" disabled={!ready} onClick={share}>{busy?'Please wait…':'Share schedule'}</button>
   </footer>
  </dialog>
 </>;
}
