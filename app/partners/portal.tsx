'use client';
import {useEffect,useState} from 'react';
import {Anchor,ArrowRight,BedDouble,Car,Handshake,LogOut,ShipWheel,Ticket} from 'lucide-react';
import {AgentExcursions,Travel} from '../book/agents/site';
import RoomPackages from '../tour-operator/site';
import {CrewWorkspace,Workspace,type CrewMember} from '../operators/portal';
import {LanguagePicker} from '../ui-language';
import {WHATSAPP} from '../hotel/chrome';

// partners.nirilihotels.com: one sign-in for every business working with Nirili. A partner sees
// only the sections Nirili enabled for them; the server checks the same permissions on every
// request. Boat crew sign in here too and see only their assigned trips.
type Permission='excursions'|'transfers'|'rides'|'rooms'|'boats'|'buggies';
type Partner={id:string;name:string;contactName:string;phone:string;pickup:string;permissions:Permission[];commissionPercent:number;buggyOnline?:boolean;
 excursionDiscountPercent:number;roomDiscountPercent:number;transferDiscountPercent:number;autoConfirm:boolean};
type Section='excursions'|'transfers'|'rides'|'rooms'|'operations';
const SECTIONS:{id:Section;label:string;icon:any;needs:Permission[]}[]=[
 {id:'excursions',label:'Excursions',icon:Ticket,needs:['excursions']},
 {id:'transfers',label:'Speedboat seats',icon:ShipWheel,needs:['transfers']},
 {id:'rides',label:'Buggy rides',icon:Car,needs:['rides']},
 {id:'rooms',label:'Rooms & packages',icon:BedDouble,needs:['rooms']},
 {id:'operations',label:'My boats & buggies',icon:Anchor,needs:['boats','buggies']},
];

export default function PartnerPortal(){
 const [who,setWho]=useState<{partner:Partner|null;crew:CrewMember|null}|null|undefined>(undefined);
 const check=()=>fetch('/api/partner-portal/session',{cache:'no-store'}).then(r=>r.json()).then((d:any)=>setWho(d.partner||d.crew?d:null)).catch(()=>setWho(null));
 useEffect(()=>{void check();},[]);
 if(who===undefined)return <div className="pp-wrap"><p className="pp-muted">Loading…</p></div>;
 if(!who)return <Login onSignedIn={setWho}/>;
 if(who.crew)return <div className="op-portal" translate="no"><CrewWorkspace crew={who.crew} onSignedOut={()=>setWho(null)}/></div>;
 return <Shell partner={who.partner!} onSignedOut={()=>setWho(null)}/>;
}

function Login({onSignedIn}:{onSignedIn:(who:any)=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/partner-portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}),d:any=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'Could not sign in.');
   setPassword('');onSignedIn(d);
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 return <div className="pp-login-page">
  <div className="pp-login-copy">
   <p className="pp-kicker"><Handshake/> Nirili partners</p>
   <h1>Work with Nirili<br/><em>in one place.</em></h1>
   <p>Guest houses and travel agencies book excursions, speedboat seats, buggy rides and rooms for their guests. Speedboat companies and buggy owners run their trips and board guests. Boat crew see their trips.</p>
  </div>
  <form className="pp-login" onSubmit={submit}>
   <h2>Sign in</h2>
   <p className="pp-muted">Use the login Nirili or your operator gave you.</p>
   <label>Username<input required autoComplete="username" autoCapitalize="none" maxLength={40} value={username} onChange={e=>setUsername(e.target.value)}/></label>
   <label>Password<input required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {error&&<p className="pp-error" role="alert">{error}</p>}
   <button className="pp-primary" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight/></button>
   <small className="pp-muted">Want to work with Nirili? <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>.</small>
  </form>
 </div>;
}

function Shell({partner,onSignedOut}:{partner:Partner;onSignedOut:()=>void}){
 const sections=SECTIONS.filter(s=>s.needs.some(p=>partner.permissions.includes(p)));
 const [section,setSection]=useState<Section>(()=>{
  try{const saved=localStorage.getItem('nirili-partner-section') as Section;if(sections.some(s=>s.id===saved))return saved;}catch{}
  return sections[0]?.id||'excursions';
 });
 useEffect(()=>{try{localStorage.setItem('nirili-partner-section',section);}catch{}},[section]);
 async function signOut(){await fetch('/api/partner-portal/session',{method:'DELETE'}).catch(()=>null);onSignedOut();}
 const operator={...partner,services:[...(partner.permissions.includes('boats')?['boat' as const]:[]),...(partner.permissions.includes('buggies')?['buggy' as const]:[])]};
 return <div className="pp-wrap">
  <header className="pp-bar">
   <div><small>Nirili partner</small><strong>{partner.name}</strong></div>
   <div className="pp-bar-actions"><LanguagePicker tone="dark"/><button type="button" onClick={()=>void signOut()}><LogOut/>Sign out</button></div>
  </header>
  {sections.length>1&&<nav className="pp-tabs" aria-label="Partner sections">{sections.map(s=><button key={s.id} type="button" aria-pressed={section===s.id} onClick={()=>setSection(s.id)}><s.icon/>{s.label}</button>)}</nav>}
  {!sections.length&&<p className="pp-error">Nirili has not enabled anything for your account yet. Please contact Nirili.</p>}
  <section className="pp-section">
   {section==='excursions'&&<div className="nh"><AgentExcursions/></div>}
   {(section==='transfers'||section==='rides')&&<div className="nh nh-agent-wrap"><Travel kind={section} pickup={partner.pickup||partner.name}/></div>}
   {section==='rooms'&&<RoomPackages/>}
   {section==='operations'&&<div className="op-portal pp-ops" translate="no"><Workspace operator={operator} onSignedOut={onSignedOut}/></div>}
  </section>
 </div>;
}
