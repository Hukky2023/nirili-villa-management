'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';

type Crew = {id: string; name: string};
type CrewLoginInput = {name: string; username: string; password: string};
type Props = {
 crew: Crew[];
 canManage: boolean;
 onSave: (input: CrewLoginInput) => Promise<any>;
 onClose: () => void;
};
const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const validUsername = (username: string) => /^[a-z0-9._-]{3,40}$/.test(username);

export default function ExcursionCrewForm({crew, canManage, onSave, onClose}: Props) {
 const [name, setName] = useState('');
 const [username, setUsername] = useState('');
 const [password, setPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
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
  const login = username.trim().toLowerCase();
  if (!trimmed || trimmed.length > 100) { setError('Enter a crew member name of 1–100 characters.'); return; }
  if (crew.some(member => normalizeName(member.name) === normalizeName(trimmed))) {
   setError('That name is already in the crew list.'); return;
  }
  if (!validUsername(login)) {
   setError('Username must be 3–40 characters using letters, numbers, dots, underscores or hyphens.'); return;
  }
  if (password.length < 8 || password.length > 128) {
   setError('Password must be 8–128 characters.'); return;
  }
  if (password !== confirmPassword) {
   setError('The two passwords do not match.'); return;
  }
  lock.current = true; setBusy(true); setError('');
  try {
   await onSave({name: trimmed, username: login, password});
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Could not add the crew member. Please try again.');
   window.dispatchEvent(new Event('services-updated'));
  } finally { lock.current = false; setBusy(false); }
 }

 return <div className="excursion-schedule-overlay" role="presentation" onClick={event => {if (event.target === event.currentTarget) close();}}>
  <form ref={dialog} className="excursion-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="crew-form-title" aria-describedby="crew-form-help" aria-busy={busy} tabIndex={-1} onSubmit={submit}>
   <header><div><small>EXCURSION CREW</small><h3 id="crew-form-title">Add crew member</h3><p id="crew-form-help">Create the crew member and choose the username and password they will use for the Crew Member portal.</p></div>
    <button type="button" className="excursion-dialog-close" disabled={busy} onClick={close} aria-label="Close crew window">×</button>
   </header>
   <div className="excursion-schedule-form-grid">
    <label className="full">Crew member name<input required maxLength={100} autoComplete="off" disabled={busy || !canManage} value={name} aria-describedby={error ? 'crew-form-error' : undefined} onChange={event => {setName(event.target.value); setError('');}}/></label>
    <label className="full">Username<input required minLength={3} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="Example: dhaain" disabled={busy || !canManage} value={username} onChange={event => {setUsername(event.target.value.toLowerCase().replace(/\s+/g,'')); setError('');}}/><small>3–40 characters. Letters, numbers, dots, underscores and hyphens only.</small></label>
    <label>Password<input required type={showPassword?'text':'password'} minLength={8} maxLength={128} autoComplete="new-password" disabled={busy || !canManage} value={password} onChange={event => {setPassword(event.target.value); setError('');}}/></label>
    <label>Confirm password<input required type={showPassword?'text':'password'} minLength={8} maxLength={128} autoComplete="new-password" disabled={busy || !canManage} value={confirmPassword} onChange={event => {setConfirmPassword(event.target.value); setError('');}}/></label>
    <label className="full" style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={showPassword} disabled={busy} onChange={event=>setShowPassword(event.target.checked)} style={{width:18,height:18,minHeight:18}}/>Show password</label>
   </div>
   <p className="assignment-shared-note">Admin chooses these login details. The password must be at least 8 characters. The crew member can use the Crew Member login immediately after creation.</p>
   {error && <p id="crew-form-error" className="excursion-dialog-message" role="alert">{error}</p>}
   {!canManage && <p role="status">Only Admin can add crew members.</p>}
   <footer><button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="excursion-primary-btn" disabled={busy || !canManage}>{busy ? 'Creating…' : 'Create crew login'}</button></footer>
  </form>
 </div>;
}
