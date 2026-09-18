'use client';

import {useEffect,useRef,useState} from 'react';
import {MapPin,Navigation,RefreshCw,ShieldCheck,StopCircle} from 'lucide-react';
import SessionButton from '../session-button';
import './style.css';

function timeLabel(value:string){
 if(!value)return 'Not shared yet';
 const d=new Date(value);if(Number.isNaN(d.getTime()))return value;
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d).replace(',','')+' Maldives time';
}

export default function CrewLocationPortal(){
 const [profile,setProfile]=useState<any>(null),[location,setLocation]=useState<any>(null),[sharing,setSharing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const watchRef=useRef<number|null>(null),lastSent=useRef(0),lastPosition=useRef<GeolocationPosition|null>(null),heartbeatRef=useRef<ReturnType<typeof setInterval>|null>(null);

 async function load(){
  try{
   const r=await fetch('/api/crew-location',{cache:'no-store'}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load crew location.');
   if(d.mode==='admin'){window.location.href='/?portal=admin';return;}
   setProfile(d.profile);setLocation(d.location||null);setSharing(false);
  }catch(e){setError(e instanceof Error?e.message:'Could not load crew location.');}
 }
 useEffect(()=>{void load();return()=>{if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);if(heartbeatRef.current)clearInterval(heartbeatRef.current)}},[]);

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
  <header className="crew-location-top"><div><small>NIRILI TOURS · CREW</small><h1>Crew location</h1><p>{profile?.name||'Crew member'} · {profile?.username||''}</p></div><SessionButton signedIn inline/></header>
  <section className="crew-location-card">
   <div className="crew-location-icon"><Navigation size={32}/></div>
   <div><h2>{sharing?'Live location is sharing':'Share your location with Admin'}</h2><p>Use this while you are on duty so Admin can see your latest position. Your browser will ask for location permission.</p></div>
   <div className="crew-location-actions">
    {!sharing?<button type="button" className="primary" disabled={busy} onClick={startSharing}><MapPin size={18}/>{busy?'Getting location…':'Start sharing live location'}</button>:<button type="button" className="danger" disabled={busy} onClick={stopSharing}><StopCircle size={18}/>Stop sharing</button>}
    <button type="button" disabled={busy} onClick={load}><RefreshCw size={17}/>Refresh</button>
   </div>
  </section>
  <section className="crew-location-status">
   <article><span>Status</span><strong>{sharing?'Sharing now':location?.sharing?'Last shared location saved':'Not sharing'}</strong></article>
   <article><span>Last update</span><strong>{timeLabel(location?.updatedAt||'')}</strong></article>
   <article><span>Accuracy</span><strong>{location?.accuracy?('± '+Math.round(location.accuracy)+' m'):'—'}</strong></article>
  </section>
  <section className="crew-location-privacy"><ShieldCheck size={20}/><div><strong>Location privacy</strong><p>The system stores only your latest shared position, not a route history. Live updates are sent only while this page is open and location sharing is turned on.</p></div></section>
  {error&&<p className="crew-location-message error" role="alert">{error}</p>}
  {message&&<p className="crew-location-message" role="status">{message}</p>}
 </main>;
}
