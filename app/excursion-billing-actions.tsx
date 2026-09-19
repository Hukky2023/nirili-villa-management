'use client';

import {useEffect, useId, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import type {ExcursionPricing} from '../lib/excursion-billing';
import './excursion-billing-actions.css';

const money = (cents: number) => '$' + (cents / 100).toFixed(2);
type Action = 'free' | 'discount' | 'restore';
type Props = {
  booking: {id: string; guest: string; excursion: string; totalCents: number;
    pricing?: ExcursionPricing; billingHistory?: any[]};
  canAdjust: boolean; revision: number; onUpdated: () => Promise<void>;
};

export default function ExcursionBillingActions({booking, canAdjust, revision, onUpdated}: Props) {
  const p = booking.pricing || {originalCents: booking.totalCents, totalCents: booking.totalCents,
    discountCents: 0, discountPercent: 0, complimentary: false, adjusted: false};
  const [action, setAction] = useState<Action | null>(null);
  const [snapshot, setSnapshot] = useState({revision, originalCents: p.originalCents, totalCents: p.totalCents, requestId: ''});
  const [percent, setPercent] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), saving = useRef(false);
  const titleId = useId();
  useEffect(() => {if (action && dialog.current && !dialog.current.open) dialog.current.showModal();}, [action]);
  useEffect(() => {if (!canAdjust) {dialog.current?.close(); setAction(null);}}, [canAdjust]);

  function open(next: Action) {
    setSnapshot({revision, originalCents: p.originalCents, totalCents: p.totalCents, requestId: crypto.randomUUID()});
    setPercent(p.discountPercent > 0 && p.discountPercent < 100 ? String(p.discountPercent) : '');
    setReason(''); setError(''); setNotice(''); setConflict(false); setAction(next);
  }
  function close() {if (!saving.current) {dialog.current?.close(); setAction(null);}}
  const value = action === 'free' ? 100 : action === 'restore' ? 0 : Number(percent);
  const valid = action !== 'discount' || (/^\d{1,3}(\.\d{1,2})?$/.test(percent) && value > 0 && value <= 100);
  const finalCents = valid ? Math.round(snapshot.originalCents * (10000 - Math.round(value * 100)) / 10000) : snapshot.originalCents;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canAdjust || !action || !valid || saving.current || conflict) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/excursion-bookings', {method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: booking.id, action, revision: snapshot.revision, requestId: snapshot.requestId,
          discountPercent: value, reason})});
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(result.error || 'Could not save the billing adjustment.');
      }
      dialog.current?.close(); setAction(null);
      setNotice('Saved. The excursion charge and linked bill have been updated.');
      await onUpdated();
      window.dispatchEvent(new Event('services-updated'));
      window.dispatchEvent(new Event('nirili:auto-refresh'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.');
    } finally {saving.current = false; setBusy(false);}
  }

  return <div className="excursion-billing-actions">
    {p.adjusted && <div className="excursion-price-summary">
      <span>Original <b>{money(p.originalCents)}</b></span>
      <span>{p.complimentary ? 'Complimentary / Free' : `Discount ${p.discountPercent}%`} <b>−{money(p.discountCents)}</b></span>
      <span>Total <b>{money(p.totalCents)}</b></span>
    </div>}
    {canAdjust && <div className="excursion-price-buttons">
      <button type="button" className="excursion-secondary-btn" disabled={busy || p.complimentary} onClick={() => open('free')}>Make Free</button>
      <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={() => open('discount')}>{p.adjusted && !p.complimentary ? 'Edit Discount' : 'Add Discount'}</button>
      {p.adjusted && <button type="button" className="excursion-secondary-btn" disabled={busy} onClick={() => open('restore')}>Remove adjustment</button>}
    </div>}
    {notice && <p className="excursion-price-notice" role="status">{notice}</p>}
    {canAdjust && !!booking.billingHistory?.length && <details className="excursion-price-history">
      <summary>Billing adjustment history</summary>
      <div>{[...booking.billingHistory].reverse().map(entry => <p key={entry.requestId}>
        <b>{entry.action === 'free' ? 'Made free' : entry.action === 'restore' ? 'Original price restored' : `${entry.discountPercent}% discount`}</b>
        <span>{money(entry.previousCents)} → {money(entry.totalCents)} · {entry.by}</span>
        <small>{new Date(entry.at).toLocaleString('en-GB', {timeZone: 'Indian/Maldives'})} · Maldives time{entry.reason ? ' · ' + entry.reason : ''}</small>
      </p>)}</div>
    </details>}
    {action && <dialog ref={dialog} className="excursion-price-dialog" aria-labelledby={titleId}
      onCancel={event => {event.preventDefault(); close();}} onClose={() => {if (!saving.current) setAction(null);}}>
      <form onSubmit={save}>
        <h3 id={titleId}>{action === 'free' ? 'Make excursion free' : action === 'restore' ? 'Remove billing adjustment' : 'Add / edit discount'}</h3>
        <p>{booking.guest} · {booking.excursion}<small>{booking.id}</small></p>
        <p>This changes the total for the whole booking / group, not the price per guest.</p>
        {action === 'discount' && <label>Discount (%)<input autoFocus type="number" min="0.01" max="100" step="0.01" inputMode="decimal" required value={percent} disabled={busy || conflict}
          onChange={event => {setPercent(event.target.value); setSnapshot(old => ({...old, requestId: crypto.randomUUID()}));}} placeholder="Enter percentage"/></label>}
        <label>Reason (optional)<textarea maxLength={500} rows={2} value={reason} disabled={busy || conflict}
          onChange={event => {setReason(event.target.value); setSnapshot(old => ({...old, requestId: crypto.randomUUID()}));}} placeholder="For example, included in guest package"/></label>
        <dl className="excursion-price-preview">
          <div><dt>Original booking amount</dt><dd>{money(snapshot.originalCents)}</dd></div>
          <div><dt>Current bill amount</dt><dd>{money(snapshot.totalCents)}</dd></div>
          <div><dt>{action === 'free' ? 'Complimentary discount' : 'Discount'}</dt><dd>−{money(snapshot.originalCents - finalCents)}</dd></div>
          <div><dt>New bill total</dt><dd>{money(finalCents)}</dd></div>
        </dl>
        <p className="excursion-price-help">The existing linked bill will be updated. Payments already received are kept; any resulting credit needs review. This does not issue a refund.</p>
        {error && <p className="excursion-booking-error" role="alert">{error}</p>}
        <footer><button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className="excursion-secondary-btn excursion-price-confirm" disabled={busy || !valid || conflict}>{busy ? 'Saving…' : action === 'free' ? 'Confirm Make Free' : action === 'restore' ? 'Restore original price' : 'Apply Discount'}</button></footer>
      </form>
    </dialog>}
  </div>;
}
