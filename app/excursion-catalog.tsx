'use client';
import {useEffect,useState} from 'react';
import {Clock,Users,ShipWheel,X,CalendarDays,CheckCircle2} from 'lucide-react';
import {formatDateDMY} from '../lib/date-format';
import './excursion-catalog.css';
import './excursion-scheduler.css';
import ExcursionWeather from './excursion-weather';

function maldivesToday(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=(t:string)=>p.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`;}
const shift=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const usd=(cents:number)=>'$'+((Number(cents)||0)/100).toFixed(2);

export default function ExcursionCatalog({items,canBook=true}:{items:any[];onBook?:(item:any)=>void;canBook?:boolean}){
 const [date,setDate]=useState(maldivesToday()),[data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[booking,setBooking]=useState<any>(null),[departurePicker,setDeparturePicker]=useState<any>(null),[saving,setSaving]=useState(false),[cancelling,setCancelling]=useState(''),[category,setCategory]=useState<'single'|'combined'|'special'|'schedule'>('single');
 async function load(selected=date,silent=false){if(!silent){setLoading(true);setMessage('');}try{const r=await fetch('/api/guest-excursion-schedules?date='+encodeURIComponent(selected),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load excursions');setData(d);}catch(e){if(!silent)setMessage((e as Error).message);}finally{if(!silent)setLoading(false);}}
 useEffect(()=>{load(date)},[date]);
 useEffect(()=>{const onRefresh=()=>void load(date,true);window.addEventListener('nirili:auto-refresh',onRefresh);return()=>window.removeEventListener('nirili:auto-refresh',onRefresh)},[date]);
 function openBooking(schedule:any){const stay=data?.stays?.[0];setBooking({scheduleId:schedule.id,date:schedule.date,name:schedule.name,time:schedule.time,stayId:stay?.id||'',quantity:1,notes:'',token:crypto.randomUUID(),capacity:schedule.capacity,confirmedPax:schedule.confirmedPax,remainingSeats:schedule.remainingSeats,priceCents:schedule.priceCents||0});setMessage('');}
 async function submit(e:React.FormEvent){e.preventDefault();if(!booking||saving)return;setSaving(true);setMessage('');try{const r=await fetch('/api/guest-excursion-schedules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(booking)}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not book seats');setBooking(null);setMessage(d.booking?.requiresApproval?'The boat is full for this request. Your extra-seat request was sent to Admin for review.':'Your excursion seats are confirmed and the charge was added to your room bill.');await load(date);window.dispatchEvent(new Event('services-updated'));}catch(e){setMessage((e as Error).message);}finally{setSaving(false);}}
 async function cancelBooking(item:any){if(cancelling)return;if(!confirm('Cancel '+item.name+' for '+formatDateDMY(item.date)+' at '+item.time+'?'))return;setCancelling(item.id);setMessage('');try{const r=await fetch('/api/guest-excursion-schedules',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:item.id})}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not cancel excursion');setMessage('Excursion cancelled. Any charge from this booking was removed from your room bill.');await load(date);window.dispatchEvent(new Event('services-updated'));}catch(e){setMessage((e as Error).message);}finally{setCancelling('');}}
 const schedules=data?.schedules||[],stays=data?.stays||[],myBookings=data?.myBookings||[];
 const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
 function menuCategory(item:any){
  const category=norm(item?.category),group=norm(item?.group),name=norm(item?.name);
  if(category==='special'||group.includes('special')||name.includes('special package'))return 'special';
  if(category==='combined'||group.includes('combined'))return 'combined';
  return 'single';
 }
 function canonicalName(value:any){
  return norm(value)
   .replace(/\([^)]*\)/g,' ')
   .replace(/\b(snorkeling|watching|trip|only)\b/g,' ')
   .replace(/\bnurse shark\b/g,'shark')
   .replace(/\s*\+\s*/g,'+')
   .replace(/\s+/g,' ')
   .trim();
 }
 function departuresForItem(item:any){
  const key=canonicalName(item?.name);
  return schedules.filter((s:any)=>canonicalName(s.name)===key);
 }
 const visibleMenuItems=(items||[]).filter((item:any)=>item.kind==='excursion'&&menuCategory(item)===category);
 function bookMenuItem(item:any){
  const departures=departuresForItem(item).filter((s:any)=>s.status==='Open');
  if(departures.length===1){openBooking(departures[0]);return;}
  if(departures.length>1){setDeparturePicker({item,departures});setMessage('');}
 }
 return <section className="guest-excursion-schedule" aria-label="Scheduled excursions">
  <ExcursionWeather/>

  <nav className="guest-excursion-category-tabs" aria-label="Excursion types">
   <button type="button" className={category==='schedule'?'active':''} aria-pressed={category==='schedule'} onClick={()=>setCategory('schedule')}>Schedule</button>
   <button type="button" className={category==='single'?'active':''} aria-pressed={category==='single'} onClick={()=>setCategory('single')}>Single Excursions</button>
   <button type="button" className={category==='combined'?'active':''} aria-pressed={category==='combined'} onClick={()=>setCategory('combined')}>Combined Excursions</button>
   <button type="button" className={category==='special'?'active':''} aria-pressed={category==='special'} onClick={()=>setCategory('special')}>Special Packages</button>
  </nav>

  {myBookings.length>0&&<section className="guest-booked-excursions"><div className="guest-booked-heading"><div><small>MY EXCURSIONS</small><h3>Booked excursions</h3></div><CheckCircle2 size={24}/></div><div className="guest-booked-grid">{myBookings.map((b:any)=><article key={b.id}><div className="guest-booked-date"><CalendarDays size={17}/><span>{formatDateDMY(b.date)}</span><strong>{b.time}</strong></div><h4>{b.name}</h4><div className="guest-booked-meta"><span>{b.quantity} seat{b.quantity===1?'':'s'}</span><span>Room {b.room}</span><span>{b.status}</span>{b.cents>0&&<span>{usd(b.cents)}</span>}{b.vessel&&<span>{b.separateVessel?'Extra vessel: ':'Vessel: '}{b.vessel}</span>}</div>{b.canCancel&&<button type="button" className="guest-cancel-excursion" disabled={cancelling===b.id} onClick={()=>cancelBooking(b)}>{cancelling===b.id?'Cancelling…':'Cancel excursion'}</button>}</article>)}</div></section>}

  <div className="guest-excursion-controls"><div className="guest-excursion-day-label"><small>Showing excursions for</small><strong>{formatDateDMY(date)}</strong></div><div className="guest-excursion-datebar"><button type="button" onClick={()=>setDate(shift(date,-1))}>← Previous</button><button type="button" onClick={()=>setDate(shift(date,1))}>Next →</button></div></div>
  {message&&<p className="guest-excursion-message" role="status">{message}</p>}
  {!canBook&&<p className="guest-excursion-note">Excursion bookings are available after check-in.</p>}
  {category==='schedule'?(loading?<div className="guest-excursion-empty">Loading schedule…</div>:!schedules.length?<div className="guest-excursion-empty"><strong>No excursions scheduled for this date.</strong><span>Please choose another day.</span></div>:<div className="guest-excursion-list">{schedules.map((s:any)=>{const own=s.ownBooking,full=s.isFull,closed=s.status!=='Open',pending=own?.status==='Pending';return <article key={s.id} className={(full?'is-full ':'')+(closed?'is-closed':'')}>
   <div className="guest-excursion-time"><Clock size={18}/><strong>{s.time}</strong></div>
   <div className="guest-excursion-main"><div className="guest-excursion-title"><h3>{s.name}</h3><span className={closed?'closed':full?'full':'open'}>{closed?'Closed':full?'At capacity':'Open'}</span>{s.sharedBoat&&<span className="shared">Same boat</span>}</div><div className="guest-excursion-meta"><span><Users size={16}/>{s.confirmedPax} / {s.capacity} confirmed</span>{!full&&<span>{s.remainingSeats} seat{s.remainingSeats===1?'':'s'} available</span>}{s.priceCents>0&&<span>{usd(s.priceCents)} / guest</span>}{full&&<span className="capacity-note">Extra-seat requests accepted</span>}{s.pendingPax>0&&<span>{s.pendingPax} pax awaiting Admin</span>}</div>{s.notes&&<p>{s.notes}</p>}{own&&<div className={'guest-own-request '+String(own.status).toLowerCase().replace(/\s+/g,'-')}>Your latest booking: {own.quantity} seat{own.quantity===1?'':'s'} · {own.status}</div>}</div>
   <div className="guest-excursion-action"><button type="button" disabled={!canBook||closed||!stays.length||pending} onClick={()=>openBooking(s)}>{pending?'Request pending':full?'Request seats':'Book seats'}</button></div>
  </article>})}</div>):!visibleMenuItems.length?<div className="guest-excursion-empty"><strong>No {category==='single'?'single excursions':category==='combined'?'combined excursions':'special packages'} in the excursion menu.</strong><span>Admin can add or recategorize excursions from the Excursion menu.</span></div>:<div className="guest-excursion-option-grid">{visibleMenuItems.map((item:any)=>{const departures=departuresForItem(item),openDepartures=departures.filter((s:any)=>s.status==='Open'),hasDeparture=openDepartures.length>0;return <article key={item.id}>
   <div className="guest-option-top"><div><small>{category==='single'?'SINGLE EXCURSION':category==='combined'?'COMBINED EXCURSION':'SPECIAL PACKAGE'}</small><h3>{item.name}</h3></div><span className={hasDeparture?'open':'closed'}>{hasDeparture?openDepartures.length+' departure'+(openDepartures.length===1?'':'s')+' today':'Not scheduled today'}</span></div>
   <p>{item.detail||'Available from the Nirili Tours excursion menu.'}</p>
   <div className="guest-option-meta"><span>{item.cents>0?usd(item.cents)+' / guest':'Price on request'}</span><span>Minimum {item.minGuests||1} guest{Number(item.minGuests||1)===1?'':'s'}</span>{openDepartures.slice(0,3).map((s:any)=><span key={s.id}>{s.time}</span>)}</div>
   <button type="button" className="guest-option-book" disabled={!canBook||!stays.length||!hasDeparture} onClick={()=>bookMenuItem(item)}>{!canBook||!stays.length?'Available after check-in':!hasDeparture?'Not scheduled today':openDepartures.length>1?'Choose departure':'Book'}</button>
  </article>})}</div>}

  {departurePicker&&<div className="guest-excursion-overlay"><div className="guest-excursion-dialog guest-departure-picker"><header><div><small>CHOOSE DEPARTURE</small><h3>{departurePicker.item.name}</h3><p>{formatDateDMY(date)}</p></div><button type="button" aria-label="Close" onClick={()=>setDeparturePicker(null)}><X/></button></header><div className="guest-departure-list">{departurePicker.departures.map((s:any)=><button type="button" key={s.id} onClick={()=>{setDeparturePicker(null);openBooking(s)}}><strong>{s.time}</strong><span>{s.remainingSeats} seat{s.remainingSeats===1?'':'s'} available · {s.priceCents>0?usd(s.priceCents)+' / guest':'Price on request'}</span></button>)}</div></div></div>}
  {booking&&<div className="guest-excursion-overlay"><form className="guest-excursion-dialog" onSubmit={submit}><header><div><small>{booking.confirmedPax+booking.quantity>booking.capacity?'EXTRA-SEAT REQUEST':'BOOK EXCURSION'}</small><h3>{booking.name}</h3><p>{formatDateDMY(booking.date)} · {booking.time}</p></div><button type="button" aria-label="Close" onClick={()=>setBooking(null)}><X/></button></header>{booking.confirmedPax+booking.quantity>booking.capacity?<div className="guest-full-warning"><strong>Not enough listed seats for this request</strong><p>You can still send the request. If Admin approves it, a separate vessel will be assigned for your request.</p></div>:<div className="guest-excursion-note"><strong>Instant confirmation</strong><p>These seats fit within the current boat capacity and will be confirmed immediately.</p></div>}<label>Room<select required value={booking.stayId} onChange={e=>setBooking({...booking,stayId:e.target.value})}><option value="">Choose room</option>{stays.map((s:any)=><option key={s.id} value={s.id}>Room {s.room} · {s.guest}</option>)}</select></label><label>Number of seats<input required type="number" min={1} max={20} value={booking.quantity} onChange={e=>setBooking({...booking,quantity:Number(e.target.value)})}/></label>{booking.priceCents>0&&<div className="guest-excursion-total"><span>Excursion charge</span><strong>{usd(booking.priceCents*booking.quantity)}</strong><small>{usd(booking.priceCents)} × {booking.quantity} guest{booking.quantity===1?'':'s'}</small></div>}<label>Notes<textarea rows={3} maxLength={1000} placeholder="Any special request or information for the team" value={booking.notes} onChange={e=>setBooking({...booking,notes:e.target.value})}/></label><p className="guest-excursion-dialog-note"><ShipWheel size={17}/> {booking.confirmedPax+booking.quantity>booking.capacity?'This request needs Admin approval and a new vessel assignment because it exceeds the listed boat capacity.':'Your seats will be booked immediately and added to your room bill.'}</p><footer><button type="button" onClick={()=>setBooking(null)}>Cancel</button><button type="submit" disabled={saving}>{saving?'Saving…':booking.confirmedPax+booking.quantity>booking.capacity?'Send seat request':'Confirm booking'}</button></footer></form></div>}
 </section>;
}
