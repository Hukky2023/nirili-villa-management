'use client';

import {useEffect,useState} from 'react';
import {Clock3,MapPin,RefreshCw,Satellite,UserRound} from 'lucide-react';
import './crew-location-admin.css';

function ageLabel(value:string){
 if(!value)return 'No location yet';
 const ms=Date.now()-Date.parse(value);
 if(!Number.isFinite(ms))return 'Unknown';
 if(ms<60000)return 'Updated just now';
 const minutes=Math.floor(ms/60000);
 if(minutes<60)return 'Updated '+minutes+' min ago';
 const hours=Math.floor(minutes/60);
 return 'Updated '+hours+' hr'+(hours===1?'':'s')+' ago';
}
function exactTime(value:string){
 if(!value)return '';
 const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(',','')+' Maldives time';
}

export default function CrewLocationAdmin(){
 const [crew,setCrew]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(silent=false){
  if(!silent)setLoading(true);
  try{
   const r=await fetch('/api/crew-location',{cache:'no-store'}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load crew locations.');
   setCrew(d.crew||[]);setError('');
  }catch(e){if(!silent)setError(e instanceof Error?e.message:'Could not load crew locations.');}
  finally{if(!silent)setLoading(false);}
 }
 useEffect(()=>{void load();const timer=setInterval(()=>void load(true),30000);const onRefresh=()=>void load(true);window.addEventListener('nirili:auto-refresh',onRefresh);return()=>{clearInterval(timer);window.removeEventListener('nirili:auto-refresh',onRefresh)}},[]);
 return <section className="crew-location-admin">
  <header><div><small>LIVE CREW LOCATION</small><h4>Locate crew members</h4><p>Crew members choose when to share their device location. Positions refresh every 30 seconds.</p></div><button type="button" disabled={loading} onClick={()=>load()}><RefreshCw size={16}/>{loading?'Loading…':'Refresh locations'}</button></header>
  {error&&<p className="crew-location-admin-error" role="alert">{error}</p>}
  {!loading&&!crew.length&&<div className="crew-location-admin-empty"><Satellite size={28}/><strong>No locatable crew accounts</strong><span>Create a staff account with the “Crew member: share live location with Admin” permission.</span></div>}
  <div className="crew-location-admin-grid">{crew.map(member=>{
   const available=member.sharing&&member.latitude!=null&&member.longitude!=null;
   return <article key={member.id} className={(available?'sharing ':'')+(member.stale?'stale':'fresh')}>
    <div className="crew-location-person"><div className="crew-location-avatar"><UserRound size={20}/></div><div><h5>{member.name}</h5><span>@{member.username}</span></div><b>{available?(member.stale?'Location stale':'Sharing live'):'Not sharing'}</b></div>
    <div className="crew-location-meta"><span><Clock3 size={15}/>{ageLabel(member.updatedAt)}</span>{member.accuracy&&<span>Accuracy ±{Math.round(member.accuracy)} m</span>}</div>
    {member.updatedAt&&<small title={exactTime(member.updatedAt)}>{exactTime(member.updatedAt)}</small>}
    {available?<a className="crew-location-map" href={'https://www.google.com/maps?q='+encodeURIComponent(member.latitude+','+member.longitude)} target="_blank" rel="noopener noreferrer"><MapPin size={17}/>Open location on map</a>:<div className="crew-location-waiting"><MapPin size={16}/>Waiting for crew member to share location</div>}
   </article>
  })}</div>
 </section>;
}
