'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';

type Crew={id:string;name:string;active?:boolean|number};
type Props={
 crew:Crew;
 allCrew:Crew[];
 canManage:boolean;
 onSave:(update:{name:string;active:boolean})=>Promise<void>;
 onClose:()=>void;
};

const normal=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();

function displayDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):value;}
export default function ExcursionCrewManage({crew,allCrew,canManage,onSave,onClose}:Props){
 const [name,setName]=useState(crew.name||''),[active,setActive]=useState(crew.active!==false&&crew.active!==0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState<any[]>([]),[historyLoading,setHistoryLoading]=useState(true),[historyError,setHistoryError]=useState(''),[historyTotals,setHistoryTotals]=useState({trips:0,completed:0}),[historyPeriod,setHistoryPeriod]=useState<any>(null);
 const lock=useRef(false),dialog=useRef<HTMLFormElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;

 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  function keydown(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();if(!lock.current)closeRef.current();}
   if(event.key!=='Tab')return;
   const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')||[]);
   const first=items[0],last=items[items.length-1];
   if(!first){event.preventDefault();dialog.current?.focus();return;}
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[]);

 useEffect(()=>{
  let cancelled=false;
  async function loadHistory(){
   setHistoryLoading(true);setHistoryError('');
   try{
    const response=await fetch('/api/excursion-crew-history?crewId='+encodeURIComponent(crew.id),{cache:'no-store'});
    const result=await response.json();
    if(cancelled)return;
    if(!response.ok)throw Error(result.error||'Could not load excursion history.');
    setHistory(result.history||[]);setHistoryTotals(result.totals||{trips:0,completed:0});setHistoryPeriod(result.period||null);
   }catch(e){if(!cancelled)setHistoryError(e instanceof Error?e.message:'Could not load excursion history.');}
   finally{if(!cancelled)setHistoryLoading(false);}
  }
  void loadHistory();
  return()=>{cancelled=true;};
 },[crew.id]);

 function close(){if(!lock.current)onClose();}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current)return;
  if(!canManage){setError('Only Admin can manage crew members.');return;}
  const trimmed=name.trim().replace(/\s+/g,' ');
  if(!trimmed||trimmed.length>100){setError('Enter a crew member name of 1–100 characters.');return;}
  if(allCrew.some(member=>member.id!==crew.id&&normal(member.name)===normal(trimmed))){setError('That name is already in the crew list.');return;}
  lock.current=true;setBusy(true);setError('');
  try{await onSave({name:trimmed,active});}
  catch(e){setError(e instanceof Error?e.message:'Could not update crew member. Please try again.');window.dispatchEvent(new Event('services-updated'));}
  finally{lock.current=false;setBusy(false);}
 }

 return <div className="excursion-schedule-overlay" role="presentation" onClick={event=>{if(event.target===event.currentTarget)close();}}>
  <form ref={dialog} className="excursion-schedule-dialog excursion-crew-manage-dialog" role="dialog" aria-modal="true" aria-labelledby="crew-manage-title" tabIndex={-1} onSubmit={submit}>
   <header><div><small>EXCURSION CREW</small><h3 id="crew-manage-title">Manage crew member</h3><p>Update the crew member name and availability for future trip assignments.</p></div><button type="button" className="excursion-dialog-close" disabled={busy} onClick={close} aria-label="Close crew management">×</button></header>
   <div className="excursion-schedule-form-grid">
    <label className="full">Crew member name<input required maxLength={100} autoComplete="off" disabled={busy||!canManage} value={name} onChange={event=>{setName(event.target.value);setError('');}}/></label>
    <label>Status<select disabled={busy||!canManage} value={active?'active':'inactive'} onChange={event=>setActive(event.target.value==='active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
   </div>
   {!active&&<p className="excursion-crew-inactive-note">Inactive crew members remain in historical records but cannot be newly assigned as crew or guides.</p>}
   <section className="excursion-crew-history" aria-labelledby="crew-history-title">
    <header><div><small>PAST 3 MONTHS</small><h4 id="crew-history-title">Excursion history</h4>{historyPeriod&&<p>{displayDate(historyPeriod.from)} – {displayDate(historyPeriod.to)}</p>}</div><div className="excursion-crew-history-totals"><span><strong>{historyTotals.trips}</strong> trips</span><span><strong>{historyTotals.completed}</strong> completed</span></div></header>
    {historyLoading?<p className="excursion-crew-history-empty">Loading excursion history…</p>:historyError?<p className="excursion-dialog-message" role="alert">{historyError}</p>:history.length?<div className="excursion-crew-history-list">{history.map((trip:any)=><article key={[trip.id,trip.date,trip.time].join('|')}><div><strong>{trip.name}</strong><span>{displayDate(trip.date)} · {trip.time}{trip.endTime?'–'+trip.endTime:''} · Maldives time</span></div><div className="excursion-crew-history-meta"><span>{trip.role}</span><span>{trip.vessel}</span><b>{trip.tripStatus}</b></div></article>)}</div>:<p className="excursion-crew-history-empty">No excursion assignments recorded in the past 3 months.</p>}
   </section>
   {error&&<p className="excursion-dialog-message" role="alert">{error}</p>}
   <footer><button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="excursion-primary-btn" disabled={busy||!canManage}>{busy?'Saving…':'Save changes'}</button></footer>
  </form>
 </div>;
}
