'use client';

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {ExcursionManifest} from '../lib/excursion-manifest';
import './excursion-guest-list.css';

const money = (cents: number) => '$' + (cents / 100).toFixed(2);
const dateLabel = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : 'Not recorded';
const ageCategoryLabel=(value:string)=>value==='child'?'Child (3–11)':value==='infant'?'Under 3':'Adult (12+)';
const tripStatuses = ['Excursion scheduled', 'Guests boarded', 'Departed', 'Arrived', 'Completed'] as const;
type TripStatus = typeof tripStatuses[number];
type DraftPerson = {id: string; name: string; boarded: boolean};
type DraftRoster = {bookingId: string; people: DraftPerson[]};

function createdLabel(value: string) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Indian/Maldives', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}
function rosterFrom(manifest: ExcursionManifest): DraftRoster[] {
  return manifest.bookings.map(booking => ({
    bookingId: booking.id,
    people: booking.people.map(person => ({id: person.id, name: person.name, boarded: person.boarded})),
  }));
}
function currentTripStatus(manifest: ExcursionManifest | null): TripStatus {
  const value = manifest?.trip.tripStatus as TripStatus | undefined;
  return value && tripStatuses.includes(value) ? value : 'Excursion scheduled';
}

type Props = {scheduleId: string; tripName: string; date: string};

export default function ExcursionGuestListButton({scheduleId, tripName, date}: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button type="button" className="excursion-secondary-btn excursion-view-btn" aria-haspopup="dialog"
      aria-label={'View guest list for ' + tripName} onClick={() => setOpen(true)}>View</button>
    {open && createPortal(<GuestListDialog key={scheduleId+'|'+date} scheduleId={scheduleId} tripName={tripName} date={date} onClose={close}/>, document.body)}
  </>;
}

