'use client';

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {ExcursionManifest} from '../lib/excursion-manifest';
import './excursion-guest-list.css';

const money = (cents: number) => '$' + (cents / 100).toFixed(2);
const dateLabel = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : 'Not recorded';
function createdLabel(value: string) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Indian/Maldives', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

type Props = {scheduleId: string; tripName: string};

export default function ExcursionGuestListButton({scheduleId, tripName}: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button type="button" className="excursion-secondary-btn excursion-view-btn" aria-haspopup="dialog"
      aria-label={'View guest list for ' + tripName} onClick={() => setOpen(true)}>View</button>
    {open && createPortal(<GuestListDialog key={scheduleId} scheduleId={scheduleId} tripName={tripName} onClose={close}/>, document.body)}
  </>;
}

function GuestListDialog({scheduleId, tripName, onClose}: Props & {onClose: () => void}) {
  const [manifest, setManifest] = useState<ExcursionManifest | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId(), descriptionId = useId();

  const load = useCallback(async (background = false) => {
    if (background && request.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!background) setLoading(true);
    try {
      const response = await fetch('/api/excursion-manifest?scheduleId=' + encodeURIComponent(scheduleId), {
        cache: 'no-store', signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) setManifest(null);
        throw new Error(result.error || 'Could not load the guest list.');
      }
      if (result.manifest?.trip?.id !== scheduleId || !Array.isArray(result.manifest?.bookings) || !result.manifest?.totals) {
        throw new Error('The guest list could not be read. Please refresh.');
      }
      setManifest(result.manifest); setError('');
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load the guest list.');
    } finally {
      if (request.current === controller) {request.current = null; setLoading(false);}
    }
  }, [scheduleId]);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close(); document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    };
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {if (document.visibilityState !== 'hidden') void load(true);};
    window.addEventListener('nirili:auto-refresh', refresh);
    window.addEventListener('services-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      request.current?.abort(); request.current = null;
      window.removeEventListener('nirili:auto-refresh', refresh);
      window.removeEventListener('services-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  return <dialog ref={dialog} className="excursion-guest-dialog" aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <header className="excursion-guest-header">
      <div><h2 id={headingId}>Guest list</h2><h3>{manifest?.trip.name || tripName}</h3>
        {manifest && <div className="excursion-guest-meta"><span>{dateLabel(manifest.trip.date)}</span><span>{manifest.trip.time} · Maldives time</span>
          <span>{manifest.totals.pax} confirmed guests</span><span className="excursion-guest-badge trip-status">{manifest.trip.status}</span></div>}
      </div>
      <button type="button" className="excursion-guest-close" aria-label="Close guest list" onClick={onClose}>×</button>
    </header>
    <div className="excursion-guest-body" aria-busy={loading}>
      <div className="excursion-guest-toolbar"><p id={descriptionId}>Confirmed bookings for this excursion only. Each row is a booking; Pax includes all guests in that booking.</p>
        <button type="button" className="excursion-guest-button" disabled={loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Refresh guest list'}</button></div>
      {error && <div className="excursion-guest-error" role="alert"><strong>{error}</strong>{manifest && <p>Showing the last loaded guest list. It may be out of date.</p>}</div>}
      {loading && !manifest && <p className="excursion-guest-empty" role="status">Loading confirmed guests…</p>}
      {manifest && <>
        <dl className="excursion-guest-assignment"><div><dt>Scheduled vessel</dt><dd>{manifest.trip.vessel}</dd></div>
          <div><dt>Assigned crew</dt><dd>{manifest.trip.crew.join(', ') || 'Not assigned'}</dd></div>
          {manifest.trip.notes && <div className="trip-notes"><dt>Trip notes / meeting instructions</dt><dd>{manifest.trip.notes}</dd></div>}</dl>
        {manifest.bookings.length ? <div className="excursion-guest-table-wrap"><table className="excursion-guest-table">
          <caption className="excursion-guest-sr-only">Confirmed bookings and guest details for {manifest.trip.name}</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Guest name</th><th scope="col">Booking type</th><th scope="col">Hotel</th><th scope="col">Room no.</th><th scope="col">Phone / WhatsApp</th><th scope="col">Pax</th><th scope="col">Payment status</th><th scope="col">Notes / pickup / details</th></tr></thead>
          <tbody>{manifest.bookings.map((b, index) => <tr key={b.id}>
            <td data-label="#">{index + 1}</td>
            <td data-label="Guest name"><div><strong>{b.guest}</strong><small className="excursion-guest-reference">{b.id}</small></div></td>
            <td data-label="Booking type"><span className={'excursion-guest-badge ' + (b.guestType === 'In-house' ? 'inhouse' : 'walkin')}>{b.guestType}</span></td>
            <td data-label="Hotel">{b.hotel || 'Not recorded'}</td>
            <td data-label="Room no.">{b.room || 'Not recorded'}</td>
            <td data-label="Phone / WhatsApp">{b.phone || 'Not recorded'}</td>
            <td data-label="Pax"><strong>{b.guests}</strong></td>
            <td data-label="Payment status"><div><span className={'excursion-guest-badge ' + b.paymentStatus.toLowerCase()}>{b.paymentStatus}</span><small>{money(b.totalCents)} USD</small></div></td>
            <td data-label="Notes / pickup / details"><div className="excursion-guest-notes"><p>{b.notes || 'No notes recorded'}</p>
              {b.separateVessel && <p><strong>Extra vessel: {b.vessel}</strong></p>}
              <details><summary>Booking details</summary><dl>
                <div><dt>Booking reference</dt><dd>{b.id}</dd></div>
                <div><dt>Booking status</dt><dd>Confirmed</dd></div>
                <div><dt>Excursion booked</dt><dd>{b.excursion}</dd></div>
                <div><dt>Trip date / time</dt><dd>{dateLabel(b.date)} · {b.time} · Maldives time</dd></div>
                <div><dt>Trip status</dt><dd>{b.tripStatus}</dd></div>
                <div><dt>Assigned vessel</dt><dd>{b.vessel}</dd></div>
                <div><dt>Assigned crew</dt><dd>{b.crew.join(', ') || 'Not assigned'}</dd></div>
                <div><dt>Booking source</dt><dd>{b.source || 'Not recorded'}</dd></div>
                <div><dt>Booked by</dt><dd>{b.createdBy || 'Not recorded'}</dd></div>
                <div><dt>Booking created</dt><dd>{createdLabel(b.createdAt)}{b.createdAt && <small>Maldives time</small>}</dd></div>
              </dl></details>
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className="excursion-guest-empty"><strong>No confirmed guests for this excursion yet.</strong><p>Pending, declined and cancelled bookings are not included.</p></div>}
      </>}
    </div>
    <footer className="excursion-guest-footer">
      {manifest && <div className="excursion-guest-totals" aria-live="polite"><div><span>Confirmed bookings: <strong>{manifest.totals.bookings}</strong></span><span>Total guests (pax): <strong>{manifest.totals.pax}</strong></span></div>
        <small>{manifest.totals.sharedTrips > 1 ? 'Shared boat occupancy' : 'Scheduled boat occupancy'}: {manifest.totals.boatPax} / {manifest.totals.capacity}
          {manifest.totals.sharedTrips > 1 && <> across {manifest.totals.sharedTrips} excursions; this list shows only the selected excursion.</>}
          {manifest.totals.extraVesselPax > 0 && <> · {manifest.totals.extraVesselPax} guests on extra vessels for this excursion (not counted in scheduled boat occupancy).</>}</small>
      </div>}
      <button type="button" className="excursion-guest-button" onClick={onClose}>Close</button>
    </footer>
  </dialog>;
}
