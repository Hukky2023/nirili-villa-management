'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ConfirmedExcursionBooking} from '../lib/excursion-bookings';
import './excursion-bookings.css';
import DateFieldDMY from './date-field-dmy';

const pageSize = 25;
const money = (cents: number) => '$' + (cents / 100).toFixed(2);
const dateLabel = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('-') : 'Not recorded';
function createdLabel(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Not recorded';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Indian/Maldives', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
}

export default function ExcursionBookings() {
  const [bookings, setBookings] = useState<ConfirmedExcursionBooking[]>([]);
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [query, setQuery] = useState('');
  const [date, setDate] = useState(''), [payment, setPayment] = useState('');
  const [page, setPage] = useState(1);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (background = false) => {
    // Do not let background refresh interrupt an in-flight request.
    if (background && request.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!background) setLoading(true);
    try {
      const response = await fetch('/api/excursion-bookings', {cache: 'no-store', signal: controller.signal});
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {setBookings([]); setLoaded(false);}
        throw new Error(result.error || 'Could not load confirmed excursion bookings.');
      }
      if (!Array.isArray(result.bookings)) throw new Error('The booking list could not be read. Please refresh.');
      if (!controller.signal.aborted) {setBookings(result.bookings); setLoaded(true); setError('');}
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load bookings. Please try again.');
    } finally {
      if (request.current === controller) {request.current = null; setLoading(false);}
    }
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bookings.filter(b => (!date || b.date === date) && (!payment || b.paymentStatus === payment) && (!needle ||
      [b.id, b.guest, b.phone, b.excursion, b.hotel, b.room, b.vessel, ...b.crew].join(' ').toLowerCase().includes(needle)));
  }, [bookings, query, date, payment]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const guests = filtered.reduce((sum, b) => sum + b.guests, 0);
  const total = filtered.reduce((sum, b) => sum + b.totalCents, 0);
  const hasFilters = !!(query || date || payment);
  function clearFilters() {setQuery(''); setDate(''); setPayment(''); setPage(1);}

  return <section className="excursion-panel excursion-bookings-panel" aria-labelledby="excursion-bookings-heading">
    <div className="excursion-panel-head">
      <div><h3 id="excursion-bookings-heading">Confirmed excursion bookings</h3><p>All confirmed bookings, across all dates. Pending, declined and cancelled requests are not included.</p></div>
      <button type="button" className="excursion-secondary-btn" disabled={loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Refresh bookings'}</button>
    </div>
    <div className="excursion-booking-filters">
      <label>Search bookings<input type="search" value={query} placeholder="Guest, room, booking reference or excursion" onChange={e => {setQuery(e.target.value); setPage(1);}}/></label>
      <label>Trip date<DateFieldDMY value={date} onChange={value => {setDate(value); setPage(1);}} ariaLabel="Trip date"/></label>
      <label>Payment<select value={payment} onChange={e => {setPayment(e.target.value); setPage(1);}}><option value="">All payments</option><option value="Paid">Paid</option><option value="Unpaid">Unpaid</option></select></label>
      <button type="button" className="excursion-secondary-btn" disabled={!hasFilters} onClick={clearFilters}>Clear filters</button>
    </div>
    {error && <div className="excursion-booking-error" role="alert"><strong>{error}</strong>{loaded && <p>The list below is the last successfully loaded data and may be out of date.</p>}</div>}
    {loading && !loaded ? <div className="excursion-empty-state" role="status">Loading confirmed bookings…</div> : loaded && <>
      <div className="excursion-booking-totals" aria-live="polite">
        <span><strong>{filtered.length}</strong> {hasFilters ? 'matching' : 'confirmed'} bookings</span>
        <span><strong>{guests}</strong> guests</span><span><strong>{money(total)}</strong> total booking value (USD)</span>
      </div>
      {visible.length ? <div className="excursion-booking-list">{visible.map(b => <article className="excursion-confirmed-booking" key={b.id}>
        <header className="excursion-booking-card-head"><div><small>{b.id}</small><h4>{b.excursion}</h4></div><div className="excursion-booking-badges"><span className="confirmed">Confirmed</span><span className={b.paymentStatus.toLowerCase()}>{b.paymentStatus}</span>{b.buggyRequested&&<span className="buggy">Buggy requested</span>}</div></header>
        <dl className="excursion-booking-overview">
          <div><dt>Guest</dt><dd>{b.guest}<small>{b.guestType}</small></dd></div>
          <div><dt>Hotel / room</dt><dd>{b.hotel || 'Hotel not recorded'}<small>{b.room ? 'Room ' + b.room : 'Room not recorded'}</small></dd></div>
          <div><dt>Booked for</dt><dd>{dateLabel(b.date)}<small>{b.time || 'Time not assigned yet'} · Maldives time</small></dd></div>
          <div><dt>Booking created</dt><dd>{createdLabel(b.createdAt)}<small>Maldives time</small></dd></div>
          <div><dt>Guests / total</dt><dd>{b.guests} {b.guests === 1 ? 'guest' : 'guests'}<small>{money(b.totalCents)} USD</small></dd></div>
        </dl>
        <details className="excursion-booking-details"><summary>View details<span className="excursion-booking-sr-only"> for {b.guest}, booking {b.id}</span></summary>
          <dl>
            <div><dt>Phone / WhatsApp</dt><dd>{b.phone || 'Not recorded'}</dd></div>
            <div><dt>Vessel</dt><dd>{b.vessel}{b.separateVessel && <small>Extra vessel booking</small>}</dd></div>
            <div><dt>Assigned crew</dt><dd>{b.crew.length ? b.crew.join(', ') : 'Not assigned'}</dd></div>
            <div><dt>Trip status</dt><dd>{b.tripStatus}</dd></div>
            <div><dt>Buggy pickup</dt><dd>{b.buggyRequested ? 'Requested' : 'Not requested'}</dd></div>
            <div><dt>Payment status</dt><dd>{b.paymentStatus} · {money(b.totalCents)} USD</dd></div>
            <div><dt>Booking source</dt><dd>{b.source || 'Not recorded'}</dd></div>
            <div><dt>Booked by</dt><dd>{b.createdBy || 'Not recorded'}</dd></div>
            <div><dt>Booking created</dt><dd>{createdLabel(b.createdAt)}{b.createdAt && <small>Maldives time</small>}</dd></div>
            <div className="excursion-booking-notes"><dt>Notes / special requests</dt><dd>{b.notes || 'No notes'}</dd></div>
          </dl>
        </details>
      </article>)}</div> : <div className="excursion-empty-state"><strong>{hasFilters ? 'No bookings match your filters' : 'No confirmed excursion bookings yet'}</strong><p>{hasFilters ? 'Clear the filters to see all confirmed bookings.' : 'Confirmed excursion bookings will appear here automatically.'}</p></div>}
      {pages > 1 && <nav className="excursion-booking-pagination" aria-label="Confirmed booking pages"><button type="button" className="excursion-secondary-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages} · {filtered.length} bookings</span><button type="button" className="excursion-secondary-btn" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </>}
  </section>;
}
