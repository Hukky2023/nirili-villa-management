'use client';

import {useEffect,useRef,useState} from 'react';
import {CalendarDays,Clock3,MapPin,ShieldCheck,TriangleAlert,Ship,UsersRound} from 'lucide-react';
import SessionButton from '../session-button';
import './style.css';

export default function CrewLocationPortal(){
 const [profile,setProfile]=useState<any>(null),[location,setLocation]=useState<any>(null),[sharing,setSharing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[trips,setTrips]=useState<any[]>([]),[requests,setRequests]=useState<any[]>([]),[unavailableTrip,setUnavailableTrip]=useState<any>(null),[reason,setReason]=useState(''),[requestBusy,setRequestBusy]=useState(false),[selectedDate,setSelectedDate]=useState(''),[futureOpen,setFutureOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[historyLoading,setHistoryLoading]=useState(false),[history,setHistory]=useState<any[]>([]);
 const watchRef=useRef<number|null>(null),lastSent=useRef(0),lastPosition=useRef<GeolocationPosition|null>(null),heartbeatRef=useRef<ReturnType<typeof setInterval>|null>(null);
 const maldivesToday=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=(type:string)=>parts.find(part=>part.type===type)?.value||'';return get('year')+'-'+get('month')+'-'+get('day')};
 const today=maldivesToday(),viewDate=selectedDate||today,selectedTrips=trips.filter((trip:any)=>trip.date===viewDate),futureTrips=trips.filter((trip:any)=>trip.date>today);

 async function load(){
  try{
   const [locationResponse,tripsResponse]=await Promise.all([fetch('/api/crew-location',{cache:'no-store'}),fetch('/api/crew-trip-requests',{cache:'no-store'})]);
   const locationData=await locationResponse.json(),tripData=await tripsResponse.json();
   if(!locationResponse.ok)throw Error(locationData.error||'Could not load crew location.');
   if(locationData.mode==='admin'){window.location.href='/?portal=admin';return;}
   if(!tripsResponse.ok)throw Error(tripData.error||'Could not load assigned trips.');
   setProfile(locationData.profile);setLocation(locationData.location||null);setSharing(watchRef.current!==null);setTrips(tripData.trips||[]);setRequests(tripData.requests||[]);
  }catch(e){setError(e instanceof Error?e.message:'Could not load crew portal.');}
 }
 useEffect(()=>{void load();const onRefresh=()=>void load();window.addEventListener('nirili:auto-refresh',onRefresh);window.addEventListener('focus',onRefresh);return()=>{window.removeEventListener('nirili:auto-refresh',onRefresh);window.removeEventListener('focus',onRefresh);if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);if(heartbeatRef.current)clearInterval(heartbeatRef.current)}},[]);

 async function sendPosition(position:GeolocationPosition,force=false){
  lastPosition.current=position;
  const now=Date.now();if(!force&&now-lastSent.current<20000)return;lastSent.current=now;
  try{
   const r=await fetch('/api/crew-location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not share location.');
   setLocation(d.location);setError('');setMessage('Live location shared with Admin.');
  }catch(e){setError(e instanceof Error?e.message:'Could not share location.');}
 }

 function startSharing(){
  if(!navigator.geolocation){setError('Location services are not available in this browser.');return;}
  setBusy(true);setError('');setMessage('Requesting location permission…');
  watchRef.current=navigator.geolocation.watchPosition(
   pos=>{setBusy(false);setSharing(true);lastPosition.current=pos;void sendPosition(pos)},
   err=>{setBusy(false);setSharing(false);setError(err.code===1?'Location permission was denied. Allow location access in your browser settings and try again.':'Could not read your current location. Check GPS/location services and try again.');},
   {enableHighAccuracy:true,maximumAge:15000,timeout:20000}
  );
  if(heartbeatRef.current)clearInterval(heartbeatRef.current);
  heartbeatRef.current=setInterval(()=>{if(lastPosition.current)void sendPosition(lastPosition.current,true)},60000);
 }

 async function submitUnableRequest(e:React.FormEvent){
  e.preventDefault();if(!unavailableTrip||requestBusy)return;
  const trimmed=reason.trim();if(trimmed.length<3){setError('Enter a reason for why you cannot go on this trip.');return;}
  setRequestBusy(true);setError('');setMessage('');
  try{
   const r=await fetch('/api/crew-trip-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:unavailableTrip.scheduleIds[0],date:unavailableTrip.date,reason:trimmed})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not send request.');
   setUnavailableTrip(null);setReason('');setMessage('Your request was sent to Admin for approval.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Could not send request.');}
  finally{setRequestBusy(false);}
 }
 async function loadHistory(){
  setHistoryLoading(true);setError('');
  try{
   const r=await fetch('/api/excursion-crew-history',{cache:'no-store'}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load trip history.');
   setHistory(d.history||[]);setHistoryOpen(true);
  }catch(e){setError(e instanceof Error?e.message:'Could not load trip history.');}
  finally{setHistoryLoading(false);}
 }
  async function stopSharing(){
  if(watchRef.current!==null){navigator.geolocation.clearWatch(watchRef.current);watchRef.current=null;}
  if(heartbeatRef.current){clearInterval(heartbeatRef.current);heartbeatRef.current=null;}
  lastPosition.current=null;setSharing(false);setBusy(true);setError('');setMessage('');
  try{
   const r=await fetch('/api/crew-location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop'})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not stop location sharing.');
   setLocation(d.location);setMessage('Location sharing stopped.');
  }catch(e){setError(e instanceof Error?e.message:'Could not stop location sharing.');}
  finally{setBusy(false);}
 }

 return <main className="crew-location-page">
  <header className="crew-location-top"><div><small>NIRILI TOURS · CREW</small><h1>{profile?.name||'Crew member'}</h1><p>{profile?.username?'@'+profile.username:'Crew member'}</p></div><div className="crew-top-actions"><button type="button" className="crew-history-button" disabled={historyLoading} onClick={()=>void loadHistory()}><CalendarDays size={18}/><span>{historyLoading?'Loading…':'My trip history'}</span></button><button type="button" className={'crew-location-toggle '+(sharing?'sharing':'not-sharing')} disabled={busy} onClick={()=>sharing?void stopSharing():startSharing()} aria-label={sharing?'Stop sharing live location':'Start sharing live location'} title={sharing?'Location sharing is ON — tap to stop':'Location sharing is OFF — tap to start'}><MapPin size={21}/><span>{busy?'…':sharing?'Sharing':'Not sharing'}</span></button><SessionButton signedIn inline/></div></header>
  <section className="crew-trip-section">
   <header><div><small>MY ASSIGNED TRIPS</small><h2>{viewDate===today?"Today's excursion assignments":'Assigned trips · '+viewDate.split('-').reverse().join('-')}</h2><p>Select a date to see only the excursions assigned to you for that day.</p></div><div className="crew-trip-header-actions"><div className="crew-trip-date-controls"><button type="button" className={viewDate===today?'active':''} onClick={()=>setSelectedDate(today)}><CalendarDays size={16}/>Today trips</button><label className="crew-trip-date-picker"><CalendarDays size={16}/><span>Date</span><input type="date" min={today} value={viewDate} onChange={e=>setSelectedDate(e.target.value||today)}/></label><button type="button" onClick={()=>setFutureOpen(true)}><CalendarDays size={16}/>Future trips{futureTrips.length?<span>{futureTrips.length}</span>:null}</button></div></div></header>
   {!selectedTrips.length?<div className="crew-trip-empty"><CalendarDays size={28}/><strong>No trips assigned for {viewDate===today?'today':viewDate.split('-').reverse().join('-')}</strong><span>Select another date to check your assigned excursions.</span></div>:<div className="crew-trip-grid">{selectedTrips.map((trip:any)=><article key={trip.key}><div className="crew-trip-date"><CalendarDays size={17}/><strong>{trip.date.split('-').reverse().join('-')}</strong><span><Clock3 size={15}/>{trip.time} · Maldives time</span></div><h3>{trip.tripNames.join(' + ')}</h3><div className="crew-trip-operation-details"><div><Ship size={17}/><span>Assigned vessel</span><strong>{trip.vessel||'Not assigned'}</strong></div><div><UsersRound size={17}/><span>Confirmed pax</span><strong>{Number(trip.pax)||0}</strong></div><div className="other-crew"><UsersRound size={17}/><span>Other crew</span><strong>{trip.otherCrew?.length?trip.otherCrew.join(', '):'No other crew assigned'}</strong></div><div className="trip-status-detail"><Clock3 size={17}/><span>Excursion status</span><strong>{trip.tripStatus||'Excursion scheduled'}</strong></div></div><div className="crew-trip-meta"><span className="trip-status">{trip.tripStatus||'Excursion scheduled'}</span>{trip.request&&<span className="pending">Request pending</span>}</div>{trip.request?<div className="crew-trip-request-status"><strong>Unable-to-go request sent</strong><p>{trip.request.reason}</p><small>Waiting for Admin decision.</small></div>:<button type="button" className="crew-unable-btn" onClick={()=>{setUnavailableTrip(trip);setReason('');setError('')}}><TriangleAlert size={17}/>I am unable to go</button>}</article>)}</div>}
   {requests.some((request:any)=>request.status!=='Pending')&&<details className="crew-request-history"><summary>Previous requests</summary><div>{requests.filter((request:any)=>request.status!=='Pending').map((request:any)=><article key={request.id}><strong>{request.tripNames?.join(' + ')||request.tripName}</strong><span>{request.date.split('-').reverse().join('-')} · {request.time}</span><b className={request.status.toLowerCase()}>{request.status}</b><p>{request.reason}</p>{request.decisionNote&&<small>Admin note: {request.decisionNote}</small>}</article>)}</div></details>}
  </section>
  {futureOpen&&<div className="crew-request-overlay" role="presentation"><section className="crew-future-dialog"><header><div><small>FUTURE ASSIGNMENTS</small><h2>My future trips</h2><p>All future excursions assigned to you. Times are Maldives time.</p></div><button type="button" onClick={()=>setFutureOpen(false)} aria-label="Close">×</button></header>{!futureTrips.length?<div className="crew-trip-empty"><CalendarDays size={28}/><strong>No future assigned trips</strong><span>Future assignments will appear here.</span></div>:<div className="crew-future-trip-list">{futureTrips.map((trip:any)=><article key={trip.key}><div className="crew-trip-date"><CalendarDays size={17}/><strong>{trip.date.split('-').reverse().join('-')}</strong><span><Clock3 size={15}/>{trip.time} · Maldives time</span></div><h3>{trip.tripNames.join(' + ')}</h3><div className="crew-trip-operation-details"><div><Ship size={17}/><span>Assigned vessel</span><strong>{trip.vessel||'Not assigned'}</strong></div><div><UsersRound size={17}/><span>Confirmed pax</span><strong>{Number(trip.pax)||0}</strong></div><div className="other-crew"><UsersRound size={17}/><span>Other crew</span><strong>{trip.otherCrew?.length?trip.otherCrew.join(', '):'No other crew assigned'}</strong></div><div className="trip-status-detail"><Clock3 size={17}/><span>Excursion status</span><strong>{trip.tripStatus||'Excursion scheduled'}</strong></div></div>{trip.request?<div className="crew-trip-request-status"><strong>Unable-to-go request sent</strong><p>{trip.request.reason}</p><small>Waiting for Admin decision.</small></div>:<button type="button" className="crew-unable-btn" onClick={()=>{setFutureOpen(false);setUnavailableTrip(trip);setReason('');setError('')}}><TriangleAlert size={17}/>I am unable to go</button>}</article>)}</div>}</section></div>}
  {historyOpen&&<div className="crew-request-overlay" role="presentation"><section className="crew-future-dialog crew-history-dialog"><header><div><small>MY TRIP HISTORY</small><h2>{profile?.name||'Crew member'} · Previous trips</h2><p>Excursion assignments from the last 3 months.</p></div><button type="button" onClick={()=>setHistoryOpen(false)} aria-label="Close">×</button></header>{!history.length?<div className="crew-trip-empty"><CalendarDays size={28}/><strong>No trip history</strong><span>No previous excursion assignments were found.</span></div>:<div className="crew-future-trip-list">{history.map((trip:any)=><article key={trip.id+'-'+trip.date+'-'+trip.time}><div className="crew-trip-date"><CalendarDays size={17}/><strong>{trip.date.split('-').reverse().join('-')}</strong><span><Clock3 size={15}/>{trip.time} · Maldives time</span></div><h3>{trip.name}</h3><div className="crew-trip-operation-details"><div><Ship size={17}/><span>Assigned vessel</span><strong>{trip.vessel||'Not recorded'}</strong></div><div><UsersRound size={17}/><span>Role</span><strong>{trip.role||'Crew'}</strong></div><div className="trip-status-detail"><Clock3 size={17}/><span>Status</span><strong>{trip.tripStatus||trip.bookingStatus||'Recorded'}</strong></div></div></article>)}</div>}</section></div>}
  {unavailableTrip&&<div className="crew-request-overlay" role="presentation"><form className="crew-request-dialog" onSubmit={submitUnableRequest}><header><div><small>UNABLE TO ATTEND</small><h2>Request to leave this trip</h2><p>{unavailableTrip.tripNames.join(' + ')} · {unavailableTrip.date.split('-').reverse().join('-')} · {unavailableTrip.time}</p></div><button type="button" disabled={requestBusy} onClick={()=>setUnavailableTrip(null)} aria-label="Close">×</button></header><label>Reason<textarea required autoFocus rows={5} maxLength={500} placeholder="Explain why you are unable to go on this trip." value={reason} onChange={e=>setReason(e.target.value)}/><small>{reason.length} / 500</small></label><div className="crew-request-note"><strong>You stay assigned until Admin approves.</strong><p>If approved, you will be removed from the trip and Admin will assign another crew member.</p></div><footer><button type="button" disabled={requestBusy} onClick={()=>setUnavailableTrip(null)}>Cancel</button><button type="submit" className="primary" disabled={requestBusy||reason.trim().length<3}>{requestBusy?'Sending…':'Send request to Admin'}</button></footer></form></div>}

  <section className="crew-location-privacy"><ShieldCheck size={20}/><div><strong>Location privacy</strong><p>The system stores only your latest shared position, not a route history. Live updates are sent only while this page is open and location sharing is turned on.</p></div></section>
  {error&&<p className="crew-location-message error" role="alert">{error}</p>}
  {message&&<p className="crew-location-message" role="status">{message}</p>}
 </main>;
}
