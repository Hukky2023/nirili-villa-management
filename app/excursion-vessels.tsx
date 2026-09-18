'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';

const conditions = ['Available', 'Under maintenance', 'Out of service'] as const;
type Condition = typeof conditions[number];
type Vessel = {id: string; name: string; condition?: string};
type VesselData = {canSchedule?: boolean; revision?: number; resources?: {vessels?: Vessel[]}};
type Editor = {id: string; name: string; condition: string; revision: number};

// Reuse the admin-only, revision-checked actions and the existing vessel IDs.
export default function ExcursionVessels({data}: {data?: VesselData | null}) {
 const [saved, setSaved] = useState<VesselData | null>(null);
 const [editor, setEditor] = useState<Editor | null>(null);
 const [notice, setNotice] = useState('');
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const [conflict, setConflict] = useState(false);
 const lock = useRef(false);
 const dialog = useRef<HTMLFormElement>(null);
 const isOpen = editor !== null;
 // A slower background response must not revert a successfully saved card.
 const current = saved && (!data || Number(saved.revision) > Number(data.revision)) ? saved : data;
 const vessels = current?.resources?.vessels || [];
 const canManage = current?.canSchedule === true && Number.isInteger(current.revision);

 useEffect(() => {
  if (!isOpen) return;
  const previous = document.activeElement as HTMLElement | null;
  const oldOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.current?.querySelector<HTMLElement>('input:not([readonly]), select')?.focus();
  function keydown(event: KeyboardEvent) {
   if (event.key === 'Escape') {
    event.preventDefault();
    if (!lock.current) setEditor(null);
   }
   if (event.key !== 'Tab') return;
   const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') || []);
   const first = focusable[0], last = focusable[focusable.length - 1];
   if (!first) { event.preventDefault(); return; }
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', keydown);
  return () => {
   document.removeEventListener('keydown', keydown);
   document.body.style.overflow = oldOverflow;
   if (previous?.isConnected) previous.focus();
  };
 }, [isOpen]);

 function open(vessel?: Vessel) {
  if (!canManage || lock.current) return;
  setError(''); setNotice(''); setConflict(false);
  setEditor({id: vessel?.id || '', name: vessel?.name || '', condition: vessel?.condition || 'Available', revision: current!.revision!});
 }
 function close() { if (!lock.current) setEditor(null); }

 async function reload() {
  if (!editor || lock.current) return;
  lock.current = true; setBusy(true); setError('');
  try {
   const response = await fetch('/api/guest-services', {cache: 'no-store'});
   const latest = await response.json();
   if (!response.ok) throw Error(latest.error || 'Could not reload vessels.');
   if (!latest.canSchedule || !Number.isInteger(latest.revision)) throw Error('Admin access is required. Please sign in again.');
   setSaved(latest);
   const vessel: Vessel | undefined = latest.resources?.vessels?.find((item: Vessel) => item.id === editor.id);
   if (editor.id && !vessel) throw Error('This vessel is no longer available. Close this window and refresh the page.');
   setEditor({...editor, name: vessel?.name ?? editor.name, condition: vessel?.condition || (editor.id ? 'Available' : editor.condition), revision: latest.revision});
   setConflict(false);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not reload vessels.'); }
  finally { lock.current = false; setBusy(false); }
 }

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!editor || lock.current || conflict) return;
  if (!canManage) { setError('Admin access is required to manage vessels.'); return; }
  const name = editor.name.trim();
  if (!name || name.length > 100) { setError('Enter a vessel name of 1–100 characters.'); return; }
  if (!conditions.includes(editor.condition as Condition)) { setError('Choose a valid vessel status.'); return; }
  lock.current = true; setBusy(true); setError('');
  try {
   const action = editor.id
    ? {action: 'excursion-vessel-condition', vesselId: editor.id, condition: editor.condition}
    : {action: 'excursion-resource', resourceType: 'vessels', name, condition: editor.condition};
   const response = await fetch('/api/guest-services', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...action, revision: editor.revision}),
   });
   const result = await response.json();
   if (!response.ok) {
    if (response.status === 409) setConflict(true);
    throw Error(result.error || 'Could not save the vessel. Please try again.');
   }
   setSaved(result); setEditor(null);
   setNotice(editor.id ? `${name}: status saved as ${editor.condition}.` : `${name} added successfully.`);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the vessel. Please try again.'); }
  finally { lock.current = false; setBusy(false); }
 }

 return <section className="excursion-panel">
  <div className="excursion-panel-head">
   <div><h3>Vessels</h3><p>Manage boats and their availability for excursion trips.</p></div>
   <button type="button" className="excursion-primary-btn" disabled={!canManage || busy} onClick={() => open()}>+ Add vessel</button>
  </div>
  {notice && <p className="excursion-schedule-message" role="status">{notice}</p>}
  {!current ? <div className="excursion-empty-state"><strong>Loading vessels…</strong></div>
   : <>{!canManage && <p role="status">Only Admin can add vessels or change their status.</p>}
    {vessels.length ? <div className="excursion-menu-grid">{vessels.map(vessel => <article className="excursion-menu-card" key={vessel.id}>
     <div className="excursion-menu-card-top"><div><h4>{vessel.name}</h4><p>Excursion vessel</p></div><span className="excursion-price-pill">{vessel.condition || 'Available'}</span></div>
     <div className="excursion-menu-card-actions"><button type="button" className="excursion-secondary-btn" disabled={!canManage || busy} aria-label={'Manage ' + vessel.name} onClick={() => open(vessel)}>Manage</button></div>
    </article>)}</div> : <div className="excursion-empty-state"><strong>No vessels added yet</strong><p>Use Add vessel to register a boat and set its availability.</p></div>}
   </>}
  {editor && <div className="excursion-schedule-overlay" role="presentation" onClick={event => {if (event.target === event.currentTarget) close();}}>
   <form ref={dialog} className="excursion-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="vessel-editor-title" onSubmit={submit}>
    <header><div><small>EXCURSION VESSEL</small><h3 id="vessel-editor-title">{editor.id ? 'Manage vessel' : 'Add vessel'}</h3><p>{editor.id ? 'Update the availability of this vessel.' : 'Add a boat to the excursion vessel list.'}</p></div>
     <button type="button" className="excursion-dialog-close" disabled={busy} onClick={close} aria-label="Close vessel window">×</button>
    </header>
    <div className="excursion-schedule-form-grid">
     <label className="full">Vessel name<input required maxLength={100} readOnly={!!editor.id} disabled={busy} value={editor.name} onChange={event => setEditor({...editor, name: event.target.value})}/></label>
     <label className="full">Vessel status<select required disabled={busy || conflict} value={editor.condition} onChange={event => setEditor({...editor, condition: event.target.value})}>{conditions.map(condition => <option key={condition} value={condition}>{condition}</option>)}</select></label>
    </div>
    <p className="assignment-shared-note">Changing status does not remove existing trip assignments. Review the schedule and reassign trips when a boat is unavailable.</p>
    {error && <p className="excursion-dialog-message" role="alert">{error}</p>}
    {conflict && <p className="excursion-dialog-message">Reload the latest vessel details, then review your choice before saving again.</p>}
    <footer>
     <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button>
     {conflict && <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={reload}>{busy ? 'Reloading…' : 'Reload vessel details'}</button>}
     <button type="submit" className="excursion-primary-btn" disabled={busy || conflict}>{busy ? 'Saving…' : editor.id ? 'Save changes' : 'Add vessel'}</button>
    </footer>
   </form>
  </div>}
 </section>;
}
