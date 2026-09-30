'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CarFront,CheckCircle2,MapPin,Navigation,Users} from 'lucide-react';
import {SITES} from '../../../lib/public-sites';

type Ride={id:string;status:string;location:string;destination:string;quantity:number;pickupTime:string;date:string;fareCents:number;buggyName:string;driver:string;canCancel:boolean};
type Saved={id:string;key:string};

const STORAGE='nirili-ride';
const STEPS=['Requested','Assigned','Driver on the way','Arrived','On trip','Completed'];
const STEP_LABEL:Record<string,string>={Requested:'Finding a buggy',Assigned:'Buggy assigned','Driver on the way':'Driver on the way',Arrived:'Driver has arrived','On trip':'On your way',Completed:'Ride complete'};
const money=(cents:number)=>'$'+(Math.max(0,cents)/100).toFixed(2);

function readSaved():Saved|null{try{const v=JSON.parse(localStorage.getItem(STORAGE)||'null');return v&&v.id&&v.key?v:null}catch{return null}}
function writeSaved(v:Saved|null){try{if(v)localStorage.setItem(STORAGE,JSON.stringify(v));else localStorage.removeItem(STORAGE)}catch{}}

export default function RideSite(){
 const [fareCents,setFareCents]=useState<number|null>(null),[maxPassengers,setMaxPassengers]=useState(6);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[location,setLocation]=useState(''),[destination,setDestination]=useState(''),[quantity,setQuantity]=useState(1),[notes,setNotes]=useState('');
 const [ride,setRide]=useState<Ride|null>(null),[saved,setSaved]=useState<Saved|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const token=useRef('');

 useEffect(()=>{
  token.current=crypto.randomUUID();
  fetch('/api/public-ride',{cache:'no-store'}).then(r=>r.json()).then((d:any)=>{if(typeof d.fareCents==='number')setFareCents(d.fareCents);if(d.maxPassengers)setMaxPassengers(d.maxPassengers)}).catch(()=>{});
  const s=readSaved();if(s)setSaved(s);
 },[]);

 // Follow the current ride until it ends.
 useEffect(()=>{
  if(!saved)return;
  let live=true;
  const check=()=>fetch('/api/public-ride?id='+encodeURIComponent(saved.id)+'&key='+encodeURIComponent(saved.key),{cache:'no-store'}).then(async r=>{const d:any=await r.json();if(!live)return;if(r.status===404){writeSaved(null);setSaved(null);setRide(null);return;}if(d.ride)setRide(d.ride)}).catch(()=>{});
  check();
  const timer=window.setInterval(check,8000);
  return()=>{live=false;window.clearInterval(timer)};
 },[saved]);

 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/public-ride',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request',token:token.current,name,phone,location,destination,quantity,notes})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not request a ride.');
   const next={id:d.ride.id,key:d.key};writeSaved(next);setSaved(next);setRide(d.ride);
   token.current=crypto.randomUUID();window.scrollTo({top:document.getElementById('ride')?.offsetTop||0,behavior:'smooth'});
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 async function cancel(){
  if(!saved||busy||!window.confirm('Cancel this ride?'))return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/public-ride',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',id:saved.id,key:saved.key})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not cancel the ride.');setRide(d.ride);
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 function newRide(){writeSaved(null);setSaved(null);setRide(null);setError('')}

 const finished=ride&&['Completed','Cancelled'].includes(ride.status);
 const stepIndex=ride?STEPS.indexOf(ride.status):-1;

 return <section className="nh-transfer nh-ride-zone" id="ride">
  {saved&&ride?<div className="nh-ride-track">
   <p className="nh-kicker">Your ride · {ride.id}</p>
   <h2>{ride.status==='Cancelled'?<>Ride <em>cancelled.</em></>:<>{STEP_LABEL[ride.status]||ride.status}<em>.</em></>}</h2>
   <p className="nh-ride-route"><MapPin/> {ride.location} <ArrowRight/> {ride.destination}</p>
   {ride.status!=='Cancelled'&&<ol className="nh-ride-steps">{STEPS.map((step,i)=><li key={step} className={i<stepIndex?'done':i===stepIndex?'current':''}><span/>{STEP_LABEL[step]}</li>)}</ol>}
   <dl className="nh-ride-facts">
    <div><dt>Buggy</dt><dd>{ride.buggyName||'Being assigned'}</dd></div>
    <div><dt>Driver</dt><dd>{ride.driver||'Being assigned'}</dd></div>
    <div><dt>Passengers</dt><dd>{ride.quantity}</dd></div>
    <div><dt>Fare</dt><dd>{ride.fareCents?money(ride.fareCents)+' · pay the driver':'Confirmed by the driver'}</dd></div>
   </dl>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   <div className="nh-ride-actions">
    {ride.canCancel&&<button type="button" className="nh-btn nh-btn-outline" disabled={busy} onClick={cancel}>Cancel ride</button>}
    {finished&&<button type="button" className="nh-btn nh-btn-primary" onClick={newRide}>Request another ride <ArrowRight/></button>}
   </div>
   {!finished&&<small>This page updates by itself. Keep it open, or come back to it on this device.</small>}
  </div>:<form onSubmit={submit} className="nh-transfer-form">
   <div className="nh-step">
    <h3>Where to?</h3>
    <div className="nh-fields">
     <label><span><MapPin/>Pickup point</span><input required maxLength={150} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Hotel, harbour, beach or landmark"/></label>
     <label><span><Navigation/>Destination</span><input required maxLength={150} value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Where are you going?"/></label>
    </div>
    <label><span><Users/>Passengers</span><select value={quantity} onChange={e=>setQuantity(Number(e.target.value))}>{Array.from({length:maxPassengers},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</select></label>
   </div>
   <div className="nh-step">
    <h3>Your details</h3>
    <div className="nh-fields">
     <label><span>Name</span><input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="So the driver can find you"/></label>
     <label><span>WhatsApp</span><input required maxLength={30} inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960 7XX XXXX"/></label>
    </div>
    <label><span>Note for the driver (optional)</span><textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Luggage, a landmark, accessibility needs…"/></label>
   </div>
   {error&&<p className="nh-error" role="alert">{error}</p>}
   <button className="nh-btn nh-btn-primary nh-transfer-submit" disabled={busy}>{busy?'Requesting…':'Request a buggy'} <CarFront/></button>
  </form>}

  <aside className="nh-fare">
   <p className="nh-kicker">How it works</p>
   <dl>
    <div><dt>1</dt><dd>Request a buggy from anywhere on Dhiffushi</dd></div>
    <div><dt>2</dt><dd>The nearest free buggy is assigned</dd></div>
    <div><dt>3</dt><dd>Follow your driver here until pickup</dd></div>
   </dl>
   <div className="nh-fare-total"><span>Fare per ride</span><strong>{fareCents===null?'—':fareCents?money(fareCents):'Ask the driver'}</strong></div>
   <small>Pay the driver at the end of your ride.</small>
   <a className="nh-ride-portal" href={SITES.my+'/?service=buggy'}><CheckCircle2/> Staying at Nirili Villa? Request from your guest portal to add the fare to your room bill.</a>
  </aside>
 </section>;
}
