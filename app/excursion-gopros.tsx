'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';

const conditions = ['Available', 'Charging', 'Under maintenance', 'Out of service'] as const;
type Condition = typeof conditions[number];
type GoPro = {id: string; name: string; condition?: string};
type GoProData = {canSchedule?: boolean; revision?: number; resources?: {gopros?: GoPro[]}};
type Editor = {id: string; name: string; condition: string; revision: number};

export default function ExcursionGoPros({data}: {data?: GoProData | null}) {
 const [saved, setSaved] = useState<GoProData | null>(null);
 const [editor, setEditor] = useState<Editor | null>(null);
 const [notice, setNotice] = useState('');
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const [deletingId, setDeletingId] = useState('');
 const [conflict, setConflict] = useState(false);
 const lock = useRef(false);
 const dialog = useRef<HTMLFormElement>(null);
 const current = saved && (!data || Number(saved.revision) > Number(data.revision)) ? saved : data;
 const gopros = current?.resources?.gopros || [];
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

 function open(gopro?: GoPro) {
  if (!canManage || lock.current) return;
  setError(''); setNotice(''); setConflict(false);
  setEditor({id: gopro?.id || '', name: gopro?.name || '', condition: gopro?.condition || 'Available', revision: current!.revision!});
 }
 function close() {if (!lock.current) setEditor(null);}

 async function remove(gopro: GoPro) {
  if (!canManage || lock.current) return;
  if (!window.confirm(`Delete GoPro “${gopro.name}”?\n\nA GoPro assigned to an active or future snorkeling trip cannot be deleted until it is reassigned.`)) return;
  lock.current = true; setBusy(true); setDeletingId(gopro.id); setError(''); setNotice('');
  try {
   const response = await fetch('/api/guest-services', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'excursion-gopro-remove', goproId: gopro.id, revision: current!.revision!}),
   });
   const result = await response.json();
   if (!response.ok) throw Error(result.error || 'Could not delete the GoPro.');
   setSaved(result);
   setNotice(`${gopro.name} removed from the GoPro list.`);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) {setError(e instanceof Error ? e.message : 'Could not delete the GoPro.');}
  finally {lock.current = false; setBusy(false); setDeletingId('');}
 }

 async function reload() {
  if (!editor || lock.current) return;
  lock.current = true; setBusy(true); setError('');
  try {
   const response = await fetch('/api/guest-services', {cache: 'no-store'});
   const latest = await response.json();
   if (!response.ok) throw Error(latest.error || 'Could not reload GoPros.');
   if (!latest.canSchedule || !Number.isInteger(latest.revision)) throw Error('Admin access is required. Please sign in again.');
   setSaved(latest);
   const gopro: GoPro | undefined = latest.resources?.gopros?.find((item: GoPro) => item.id === editor.id);
   if (editor.id && !gopro) throw Error('This GoPro is no longer available. Close this window and refresh.');
   setEditor({...editor, name: gopro?.name ?? editor.name, condition: gopro?.condition || (editor.id ? 'Available' : editor.condition), revision: latest.revision});
   setConflict(false);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) {setError(e instanceof Error ? e.message : 'Could not reload GoPros.');}
  finally {lock.current = false; setBusy(false);}
 }

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!editor || lock.current || conflict) return;
  if (!canManage) {setError('Admin access is required to manage GoPros.'); return;}
  const name = editor.name.trim();
  if (!name || name.length > 100) {setError('Enter a GoPro name of 1–100 characters.'); return;}
  if (!conditions.includes(editor.condition as Condition)) {setError('Choose a valid GoPro status.'); return;}
  lock.current = true; setBusy(true); setError('');
  try {
   const action = editor.id
    ? {action: 'excursion-gopro-update', goproId: editor.id, name, condition: editor.condition}
    : {action: 'excursion-resource', resourceType: 'gopros', name, condition: editor.condition};
   const response = await fetch('/api/guest-services', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...action, revision: editor.revision}),
   });
   const result = await response.json();
   if (!response.ok) {
    if (response.status === 409) setConflict(true);
    throw Error(result.error || 'Could not save the GoPro.');
   }
   setSaved(result); setEditor(null);
   setNotice(editor.id ? `${name}: GoPro details saved.` : `${name} added successfully.`);
   window.dispatchEvent(new Event('services-updated'));
  } catch (e) {setError(e instanceof Error ? e.message : 'Could not save the GoPro.');}
  finally {lock.current = false; setBusy(false);}
 }

 return <section className="excursion-panel">
  <div className="excursion-panel-head">
   <div><h3>GoPros</h3><p>Manage GoPro cameras used on snorkeling trips. Every snorkeling departure must have one available GoPro assigned to its vessel.</p></div>
   <button type="button" className="excursion-primary-btn" disabled={!canManage || busy} onClick={() => open()}>+ Add GoPro</button>
  </div>
  {notice && <p className="excursion-schedule-message" role="status">{notice}</p>}
  {error && !editor && <p className="excursion-dialog-message" role="alert">{error}</p>}
  {!current ? <div className="excursion-empty-state"><strong>Loading GoPros…</strong></div>
   : <>{!canManage && <p role="status">Only Admin can add, manage or remove GoPros.</p>}
    {gopros.length ? <div className="excursion-menu-grid">{gopros.map(gopro => <article className="excursion-menu-card" key={gopro.id}>
     <div className="excursion-menu-card-top"><div><h4>{gopro.name}</h4><p>Excursion camera</p></div><span className="excursion-price-pill">{gopro.condition || 'Available'}</span></div>
     <div className="excursion-menu-card-actions" style={{gap: 10}}>
      <button type="button" className="excursion-secondary-btn" disabled={!canManage || busy} onClick={() => open(gopro)}>Manage</button>
      <button type="button" className="excursion-delete-btn" disabled={!canManage || busy} onClick={() => remove(gopro)}>{deletingId === gopro.id ? 'Deleting…' : 'Delete'}</button>
     </div>
    </article>)}</div> : <div className="excursion-empty-state"><strong>No GoPros added yet</strong><p>Add each GoPro here, then assign one when scheduling a snorkeling trip.</p></div>}
   </>}
  {editor && <div className="excursion-schedule-overlay" role="presentation" onClick={event => {if (event.target === event.currentTarget) close();}}>
   <form ref={dialog} className="excursion-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="gopro-editor-title" onSubmit={submit}>
    <header><div><small>EXCURSION GOPRO</small><h3 id="gopro-editor-title">{editor.id ? 'Manage GoPro' : 'Add GoPro'}</h3><p>{editor.id ? 'Edit the GoPro name and operational status.' : 'Register a GoPro for snorkeling trip assignments.'}</p></div>
     <button type="button" className="excursion-dialog-close" disabled={busy} onClick={close} aria-label="Close GoPro window">×</button>
    </header>
    <div className="excursion-schedule-form-grid">
     <label className="full">GoPro name / number<input required maxLength={100} disabled={busy || conflict} placeholder="Example: GoPro 01" value={editor.name} onChange={event => setEditor({...editor, name: event.target.value})}/></label>
     <label className="full">Status<select required disabled={busy || conflict} value={editor.condition} onChange={event => setEditor({...editor, condition: event.target.value})}>{conditions.map(condition => <option key={condition} value={condition}>{condition}</option>)}</select></label>
    </div>
    <p className="assignment-shared-note">Only GoPros marked Available can be assigned to a snorkeling trip. A GoPro cannot be assigned to overlapping departures.</p>
    {error && <p className="excursion-dialog-message" role="alert">{error}</p>}
    {conflict && <p className="excursion-dialog-message">Reload the latest GoPro details, then review your changes before saving again.</p>}
    <footer>
     <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button>
     {conflict && <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={reload}>{busy ? 'Reloading…' : 'Reload GoPro details'}</button>}
     <button type="submit" className="excursion-primary-btn" disabled={busy || conflict}>{busy ? 'Saving…' : editor.id ? 'Save changes' : 'Add GoPro'}</button>
    </footer>
   </form>
  </div>}
 </section>;
}
