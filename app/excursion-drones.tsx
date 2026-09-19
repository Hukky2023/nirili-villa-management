'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';

const conditions = ['Available', 'Charging', 'Under maintenance', 'Out of service'] as const;
type Condition = typeof conditions[number];
type Drone = {id: string; name: string; condition?: string};
type DroneData = {canSchedule?: boolean; revision?: number; resources?: {drones?: Drone[]}};
type Editor = {id: string; name: string; condition: string; revision: number};

export default function ExcursionDrones({data}: {data?: DroneData | null}) {
 const [saved, setSaved] = useState<DroneData | null>(null);
 const [editor, setEditor] = useState<Editor | null>(null);
 const [notice, setNotice] = useState('');
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const [deletingId, setDeletingId] = useState('');
 const [conflict, setConflict] = useState(false);
 const lock = useRef(false);
 const dialog = useRef<HTMLFormElement>(null);
 const current = saved && (!data || Number(saved.revision) > Number(data.revision)) ? saved : data;
 const drones = current?.resources?.drones || [];
 const canManage = current?.canSchedule === true && Number.isInteger(current.revision);

 useEffect(() => {
  if (!editor) return;
  const previous = document.activeElement as HTMLElement | null;
  const oldOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.current?.querySelector<HTMLElement>('input, select')?.focus();
  const keydown = (event: KeyboardEvent) => {
   if (event.key === 'Escape' && !lock.current) {event.preventDefault(); setEditor(null);}
  };
  document.addEventListener('keydown', keydown);
  return () => {
   document.removeEventListener('keydown', keydown);
   document.body.style.overflow = oldOverflow;
   if (previous?.isConnected) previous.focus();
  };
 }, [editor]);

 function open(drone?: Drone) {
  if (!canManage || lock.current) return;
  setError(''); setNotice(''); setConflict(false);
  setEditor({id: drone?.id || '', name: drone?.name || '', condition: drone?.condition || 'Available', revision: current!.revision!});
 }
 function close() {if (!lock.current) setEditor(null);}

 async function remove(drone: Drone) {
  if (!canManage || lock.current) return;
  if (!window.confirm(`Delete drone “${drone.name}”?\n\nA drone assigned to an active or future Shark snorkeling or Sandbank trip cannot be deleted until it is reassigned.`)) return;
  lock.current = true; setBusy(true); setDeletingId(drone.id); setError(''); setNotice('');
  try {
   const response = await fetch('/api/guest-services', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'excursion-drone-remove', droneId: drone.id, revision: current!.revision!}),
   });
   const result = await response.json();
   if (!response.ok) throw Error(result.error || 'Could not delete the drone.');
   setSaved(result);
   setNotice(`${drone.name} removed from the drone list.`);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) {setError(e instanceof Error ? e.message : 'Could not delete the drone.');}
  finally {lock.current = false; setBusy(false); setDeletingId('');}
 }

 async function reload() {
  if (!editor || lock.current) return;
  lock.current = true; setBusy(true); setError('');
  try {
   const response = await fetch('/api/guest-services', {cache: 'no-store'});
   const latest = await response.json();
   if (!response.ok) throw Error(latest.error || 'Could not reload drones.');
   if (!latest.canSchedule || !Number.isInteger(latest.revision)) throw Error('Admin access is required. Please sign in again.');
   setSaved(latest);
   const drone: Drone | undefined = latest.resources?.drones?.find((item: Drone) => item.id === editor.id);
   if (editor.id && !drone) throw Error('This drone is no longer available. Close this window and refresh.');
   setEditor({...editor, name: drone?.name ?? editor.name, condition: drone?.condition || (editor.id ? 'Available' : editor.condition), revision: latest.revision});
   setConflict(false);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) {setError(e instanceof Error ? e.message : 'Could not reload drones.');}
  finally {lock.current = false; setBusy(false);}
 }

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!editor || lock.current || conflict) return;
  if (!canManage) {setError('Admin access is required to manage drones.'); return;}
  const name = editor.name.trim();
  if (!name || name.length > 100) {setError('Enter a drone name of 1–100 characters.'); return;}
  if (!conditions.includes(editor.condition as Condition)) {setError('Choose a valid drone status.'); return;}
  lock.current = true; setBusy(true); setError('');
  try {
   const action = editor.id
    ? {action: 'excursion-drone-update', droneId: editor.id, name, condition: editor.condition}
    : {action: 'excursion-resource', resourceType: 'drones', name, condition: editor.condition};
   const response = await fetch('/api/guest-services', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...action, revision: editor.revision}),
   });
   const result = await response.json();
   if (!response.ok) {
    if (response.status === 409) setConflict(true);
    throw Error(result.error || 'Could not save the drone.');
   }
   setSaved(result); setEditor(null);
   setNotice(editor.id ? `${name}: drone details saved.` : `${name} added successfully.`);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) {setError(e instanceof Error ? e.message : 'Could not save the drone.');}
  finally {lock.current = false; setBusy(false);}
 }

 return <section className="excursion-panel">
  <div className="excursion-panel-head">
   <div><h3>Drones</h3><p>Manage drones used on Shark snorkeling and Sandbank trips. Only these trips require a drone assignment.</p></div>
   <button type="button" className="excursion-primary-btn" disabled={!canManage || busy} onClick={() => open()}>+ Add drone</button>
  </div>
  {notice && <p className="excursion-schedule-message" role="status">{notice}</p>}
  {error && !editor && <p className="excursion-dialog-message" role="alert">{error}</p>}
  {!current ? <div className="excursion-empty-state"><strong>Loading drones…</strong></div>
   : <>{!canManage && <p role="status">Only Admin can add, manage or remove drones.</p>}
    {drones.length ? <div className="excursion-menu-grid">{drones.map(drone => <article className="excursion-menu-card" key={drone.id}>
     <div className="excursion-menu-card-top"><div><h4>{drone.name}</h4><p>Excursion drone</p></div><span className="excursion-price-pill">{drone.condition || 'Available'}</span></div>
     <div className="excursion-menu-card-actions" style={{gap: 10}}>
      <button type="button" className="excursion-secondary-btn" disabled={!canManage || busy} onClick={() => open(drone)}>Manage</button>
      <button type="button" className="excursion-delete-btn" disabled={!canManage || busy} onClick={() => remove(drone)}>{deletingId === drone.id ? 'Deleting…' : 'Delete'}</button>
     </div>
    </article>)}</div> : <div className="excursion-empty-state"><strong>No drones added yet</strong><p>Add each drone here, then assign one to Shark snorkeling and Sandbank trips.</p></div>}
   </>}
  {editor && <div className="excursion-schedule-overlay" role="presentation" onClick={event => {if (event.target === event.currentTarget) close();}}>
   <form ref={dialog} className="excursion-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="drone-editor-title" onSubmit={submit}>
    <header><div><small>EXCURSION DRONE</small><h3 id="drone-editor-title">{editor.id ? 'Manage drone' : 'Add drone'}</h3><p>{editor.id ? 'Edit the drone name and operational status.' : 'Register a drone for excursion assignments.'}</p></div>
     <button type="button" className="excursion-dialog-close" disabled={busy} onClick={close} aria-label="Close drone window">×</button>
    </header>
    <div className="excursion-schedule-form-grid">
     <label className="full">Drone name / number<input required maxLength={100} disabled={busy || conflict} placeholder="Example: DJI 01" value={editor.name} onChange={event => setEditor({...editor, name: event.target.value})}/></label>
     <label className="full">Status<select required disabled={busy || conflict} value={editor.condition} onChange={event => setEditor({...editor, condition: event.target.value})}>{conditions.map(condition => <option key={condition} value={condition}>{condition}</option>)}</select></label>
    </div>
    <p className="assignment-shared-note">Only drones marked Available can be assigned. The same drone cannot be assigned to overlapping departures.</p>
    {error && <p className="excursion-dialog-message" role="alert">{error}</p>}
    {conflict && <p className="excursion-dialog-message">Reload the latest drone details, then review your changes before saving again.</p>}
    <footer>
     <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button>
     {conflict && <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={reload}>{busy ? 'Reloading…' : 'Reload drone details'}</button>}
     <button type="submit" className="excursion-primary-btn" disabled={busy || conflict}>{busy ? 'Saving…' : editor.id ? 'Save changes' : 'Add drone'}</button>
    </footer>
   </form>
  </div>}
 </section>;
}
