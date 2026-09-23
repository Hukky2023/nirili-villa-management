'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ConfirmedExcursionBooking} from '../lib/excursion-bookings';
import './excursion-bookings.css';
import DateFieldDMY from './date-field-dmy';
import ExcursionBillingActions from './excursion-billing-actions';
import type {ExcursionPricing} from '../lib/excursion-billing';
type BillingBooking = ConfirmedExcursionBooking & {pricing?: ExcursionPricing; billingHistory?: any[]};

const pageSize = 25;
const money = (cents: number) => '$' + (cents / 100).toFixed(2);
const dateLabel = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('-') : 'Not recorded';
const ageLabel = (category: string) => category === 'child' ? 'Child (3–11)' : category === 'infant' ? 'Under 3' : category === 'adult' ? 'Adult (12+)' : 'Age not recorded';
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
  const [bookings, setBookings] = useState<BillingBooking[]>([]);
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [query, setQuery] = useState('');
  const [date, setDate] = useState(''), [payment, setPayment] = useState('');
  const [page, setPage] = useState(1);
  const [canAdjustBilling, setCanAdjustBilling] = useState(false), [canReassign,setCanReassign]=useState(false), [revision, setRevision] = useState(0);
  const [manageRequests,setManageRequests]=useState<any[]>([]),[manageBusy,setManageBusy]=useState(''),[manageMessage,setManageMessage]=useState('');
  const [moveBooking,setMoveBooking]=useState<BillingBooking|null>(null),[moveDate,setMoveDate]=useState(''),[moveSchedules,setMoveSchedules]=useState<any[]>([]),[moveScheduleId,setMoveScheduleId]=useState('');
  const [moveRevision,setMoveRevision]=useState(0),[moveBusy,setMoveBusy]=useState(false),[moveLoading,setMoveLoading]=useState(false),[moveError,setMoveError]=useState(''),[moveNote,setMoveNote]=useState('');
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
        if (response.status === 401 || response.status === 403) {setBookings([]); setLoaded(false); setCanAdjustBilling(false); setCanReassign(false);}
        throw new Error(result.error || 'Could not load confirmed excursion bookings.');
      }
      if (!Array.isArray(result.bookings)) throw new Error('The booking list could not be read. Please refresh.');
      if (!controller.signal.aborted) {setBookings(result.bookings); setManageRequests(Array.isArray(result.manageRequests)?result.manageRequests:[]); setRevision(result.revision); setCanAdjustBilling(result.canAdjustBilling === true); setCanReassign(result.canReassign === true); setLoaded(true); setError('');}
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
    return bookings.filter(b => (!date || b.date === date) && (!payment || (b.pricing?.complimentary ? 'Complimentary' : b.paymentStatus) === payment) && (!needle ||
      [b.id, b.packageGroupId, b.packageName, b.guest, b.groupName, b.phone, b.excursion, b.hotel, b.room, b.vessel, ...b.crew].join(' ').toLowerCase().includes(needle)));
  }, [bookings, query, date, payment]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const guests = filtered.reduce((sum, b) => sum + b.guests, 0);
  const total = filtered.reduce((sum, b) => sum + b.totalCents, 0);
  const hasFilters = !!(query || date || payment);
  function clearFilters() {setQuery(''); setDate(''); setPayment(''); setPage(1);}
  function bookingCanMove(b:BillingBooking){
    return canReassign&&b.serviceType!=='romantic-beach-dinner'&&!b.privateBoatRequested&&!b.separateVessel&&!/(Departed|Completed|Arrived)/i.test(String(b.tripStatus||''));
  }
  async function loadMoveOptions(booking:BillingBooking,targetDate:string){
    setMoveLoading(true);setMoveError('');setMoveScheduleId('');
    try{
      const response=await fetch('/api/excursion-bookings?bookingId='+encodeURIComponent(booking.id)+'&scheduleDate='+encodeURIComponent(targetDate),{cache:'no-store'});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Could not load available trips.');
      setMoveSchedules(Array.isArray(result.schedules)?result.schedules:[]);
      setMoveRevision(Number(result.revision)||revision);
    }catch(e){setMoveSchedules([]);setMoveError(e instanceof Error?e.message:'Could not load available trips.');}
    finally{setMoveLoading(false);}
  }
  async function openMove(booking:BillingBooking){
    setMoveBooking(booking);setMoveDate(booking.date);setMoveNote('');setMoveError('');setMoveSchedules([]);setMoveScheduleId('');setMoveRevision(revision);
    await loadMoveOptions(booking,booking.date);
  }
  async function changeMoveDate(value:string){
    setMoveDate(value);
    if(moveBooking&&value)await loadMoveOptions(moveBooking,value);
  }
  async function submitMove(){
    if(!moveBooking||!moveScheduleId||moveBusy)return;
    const target=moveSchedules.find((item:any)=>item.id===moveScheduleId);
    if(!target){setMoveError('Choose an available trip.');return;}
    if(target.current){setMoveError('These guests are already assigned to this trip. Choose another trip.');return;}
    let allowIncompatible=false;
    if(!target.compatible){
      allowIncompatible=window.confirm('This trip does not normally serve '+moveBooking.excursion+'. Move these guests there as a manual override?');
      if(!allowIncompatible)return;
    }
    if(!window.confirm('Move '+moveBooking.guests+' guest'+(moveBooking.guests===1?'':'s')+' from '+dateLabel(moveBooking.date)+' '+moveBooking.time+' to '+dateLabel(target.date)+' '+target.time+' · '+target.name+'?'))return;
    setMoveBusy(true);setMoveError('');
    try{
      const response=await fetch('/api/excursion-bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reassign-booking',id:moveBooking.id,revision:moveRevision,scheduleId:target.id,scheduleDate:target.date,note:moveNote,allowIncompatible})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Could not reassign this booking.');
      setManageMessage('Moved '+moveBooking.guests+' guest'+(moveBooking.guests===1?'':'s')+' to '+result.assignment.time+' · '+result.assignment.scheduleName+'.'+(result.email?.sent?' Guest email sent.':''));
      setMoveBooking(null);setMoveSchedules([]);setMoveScheduleId('');setMoveNote('');
      await load();window.dispatchEvent(new Event('services-updated'));
    }catch(e){setMoveError(e instanceof Error?e.message:'Could not reassign this booking.');}
    finally{setMoveBusy(false);}
  }

  async function decideManageRequest(item:any,approve:boolean){
    if(manageBusy)return;
    const note=prompt(approve?'Optional note for the guest:':'Optional reason for rejecting this request:','')||'';
    const action='manage-'+item.type+'-'+(approve?'approve':'reject');
    if(approve&&!confirm((item.type==='cancel'?'Approve cancellation for ':'Approve requested changes for ')+item.bookingId+'?'))return;
    setManageBusy(item.id);setManageMessage('');
    try{
      const response=await fetch('/api/excursion-bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:item.id,revision,note})}),result=await response.json();
      if(!response.ok)throw Error(result.error||'Could not review guest request.');
      if(item.type==='cancel'&&approve){
        setManageMessage('Cancellation approved.'+(result.decision?.refundRequiredCents?' Refund required: '+money(result.decision.refundRequiredCents)+'.':'')+(result.email?.sent?' Email sent.':''));
      }else if(approve&&result.decision?.autoAssigned){
        setManageMessage('Guest changes approved and automatically assigned to '+(result.decision.time||'the available trip')+(result.decision.scheduleName?' · '+result.decision.scheduleName:'')+'.'+(result.email?.sent?' Guest email sent.':''));
      }else if(approve&&result.decision?.logisticsChanged){
        setManageMessage('Guest changes approved. No compatible trip with enough seats was available, so the booking is Awaiting Scheduling.'+(result.email?.sent?' Guest email sent.':''));
      }else{
        setManageMessage((approve?'Guest changes approved.':'Guest request rejected.')+(result.email?.sent?' Email sent.':''));
      }
      await load();
      window.dispatchEvent(new Event('services-updated'));
    }catch(e){setManageMessage(e instanceof Error?e.message:'Could not review guest request.');}
    finally{setManageBusy('');}
  }

  return <section className="excursion-panel excursion-bookings-panel" aria-labelledby="excursion-bookings-heading">
    <div className="excursion-panel-head">
      <div><h3 id="excursion-bookings-heading">Confirmed excursion bookings</h3><p>All confirmed bookings, across all dates. Pending, declined and cancelled requests are not included.</p></div>
      <button type="button" className="excursion-secondary-btn" disabled={loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Refresh bookings'}</button>
    </div>
    {manageRequests.length>0&&<section className="excursion-manage-requests"><div className="excursion-manage-requests-head"><div><small>GUEST SELF-SERVICE</small><h4>Change & cancellation requests</h4><p>Confirmed external excursion bookings stay unchanged until you approve a guest request.</p></div><strong>{manageRequests.length}</strong></div>{manageMessage&&<p className="excursion-manage-message" role="status">{manageMessage}</p>}<div className="excursion-manage-request-list">{manageRequests.map(item=><article key={item.id}><div><small>{item.id} · {item.bookingId}</small><h5>{item.type==='cancel'?'Cancellation request':'Change request'} · {item.guest}</h5><p><strong>Current:</strong> {item.excursion} · {dateLabel(item.date)}{item.time?' · '+item.time:''} · {item.quantity} guests</p>{item.type==='change'&&item.proposed&&<p><strong>Requested:</strong> {item.proposed.name} · {dateLabel(item.proposed.date)} · {item.proposed.quantity} guests · {item.proposed.hotel}</p>}<small>{item.email}{item.phone?' · '+item.phone:''}</small></div><div className="excursion-manage-request-actions"><button type="button" className="excursion-secondary-btn" disabled={manageBusy===item.id} onClick={()=>decideManageRequest(item,false)}>Reject</button><button type="button" className="excursion-primary-btn" disabled={manageBusy===item.id} onClick={()=>decideManageRequest(item,true)}>{manageBusy===item.id?'Saving…':item.type==='cancel'?'Approve cancellation':'Approve changes'}</button></div></article>)}</div></section>}
    <div className="excursion-booking-filters">
      <label>Search bookings<input type="search" value={query} placeholder="Guest, room, booking reference or excursion" onChange={e => {setQuery(e.target.value); setPage(1);}}/></label>
      <label>Trip date<DateFieldDMY value={date} onChange={value => {setDate(value); setPage(1);}} ariaLabel="Trip date"/></label>
      <label>Payment<select value={payment} onChange={e => {setPayment(e.target.value); setPage(1);}}><option value="">All payments</option><option value="Paid">Paid</option><option value="Unpaid">Unpaid</option><option value="Complimentary">Complimentary / Free</option></select></label>
      <button type="button" className="excursion-secondary-btn" disabled={!hasFilters} onClick={clearFilters}>Clear filters</button>
    </div>
    {error && <div className="excursion-booking-error" role="alert"><strong>{error}</strong>{loaded && <p>The list below is the last successfully loaded data and may be out of date.</p>}</div>}
    {loading && !loaded ? <div className="excursion-empty-state" role="status">Loading confirmed bookings…</div> : loaded && <>
      <div className="excursion-booking-totals" aria-live="polite">
        <span><strong>{filtered.length}</strong> {hasFilters ? 'matching' : 'confirmed'} bookings</span>
        <span><strong>{guests}</strong> guests</span><span><strong>{money(total)}</strong> total booking value (USD)</span>
      </div>
      {visible.length ? <div className="excursion-booking-list">{visible.map(b => <article className="excursion-confirmed-booking" key={b.id}>
        <header className="excursion-booking-card-head"><div><small>{b.id}{b.packageGroupId?' · '+b.packageGroupId+' · Part '+b.packagePart+'/'+b.packageParts:''}</small><h4>{b.packageName||b.excursion}</h4>{b.packageGroupId&&<p className="excursion-package-leg">{b.excursion}</p>}</div><div className="excursion-booking-badges">{b.packageGroupId&&<span className="buggy">Special Package {b.packagePart}/{b.packageParts}</span>}<span className="confirmed">Confirmed</span><span className={b.pricing?.complimentary ? 'confirmed' : b.paymentStatus.toLowerCase()}>{b.pricing?.complimentary ? 'Complimentary / Free' : b.paymentStatus}</span>{b.privateBoatRequested&&<span className="buggy">Private boat +$50</span>}{b.buggyRequested&&<span className="buggy">{b.guestType==='In-house'?'Buggy included':'Buggy requested'}</span>}</div></header>
        <dl className="excursion-booking-overview">
          <div><dt>Lead guest</dt><dd>{b.guest}<small>{b.guestType}</small>{b.groupName&&<small>Group: {b.groupName}</small>}<small>Phone / WhatsApp: {b.phone ? <a href={'tel:'+b.phone}>{b.phone}</a> : 'Not recorded'}</small></dd></div>
          <div><dt>Hotel / room</dt><dd>{b.hotel || 'Hotel not recorded'}<small>{b.room ? 'Room ' + b.room : 'Room not recorded'}</small></dd></div>
          <div><dt>Booked for</dt><dd>{dateLabel(b.date)}<small>{b.serviceType==='romantic-beach-dinner'?(b.time?'Dinner time '+b.time+' · Maldives time':'Dinner time not assigned'):(b.time || 'Time not assigned yet')+(b.endTime?'–'+b.endTime:'')+' · Maldives time'}</small></dd></div>
          <div><dt>Booking created</dt><dd>{createdLabel(b.createdAt)}<small>Maldives time</small></dd></div>
          <div><dt>Guests / total</dt><dd>{b.guests} {b.guests === 1 ? 'guest' : 'guests'}<small>{b.adults} adult{b.adults===1?'':'s'} · {b.children} child{b.children===1?'':'ren'} · {b.infants} under 3</small><small>{money(b.totalCents)} USD</small></dd></div>
        </dl>
        <ExcursionBillingActions booking={b} canAdjust={canAdjustBilling} revision={revision} onUpdated={() => load()}/>
        {bookingCanMove(b)&&<div className="excursion-booking-reassign-bar"><button type="button" className="excursion-secondary-btn" onClick={()=>void openMove(b)}>Move guests to another trip</button><small>Admin & Excursions Manager</small></div>}
        <details className="excursion-booking-details"><summary>View details<span className="excursion-booking-sr-only"> for {b.guest}, booking {b.id}</span></summary>
          <dl>
            {b.packageGroupId&&<div><dt>Package</dt><dd>{b.packageName||'Special Package'}<small>{b.packageGroupId} · Part {b.packagePart} of {b.packageParts}</small></dd></div>}{b.groupName&&<div><dt>Family / group</dt><dd>{b.groupName}<small>{b.guests} guests under one booking</small></dd></div>}<div><dt>Phone / WhatsApp</dt><dd>{b.phone ? <a href={'tel:'+b.phone}>{b.phone}</a> : 'Not recorded'}</dd></div>{b.email&&<div><dt>Email</dt><dd>{b.email}</dd></div>}
            <div><dt>Vessel</dt><dd>{b.serviceType==='romantic-beach-dinner'?'Not required':b.vessel}{b.separateVessel && <small>Extra vessel booking</small>}</dd></div>
            <div><dt>Assigned crew</dt><dd>{b.serviceType==='romantic-beach-dinner'?'Not required':b.crew.length ? b.crew.join(', ') : 'Not assigned'}</dd></div>
            <div><dt>Trip status</dt><dd>{b.tripStatus}{b.endTime&&<small>Trip end: {b.endTime} · Maldives time</small>}{b.returnTime&&<small>Return pickup: {b.returnTime} · Maldives time</small>}{b.privateBoatRequested&&<small>Private boat surcharge: {money(b.privateBoatSurchargeCents)}</small>}</dd></div>
            <div><dt>Buggy pickup</dt><dd>{b.serviceType==='romantic-beach-dinner'?(b.buggyRequested?'Round trip to dinner location and back':'Not requested'):(b.guestType==='In-house' ? 'Included automatically' : (b.buggyRequested ? 'Requested' : 'Not requested'))}</dd></div>
            <div><dt>Children policy</dt><dd>Under 3 free<small>Ages 3–11: 50% · Ages 12+: full price</small></dd></div><div><dt>Payment status</dt><dd>{b.pricing?.complimentary ? 'Complimentary / Free' : b.paymentStatus} · {money(b.totalCents)} USD<small>One combined payment for all guests in this booking</small></dd></div>
            <div className="excursion-booking-guests"><dt>Guest list</dt><dd>{b.people?.length ? <ol>{b.people.map(person => <li key={person.id}><span><strong>{person.nameRecorded ? person.name : 'Name not recorded'}</strong><small>{ageLabel(person.ageCategory)}{person.footSize ? ' · EU foot size '+person.footSize : ''}</small></span>{person.boarded && <em>Boarded</em>}</li>)}</ol> : 'Guest names not recorded'}</dd></div>
            <div><dt>Booking source</dt><dd>{b.source || 'Not recorded'}</dd></div>
            <div><dt>Booked by</dt><dd>{b.createdBy || 'Not recorded'}</dd></div>
            <div><dt>Booking created</dt><dd>{createdLabel(b.createdAt)}{b.createdAt && <small>Maldives time</small>}</dd></div>
            <div className="excursion-booking-notes"><dt>Notes / special requests</dt><dd>{b.notes || 'No notes'}</dd></div>
          </dl>
        </details>
      </article>)}</div> : <div className="excursion-empty-state"><strong>{hasFilters ? 'No bookings match your filters' : 'No confirmed excursion bookings yet'}</strong><p>{hasFilters ? 'Clear the filters to see all confirmed bookings.' : 'Confirmed excursion bookings will appear here automatically.'}</p></div>}
      {pages > 1 && <nav className="excursion-booking-pagination" aria-label="Confirmed booking pages"><button type="button" className="excursion-secondary-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages} · {filtered.length} bookings</span><button type="button" className="excursion-secondary-btn" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </>}
    {moveBooking&&<div className="excursion-reassign-overlay" role="dialog" aria-modal="true" aria-labelledby="excursion-reassign-title">
      <div className="excursion-reassign-dialog">
        <header><div><small>MOVE CONFIRMED BOOKING</small><h3 id="excursion-reassign-title">{moveBooking.excursion}</h3><p>{moveBooking.id} · {moveBooking.guests} guest{moveBooking.guests===1?'':'s'}</p></div><button type="button" aria-label="Close" disabled={moveBusy} onClick={()=>setMoveBooking(null)}>×</button></header>
        <section className="excursion-reassign-current"><strong>Currently assigned</strong><span>{dateLabel(moveBooking.date)} · {moveBooking.time}{moveBooking.endTime?'–'+moveBooking.endTime:''}</span><small>{moveBooking.vessel||'Vessel not assigned'}</small></section>
        <section className="excursion-reassign-guests"><strong>Guests being moved</strong><div>{moveBooking.people?.length?moveBooking.people.map(person=><span key={person.id}>{person.nameRecorded?person.name:'Guest '+person.slot}</span>):<span>{moveBooking.guest}</span>}</div></section>
        <label className="excursion-reassign-date">Trip date<DateFieldDMY value={moveDate} onChange={value=>void changeMoveDate(value)} ariaLabel="Target trip date"/></label>
        {moveError&&<p className="excursion-reassign-error" role="alert">{moveError}</p>}
        <div className="excursion-reassign-options">
          {moveLoading?<p>Loading available trips…</p>:moveSchedules.length?moveSchedules.map((trip:any)=><label key={trip.id} className={'excursion-reassign-option '+(trip.current?'current ':'')+(!trip.canFit?'full ':'')}>
            <input type="radio" name="reassign-trip" value={trip.id} checked={moveScheduleId===trip.id} disabled={!trip.canFit||moveBusy} onChange={()=>setMoveScheduleId(trip.id)}/>
            <span><strong>{trip.time}{trip.endTime?'–'+trip.endTime:''} · {trip.name}</strong><small>{trip.vessel} · {trip.confirmedPax}/{trip.capacity} confirmed · {trip.remainingSeats} seats available</small></span>
            <em>{trip.current?'Current':trip.compatible?'Compatible':'Other trip'}</em>
          </label>):<p>No open trips are available on this date.</p>}
        </div>
        <label className="excursion-reassign-note">Reason / note (optional)<textarea rows={3} maxLength={500} value={moveNote} onChange={e=>setMoveNote(e.target.value)} placeholder="e.g. Guest requested later departure"/></label>
        <footer><button type="button" className="excursion-secondary-btn" disabled={moveBusy} onClick={()=>setMoveBooking(null)}>Cancel</button><button type="button" className="excursion-primary-btn" disabled={moveBusy||!moveScheduleId} onClick={()=>void submitMove()}>{moveBusy?'Moving…':'Move guests'}</button></footer>
      </div>
    </div>}
  </section>;
}
