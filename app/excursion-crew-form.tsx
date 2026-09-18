'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';

type Crew = {id: string; name: string};
type Props = {
 crew: Crew[];
 canManage: boolean;
 onSave: (name: string) => Promise<void>;
 onClose: () => void;
};
const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

// Saving uses the existing admin-only, revision-checked guest-services action.
// This adds a scheduling resource, not a login account or a trip assignment.
export default function ExcursionCrewForm({crew, canManage, onSave, onClose}: Props) {
 const [name, setName] = useState('');
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const lock = useRef(false);
 const dialog = useRef<HTMLFormElement>(null);
 const closeRef = useRef(onClose);
 closeRef.current = onClose;

 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  function keydown(event: KeyboardEvent) {
   if (event.key === 'Escape') {
    event.preventDefault();
    if (!lock.current) closeRef.current();
   }
   if (event.key !== 'Tab') return;
   const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') || []);
   const first = elements[0], last = elements[elements.length - 1];
   if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', keydown);
  return () => {
   document.removeEventListener('keydown', keydown);
   document.body.style.overflow = overflow;
   if (previous?.isConnected) previous.focus();
  };
 }, []);

 function close() { if (!lock.current) onClose(); }
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (lock.current) return;
  if (!canManage) { setError('Only Admin can add crew members.'); return; }
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) { setError('Enter a crew member name of 1–100 characters.'); return; }
  if (crew.some(member => normalizeName(member.name) === normalizeName(trimmed))) {
   setError('That name is already in the crew list.'); return;
  }
  lock.current = true; setBusy(true); setError('');
  try {
   // The parent updates its resources from the server response before closing.
   await onSave(trimmed);
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Could not add the crew member. Please try again.');
   // Load the latest revision after a conflict/network error. Keep the entered
   // name and require an explicit retry; never resubmit a write automatically.
   window.dispatchEvent(new Event('services-updated'));
  } finally { lock.current = false; setBusy(false); }
 }

 return <div className="excursion-schedule-overlay" role="presentation" onClick={event => {if (event.target === event.currentTarget) close();}}>
  <form ref={dialog} className="excursion-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="crew-form-title" aria-describedby="crew-form-help" aria-busy={busy} tabIndex={-1} onSubmit={submit}>
   <header><div><small>EXCURSION CREW</small><h3 id="crew-form-title">Add crew member</h3><p id="crew-form-help">Add a person to the crew list, then assign them to trips from Schedule.</p></div>
    <button type="button" className="excursion-dialog-close" disabled={busy} onClick={close} aria-label="Close crew window">×</button>
   </header>
   <div className="excursion-schedule-form-grid">
    <label className="full">Crew member name<input required maxLength={100} autoComplete="off" disabled={busy || !canManage} value={name} aria-describedby={error ? 'crew-form-error' : undefined} onChange={event => {setName(event.target.value); setError('');}}/></label>
   </div>
   {error && <p id="crew-form-error" className="excursion-dialog-message" role="alert">{error}</p>}
   {!canManage && <p role="status">Only Admin can add crew members.</p>}
   <footer><button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="excursion-primary-btn" disabled={busy || !canManage}>{busy ? 'Saving…' : 'Add crew member'}</button></footer>
  </form>
 </div>;
}
