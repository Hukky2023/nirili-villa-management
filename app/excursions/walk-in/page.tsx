'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,Copy,KeyRound,Plus,Trash2} from 'lucide-react';
import {tabNavigate} from '../../../lib/tab-navigation';
import {UiText,UiField,UiOption} from '../../ui-language';
import DateFieldDMY from '../../date-field-dmy';
import {formatDateDMY} from '../../../lib/date-format';
import './style.css';

const ageOptions=[
 {value:'adult',label:'Adult (12+)'},
 {value:'child',label:'Child (3–11)'},
 {value:'infant',label:'Under 3'},
];

export default function WalkInExcursions(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[account,setAccount]=useState<any>(null);
 const [name,setName]=useState(''),[leadAge,setLeadAge]=useState('adult'),[companions,setCompanions]=useState<any[]>([]);
 const [phone,setPhone]=useState(''),[hotel,setHotel]=useState(''),[room,setRoom]=useState(''),[departureDate,setDepartureDate]=useState(''),[today,setToday]=useState('');
 const [loginUser,setLoginUser]=useState(''),[loginPassword,setLoginPassword]=useState('');

 useEffect(()=>{(async()=>{try{const r=await fetch('/api/walkin-excursions',{cache:'no-store'}),d=await r.json();if(r.ok){setToday(d.today||'');if(!departureDate)setDepartureDate(d.today||'');if(d.signedIn)tabNavigate('/?portal=guest&service=restaurant');}}catch{}})()},[]);

 function addCompanion(){setCompanions(current=>[...current,{name:'',ageCategory:''}]);}
 function updateCompanion(index:number,change:any){setCompanions(current=>current.map((guest,i)=>i===index?{...guest,...change}:guest));}
 function removeCompanion(index:number){setCompanions(current=>current.filter((_,i)=>i!==index));}

 async function createAccount(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const guests=[{name:name.trim(),ageCategory:leadAge},...companions.map(guest=>({name:String(guest.name||'').trim(),ageCategory:String(guest.ageCategory||'')}))];
   if(guests.some(guest=>!guest.name||!guest.ageCategory)){throw Error('Enter the name and age category for every guest.');}
   const normalizedPhone=phone.replace(/[\s()-]/g,'');
   if(!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)){throw Error('Enter a valid WhatsApp / contact number with country code, for example +960…');}
   const r=await fetch('/api/walkin-excursions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone:normalizedPhone,hotel,room,departureDate,guests})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not create temporary login.');
   setAccount(d.account);setLoginUser(d.account.username);setLoginPassword(d.account.password);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 async function signIn(username=loginUser,password=loginPassword){
  if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,portal:'direct',returnTo:'/'})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not sign in.');
   tabNavigate(d.redirect);
  }catch(e){setError((e as Error).message);setBusy(false);}
 }

 async function copy(value:string){try{await navigator.clipboard.writeText(value);}catch{}}

 return <main className="walk-exc">
  <header><small><UiText>NIRILI VILLA · DHIFFUSHI</UiText></small><h1><UiText>Walk-in guest access</UiText></h1><p><UiText>Register once for restaurant ordering and excursion bookings. Your login stays active only until the end of your departure date.</UiText></p></header>

  {error&&<p role="alert"><UiText>{error}</UiText></p>}

  {!account&&<form onSubmit={createAccount}>
   <h2><UiText>Register your group</UiText></h2>
   <p className="walk-help"><UiText>Tell us who is with you, where you are staying and when you leave Dhiffushi.</UiText></p>

   <section className="walk-lead-guest">
    <div className="walk-section-title"><div><strong><UiText>You</UiText></strong><small><UiText>Lead guest</UiText></small></div></div>
    <div className="walk-grid">
     <label><UiText>Your full name</UiText><UiField as="input" required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></label>
     <label><UiText>Age category</UiText><select required value={leadAge} onChange={e=>setLeadAge(e.target.value)}><UiText>{ageOptions.map(option=><UiOption key={option.value} value={option.value}>{option.label}</UiOption>)}</UiText></select></label>
    </div>
   </section>

   <section className="walk-companions">
    <div className="walk-section-title"><div><strong><UiText>Accompanying guests</UiText></strong><small><UiText>Add everyone travelling with you.</UiText></small></div><button type="button" onClick={addCompanion}><Plus size={17}/><UiText>Add person</UiText></button></div>
    {!companions.length&&<p className="walk-empty-companions"><UiText>No accompanying guests added.</UiText></p>}
    <div className="walk-companion-list">{companions.map((guest,index)=><div className="walk-companion-row" key={index}>
     <span><UiText>Guest </UiText>{index+2}</span>
     <label><UiText>Name</UiText><UiField as="input" required maxLength={100} value={guest.name} onChange={e=>updateCompanion(index,{name:e.target.value})} placeholder="Full name"/></label>
     <label><UiText>Age category</UiText><select required value={guest.ageCategory} onChange={e=>updateCompanion(index,{ageCategory:e.target.value})}><UiOption value="">Choose category</UiOption><UiText>{ageOptions.map(option=><UiOption key={option.value} value={option.value}>{option.label}</UiOption>)}</UiText></select></label>
     <button type="button" className="walk-remove-person" onClick={()=>removeCompanion(index)} aria-label={'Remove guest '+(index+2)}><Trash2 size={17}/></button>
    </div>)}</div>
   </section>

   <section className="walk-stay-details">
    <div className="walk-section-title"><div><strong><UiText>Where are you staying?</UiText></strong><small><UiText>Your temporary login expires automatically after you leave.</UiText></small></div></div>
    <div className="walk-grid">
     <label><UiText>Hotel / guesthouse / location</UiText><UiField as="input" required maxLength={150} value={hotel} onChange={e=>setHotel(e.target.value)} placeholder="Where you are staying"/></label>
     <label><UiText>Room number (optional)</UiText><UiField as="input" maxLength={50} value={room} onChange={e=>setRoom(e.target.value)} placeholder="Room number"/></label>
     <label><UiText>Staying until</UiText><DateFieldDMY required value={departureDate} min={today||undefined} onChange={setDepartureDate} ariaLabel="Departure date from Dhiffushi"/></label>
     <label><UiText>WhatsApp / contact</UiText><UiField as="input" type="tel" required maxLength={30} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960…"/><small><UiText>Required. Include country code, for example +960…</UiText></small></label>
    </div>
   </section>

   <div className="walk-registration-summary"><strong>{1+companions.length} <UiText>{companions.length?'people':'person'}</UiText></strong><span><UiText>One group login · Restaurant · Excursions</UiText></span></div>
   <button type="submit" disabled={busy}><UiText>{busy?'Creating login…':'Create guest login'}</UiText><ArrowRight size={18}/></button>
  </form>}

  {account&&<section className="walk-account-created" role="status">
   <div className="walk-account-icon"><KeyRound size={28}/></div>
   <h2><UiText>Your guest login is ready</UiText></h2>
   <p><UiText>Save these details. This login opens the restaurant menu, food ordering and excursion booking portal.</UiText></p>
   <div className="walk-credentials">
    <div><span><UiText>Username</UiText></span><strong>{account.username}</strong><button type="button" onClick={()=>copy(account.username)} aria-label="Copy username"><Copy size={17}/></button></div>
    <div><span><UiText>Password</UiText></span><strong>{account.password}</strong><button type="button" onClick={()=>copy(account.password)} aria-label="Copy password"><Copy size={17}/></button></div>
   </div>
   <p className="walk-lifecycle"><UiText>This login will automatically deactivate after your departure date: </UiText>{formatDateDMY(account.departureDate)}</p>
   <button type="button" disabled={busy} onClick={()=>signIn(account.username,account.password)}><UiText>{busy?'Signing in…':'Enter guest portal'}</UiText><ArrowRight size={18}/></button>
  </section>}

  <section className="walk-returning">
   <h2><UiText>Already registered?</UiText></h2>
   <p><UiText>Use the temporary username and password created when you scanned the QR code.</UiText></p>
   <div className="walk-grid">
    <label><UiText>Username</UiText><UiField as="input" autoCapitalize="none" autoComplete="username" value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="exc-xxxxxxx"/></label>
    <label><UiText>Password</UiText><UiField as="input" type="password" autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Temporary password"/></label>
   </div>
   <button type="button" disabled={busy||!loginUser||!loginPassword} onClick={()=>signIn()}><UiText>{busy?'Signing in…':'Sign in'}</UiText></button>
  </section>
 </main>;
}
