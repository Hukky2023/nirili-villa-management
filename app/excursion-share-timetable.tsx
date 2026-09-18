'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {formatExcursionTimetable, timetableDateLabel, timetableSnapshotLabel} from '../lib/excursion-timetable';
import type {ExcursionTimetable} from '../lib/excursion-timetable';
import './excursion-share-timetable.css';

export default function ExcursionShareTimetable({date, disabled = false}: {date: string; disabled?: boolean}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const messageBox = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<ExcursionTimetable | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const data = snapshot?.date === date ? snapshot : null;
  const text = data ? formatExcursionTimetable(data) : '';
  const ready = !!data?.trips.length && !loading && !busy;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setSnapshot(null); setError(''); setNotice(''); setManualCopy(false);
    async function load() {
      try {
        const response = await fetch('/api/excursion-timetable?date=' + encodeURIComponent(date), {cache: 'no-store', signal: controller.signal});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load the timetable.');
        if (result.timetable?.date !== date || !Array.isArray(result.timetable?.trips)) throw new Error('The timetable changed. Please refresh it.');
        if (!controller.signal.aborted) setSnapshot(result.timetable);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load the timetable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [open, date, revision]);

  useEffect(() => {
    if (manualCopy) { messageBox.current?.focus(); messageBox.current?.select(); }
  }, [manualCopy]);

  function show() {
    setSnapshot(null); setError(''); setNotice(''); setLoading(true); setOpen(true);
    dialog.current?.showModal();
  }
  function close() { dialog.current?.close(); setOpen(false); }
  async function share() {
    if (!ready) return;
    setNotice('');
    if (!navigator.share) { setNotice('Use WhatsApp or Copy timetable to share from this browser.'); return; }
    setBusy(true);
    try {
      // Snapshot is already loaded: do not await a fetch before the native share gesture.
      await navigator.share({title: 'Nirili Villa excursion timetable - ' + date, text});
      setNotice('Timetable handed to your selected sharing app.');
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === 'AbortError')) setNotice('Sharing could not open. Use WhatsApp or Copy timetable instead.');
    } finally { setBusy(false); }
  }
  async function copy() {
    if (!ready) return;
    setBusy(true); setNotice('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setNotice('Timetable copied. Paste it into your message.');
    } catch {
      setManualCopy(true);
      setNotice('Select and copy the timetable message below.');
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" className="excursion-secondary-btn excursion-share-trigger" disabled={disabled} onClick={show}>Share timetable</button>
    <dialog ref={dialog} className="excursion-share-dialog" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className="excursion-share-heading"><div><small>NIRILI VILLA · EXCURSIONS</small><h3 id={titleId}>Share timetable</h3><p>{timetableDateLabel(date)} · Maldives time (UTC+5)</p></div><button type="button" className="excursion-share-close" onClick={close} aria-label="Close timetable">×</button></header>
      <div className="excursion-share-body" aria-busy={loading}>
        <p className="excursion-share-info">Share this day's trips, confirmed passenger counts, assigned vessels and crews. Guest names, phone numbers and payment details are not included.</p>
        {loading && <p role="status">Loading the latest timetable…</p>}
        {error && <p className="excursion-share-error" role="alert">{error}</p>}
        {data && !loading && <>
          <div className="excursion-share-summary"><strong>{data.totals.trips} scheduled trips</strong><strong>{data.totals.pax} confirmed passenger places</strong></div>
          {!data.trips.length ? <p>No scheduled trips for this date. Choose another date in Schedule.</p> : <div className="excursion-share-table-wrap"><table className="excursion-share-table"><thead><tr><th>Time</th><th>Excursion / trip</th><th>Confirmed pax</th><th>Assigned vessel</th><th>Assigned crew</th></tr></thead><tbody>
            {data.trips.map(trip => <tr key={trip.id}>
              <td data-label="Time"><strong>{trip.time}</strong>{trip.endTime&&<small>Ends {trip.endTime}</small>}</td>
              <td data-label="Excursion / trip"><strong>{trip.name}</strong>{trip.status !== 'Open' && <small>Booking status: {trip.status}</small>}{trip.sharedTrips > 1 && <small>Shared boat: {trip.sharedBoatPax} / {trip.capacity} pax across {trip.sharedTrips} trips (combined).</small>}</td>
              <td data-label="Confirmed pax"><strong>{trip.confirmedPax}</strong>{trip.extraVessels.length > 0 && <small>{trip.mainVesselPax} on main vessel; {trip.confirmedPax - trip.mainVesselPax} on extra vessels.</small>}</td>
              <td data-label="Assigned vessel">{trip.vessel}{trip.extraVessels.map((extra, index) => <small key={index}>Extra: {extra.vessel} · {extra.pax} pax</small>)}</td>
              <td data-label="Assigned crew">{trip.crew.join(', ') || 'Not assigned'}{trip.extraVessels.map((extra, index) => <small key={index}>{extra.vessel}: {extra.crew.join(', ') || 'Not assigned'}</small>)}</td>
            </tr>)}
          </tbody></table></div>}
          <p className="excursion-share-info">Passenger places are counted per trip, not as unique people. Extra-vessel passengers are included. Pending, declined and cancelled bookings are excluded.</p>
          <p className="excursion-share-snapshot">Snapshot: {timetableSnapshotLabel(data.generatedAt)} Maldives time. Refresh this preview to include later changes.</p>
          {data.trips.length > 0 && <details open={manualCopy || undefined} className="excursion-share-message"><summary>View message / copy manually</summary><textarea ref={messageBox} readOnly value={text} aria-label="Timetable message" rows={12}/></details>}
        </>}
        {notice && <p role="status" className="excursion-share-notice">{notice}</p>}
      </div>
      <footer className="excursion-share-footer">
        <button type="button" disabled={loading || busy} onClick={() => {setLoading(true); setSnapshot(null); setRevision(value => value + 1);}}>Refresh</button>
        <button type="button" disabled={!ready} onClick={copy}>Copy timetable</button>
        {ready && <a href={'https://wa.me/?text=' + encodeURIComponent(text)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <button type="button" className="excursion-share-primary" disabled={!ready} onClick={share}>{busy ? 'Please wait…' : 'Share timetable'}</button>
      </footer>
    </dialog>
  </>;
}