function GuestListDialog({scheduleId, tripName, date, onClose}: Props & {onClose: () => void}) {
  const [manifest, setManifest] = useState<ExcursionManifest | null>(null);
  const [rosters, setRosters] = useState<DraftRoster[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [savingAttendance, setSavingAttendance] = useState(false), [statusBusy, setStatusBusy] = useState(false);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId(), descriptionId = useId();

  const applyManifest = useCallback((next: ExcursionManifest, forceRoster = false) => {
    setManifest(next);
    if (forceRoster || !dirtyRef.current) {
      setRosters(rosterFrom(next));
      dirtyRef.current = false;
      setDirty(false);
    }
  }, []);

  const load = useCallback(async (background = false) => {
    if (background && (request.current || dirtyRef.current)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!background) setLoading(true);
    try {
      const response = await fetch('/api/excursion-manifest?scheduleId=' + encodeURIComponent(scheduleId) + '&date=' + encodeURIComponent(date), {
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
      applyManifest(result.manifest, !background); setError('');
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load the guest list.');
    } finally {
      if (request.current === controller) {request.current = null; setLoading(false);}
    }
  }, [scheduleId, date, applyManifest]);

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

  function changePerson(bookingId: string, personId: string, change: Partial<DraftPerson>) {
    dirtyRef.current = true; setDirty(true); setNotice('Boarding list has unsaved changes.');
    setRosters(current => current.map(roster => roster.bookingId !== bookingId ? roster : {
      ...roster, people: roster.people.map(person => person.id === personId ? {...person, ...change} : person),
    }));
  }
  function setBookingBoarded(bookingId: string, boarded: boolean) {
    dirtyRef.current = true; setDirty(true); setNotice('Boarding list has unsaved changes.');
    setRosters(current => current.map(roster => roster.bookingId !== bookingId ? roster : {
      ...roster, people: roster.people.map(person => ({...person, boarded})),
    }));
  }

  async function saveAttendance() {
    if (!manifest || savingAttendance || statusBusy) return;
    const missing = rosters.flatMap(roster => roster.people).find(person => !person.name.trim());
    if (missing) {setError('Enter every guest name before saving the boarding list.'); return;}
    setSavingAttendance(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/excursion-manifest', {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'save-attendance', scheduleId, date, rosters}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the boarding list.');
      if (!result.manifest) throw new Error('The saved boarding list could not be read. Refresh and try again.');
      dirtyRef.current = false; setDirty(false); applyManifest(result.manifest, true);
      setNotice('Guest names and boarding attendance saved.');
      window.dispatchEvent(new Event('services-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the boarding list.');
    } finally {setSavingAttendance(false);}
  }

  async function advanceStatus() {
    if (!manifest || statusBusy || savingAttendance) return;
    if (dirtyRef.current) {setError('Save the boarding list before changing the excursion status.'); return;}
    const current = currentTripStatus(manifest), index = tripStatuses.indexOf(current), next = tripStatuses[index + 1];
    if (!next) return;
    setStatusBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/excursion-manifest', {
        method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'trip-status', scheduleId, date, status: next}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the excursion status.');
      if (!result.manifest) throw new Error('The updated excursion status could not be read. Refresh and try again.');
      applyManifest(result.manifest, true);
      setNotice('Excursion status updated to ' + next + '.');
      window.dispatchEvent(new Event('nirili:auto-refresh'));
      window.dispatchEvent(new Event('services-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the excursion status.');
    } finally {setStatusBusy(false);}
  }

  const status = currentTripStatus(manifest);
  const statusIndex = tripStatuses.indexOf(status);
  const nextStatus = tripStatuses[statusIndex + 1] as TripStatus | undefined;
  const people = rosters.flatMap(roster => roster.people);
  const boarded = people.filter(person => person.boarded).length;
  const notBoarded = Math.max(0, people.length - boarded);
  const missingNames = people.some(person => !person.name.trim());
  const attendanceSaved = !!manifest?.bookings.length && manifest.bookings.every(booking => !!booking.attendanceReviewedAt && booking.people.every(person => person.nameRecorded));
  const canAdvance = !!nextStatus && !dirty && !savingAttendance && !statusBusy &&
    (nextStatus !== 'Guests boarded' || (attendanceSaved && boarded > 0 && !missingNames));

  return <dialog ref={dialog} className="excursion-guest-dialog" aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => {event.preventDefault(); onClose();}}>
    <header className="excursion-guest-header">
      <div><h2 id={headingId}>Guest list & trip status</h2><h3>{manifest?.trip.name || tripName}</h3>
        {manifest && <div className="excursion-guest-meta"><span>{dateLabel(manifest.trip.date)}</span><span>{manifest.trip.time}{manifest.trip.endTime?'–'+manifest.trip.endTime:''} · Maldives time</span>
          <span>{manifest.totals.pax} confirmed guests</span><span className={'excursion-guest-badge trip-status lifecycle-'+statusIndex}>{status}</span>
          <span className="excursion-booking-open-state">Bookings: {manifest.trip.status}</span></div>}
      </div>
      <button type="button" className="excursion-guest-close" aria-label="Close guest list" onClick={onClose}>×</button>
    </header>
    <div className="excursion-guest-body" aria-busy={loading || savingAttendance || statusBusy}>
      <div className="excursion-guest-toolbar"><p id={descriptionId}>Record every guest by name, tick the guests who actually board, and leave anyone who does not go unticked.</p>
        <button type="button" className="excursion-guest-button" disabled={loading || dirty || savingAttendance || statusBusy} onClick={() => void load()}>{loading ? 'Loading…' : 'Refresh guest list'}</button></div>

      {manifest && <section className="excursion-trip-lifecycle" aria-label="Excursion status">
        <div className="excursion-status-steps">{tripStatuses.map((step, index) => <div key={step} className={'excursion-status-step '+(index < statusIndex?'done ':index===statusIndex?'current ':'')+(index>statusIndex?'future':'')}>
          <span>{index < statusIndex ? '✓' : index + 1}</span><strong>{step}</strong>
        </div>)}</div>
        <div className="excursion-status-action">
          <div><strong>Current status: {status}</strong><small>{status==='Completed'?'This excursion is completed.':nextStatus?'Next status: '+nextStatus:''}</small></div>
          {nextStatus && <button type="button" className="excursion-status-next" disabled={!canAdvance}
            title={dirty?'Save the boarding list first.':nextStatus==='Guests boarded'&&!attendanceSaved?'Save the complete guest list first.':''}
            onClick={advanceStatus}>{statusBusy?'Updating…':'Mark '+nextStatus}</button>}
        </div>
      </section>}

      {error && <div className="excursion-guest-error" role="alert"><strong>{error}</strong>{manifest && <p>Your last loaded guest list is still shown below.</p>}</div>}
      {notice && <div className="excursion-guest-notice" role="status">{notice}</div>}
      {loading && !manifest && <p className="excursion-guest-empty" role="status">Loading confirmed guests…</p>}

      {manifest && <>
        <dl className="excursion-guest-assignment"><div><dt>Scheduled vessel</dt><dd>{manifest.trip.vessel}</dd></div>
          <div><dt>Assigned crew</dt><dd>{manifest.trip.crew.join(', ') || 'Not assigned'}</dd></div>
          {manifest.trip.notes && <div className="trip-notes"><dt>Trip notes / meeting instructions</dt><dd>{manifest.trip.notes}</dd></div>}</dl>

        {manifest.bookings.length ? <section className="excursion-boarding-section" aria-labelledby="boarding-heading">
          <header className="excursion-boarding-head"><div><small>BOARDING CHECKLIST</small><h3 id="boarding-heading">Every guest on this excursion</h3><p>Tick only the people who actually board. Unticked guests remain recorded as not boarded / did not go.</p></div>
            <div className="excursion-boarding-counts"><span><strong>{boarded}</strong> boarded</span><span><strong>{notBoarded}</strong> not boarded</span></div></header>
          <div className="excursion-boarding-bookings">{manifest.bookings.map(booking => {
            const roster = rosters.find(item => item.bookingId === booking.id);
            const rosterPeople = roster?.people || [];
            const allBoarded = rosterPeople.length > 0 && rosterPeople.every(person => person.boarded);
            return <article key={booking.id} className="excursion-boarding-booking">
              <header><div><strong>{booking.groupName||booking.guest}</strong>{booking.groupName&&<small>Lead guest: {booking.guest}</small>}<small>{booking.id} · {booking.guestType}{booking.room?' · Room '+booking.room:''}</small></div>
                <div className="excursion-boarding-booking-actions"><span>{booking.guests} pax</span><button type="button" disabled={status==='Completed'||savingAttendance||statusBusy} onClick={()=>setBookingBoarded(booking.id,!allBoarded)}>{allBoarded?'Untick all':'Tick all'}</button></div></header>
              <div className="excursion-person-list">{rosterPeople.map((person, index) => <label key={person.id} className={'excursion-person '+(person.boarded?'boarded':'not-boarded')}>
                <input className="excursion-person-check" type="checkbox" checked={person.boarded} disabled={status==='Completed'||savingAttendance||statusBusy}
                  onChange={event=>changePerson(booking.id,person.id,{boarded:event.target.checked})}/>
                <span className="excursion-person-number">{index+1}</span>
                <span className="excursion-person-name"><span>Guest name</span><input required maxLength={100} value={person.name} disabled={status==='Completed'||savingAttendance||statusBusy}
                  placeholder={index===0?booking.guest:'Guest '+(index+1)+' full name'} onChange={event=>changePerson(booking.id,person.id,{name:event.target.value})}/><small className="excursion-age-category">{ageCategoryLabel(booking.people[index]?.ageCategory||'adult')}</small>{booking.people[index]?.footSize&&<small className="excursion-foot-size">Foot size: EU {booking.people[index].footSize}</small>}</span>
                <strong className="excursion-person-state">{person.boarded?'Boarded':'Not boarded'}</strong>
              </label>)}</div>
            </article>;
          })}</div>
          <div className="excursion-boarding-save"><div><strong>{missingNames?'Guest names still missing':dirty?'Unsaved boarding changes':attendanceSaved?'Boarding list saved':'Review and save the boarding list'}</strong><small>Save before changing the trip status to Guests boarded.</small></div>
            <button type="button" className="excursion-save-attendance" disabled={savingAttendance||statusBusy||missingNames||!dirty} onClick={saveAttendance}>{savingAttendance?'Saving…':'Save boarding list'}</button></div>
        </section> : <div className="excursion-guest-empty"><strong>No confirmed guests for this excursion yet.</strong><p>Pending, declined and cancelled bookings are not included.</p></div>}

        {manifest.bookings.length ? <details className="excursion-booking-detail-section"><summary>View booking details</summary><div className="excursion-guest-table-wrap"><table className="excursion-guest-table">
          <caption className="excursion-guest-sr-only">Confirmed bookings and guest details for {manifest.trip.name}</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Lead guest</th><th scope="col">Booking type</th><th scope="col">Hotel</th><th scope="col">Room no.</th><th scope="col">Phone / WhatsApp</th><th scope="col">Pax</th><th scope="col">Payment</th><th scope="col">Details</th></tr></thead>
          <tbody>{manifest.bookings.map((b, index) => <tr key={b.id}>
            <td data-label="#">{index + 1}</td>
            <td data-label="Lead guest"><div><strong>{b.guest}</strong>{b.groupName&&<small>{b.groupName}</small>}<small className="excursion-guest-reference">{b.id}</small></div></td>
            <td data-label="Booking type"><span className={'excursion-guest-badge ' + (b.guestType === 'In-house' ? 'inhouse' : 'walkin')}>{b.guestType}</span></td>
            <td data-label="Hotel">{b.hotel || 'Not recorded'}</td>
            <td data-label="Room no.">{b.room || 'Not recorded'}</td>
            <td data-label="Phone / WhatsApp">{b.phone || 'Not recorded'}</td>
            <td data-label="Pax"><strong>{b.guests}</strong></td>
            <td data-label="Payment"><div><span className={'excursion-guest-badge ' + b.paymentStatus.toLowerCase()}>{b.paymentStatus}</span><small>{money(b.totalCents)} USD · group total</small></div></td>
            <td data-label="Details"><div className="excursion-guest-notes"><p>{b.notes || 'No notes recorded'}</p>
              {b.separateVessel && <p><strong>Extra vessel: {b.vessel}</strong></p>}
              <details><summary>More details</summary><dl>
                <div><dt>Booking reference</dt><dd>{b.id}</dd></div>
                <div><dt>Excursion booked</dt><dd>{b.excursion}</dd></div>
                <div><dt>Trip date / time</dt><dd>{dateLabel(b.date)} · {b.time}{b.endTime?'–'+b.endTime:''} · Maldives time</dd></div>
                <div><dt>Trip status</dt><dd>{b.tripStatus}</dd></div>
                <div><dt>Assigned vessel</dt><dd>{b.vessel}</dd></div>
                <div><dt>Assigned crew</dt><dd>{b.crew.join(', ') || 'Not assigned'}</dd></div>{b.footSizes.length>0&&<div><dt>Snorkeling foot sizes</dt><dd>{b.footSizes.map((size,index)=>'Guest '+(index+1)+': EU '+size).join(' · ')}</dd></div>}
                <div><dt>Booking source</dt><dd>{b.source || 'Not recorded'}</dd></div>
                <div><dt>Booked by</dt><dd>{b.createdBy || 'Not recorded'}</dd></div>
                <div><dt>Booking created</dt><dd>{createdLabel(b.createdAt)}{b.createdAt && <small>Maldives time</small>}</dd></div>
              </dl></details>
            </div></td>
          </tr>)}</tbody>
        </table></div></details> : null}
      </>}
    </div>

    <footer className="excursion-guest-footer">
      {manifest && <div className="excursion-guest-totals" aria-live="polite"><div><span>Confirmed bookings: <strong>{manifest.totals.bookings}</strong></span><span>Total guests: <strong>{manifest.totals.pax}</strong></span><span>Boarded: <strong>{boarded}</strong></span><span>Did not board: <strong>{notBoarded}</strong></span></div>
        <small>{manifest.totals.sharedTrips > 1 ? 'Shared boat occupancy' : 'Scheduled boat occupancy'}: {manifest.totals.boatPax} / {manifest.totals.capacity}
          {manifest.totals.sharedTrips > 1 && <> across {manifest.totals.sharedTrips} excursions; this list includes all confirmed guests sharing the departure.</>}
          {manifest.totals.extraVesselPax > 0 && <> · {manifest.totals.extraVesselPax} guests on extra vessels.</>}</small>
      </div>}
      <button type="button" className="excursion-guest-button" disabled={savingAttendance||statusBusy} onClick={onClose}>Close</button>
    </footer>
  </dialog>;
}
