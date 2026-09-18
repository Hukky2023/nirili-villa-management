'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,Copy,KeyRound} from 'lucide-react';
import {tabNavigate} from '../../../lib/tab-navigation';
import {UiText,UiField} from '../../ui-language';
import DateFieldDMY from '../../date-field-dmy';
import {formatDateDMY} from '../../../lib/date-format';
import './style.css';

export default function WalkInExcursions(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[account,setAccount]=useState<any>(null);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[hotel,setHotel]=useState(''),[room,setRoom]=useState(''),[departureDate,setDepartureDate]=useState(''),[today,setToday]=useState(''),[service,setService]=useState('excursion');
 const [loginUser,setLoginUser]=useState(''),[loginPassword,setLoginPassword]=useState('');

 useEffect(()=>{const selected=new URLSearchParams(window.location.search).get('service');if(selected==='restaurant')setService('restaurant');(async()=>{try{const r=await fetch('/api/walkin-excursions',{cache:'no-store'}),d=await r.json();if(r.ok){setToday(d.today||'');if(!departureDate)setDepartureDate(d.today||'');if(d.signedIn)tabNavigate('/?portal=guest&service='+(selected==='restaurant'?'restaurant':'excursion'));}}catch{}})()},[]);

 async function createAccount(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/walkin-excursions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone:phone.replace(/[\s()-]/g,''),hotel,room,departureDate})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not create temporary login.');
   setAccount(d.account);setLoginUser(d.account.username);setLoginPassword(d.account.password);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 async function signIn(username=loginUser,password=loginPassword){
  if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,portal:'guest',returnTo:'/'})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not sign in.');
   const target=new URL(d.redirect,window.location.origin);
   target.searchParams.set('service',service);
   tabNavigate(target.pathname+target.search+target.hash);
  }catch(e){setError((e as Error).message);setBusy(false);}
 }

 async function copy(value:string){
  try{await navigator.clipboard.writeText(value);}catch{}
 }

 return <main className="walk-exc">
  <button className="walk-back" onClick={()=>tabNavigate('/login?portal=guest')}><UiText>← Back to guest options</UiText></button>
  <header><small><UiText>NIRILI VILLA · DHIFFUSHI</UiText></small><h1><UiText>Walk-in guest access</UiText></h1><p><UiText>Enter your information once. Your temporary login gives you access to both the restaurant and excursions until the date you leave Dhiffushi.</UiText></p></header>

  {error&&<p role="alert"><UiText>{error}</UiText></p>}

  {!account&&<form onSubmit={createAccount}>
   <h2><UiText>Your information</UiText></h2>
   <p className="walk-help"><UiText>Use the same temporary account for restaurant orders, excursion bookings and your bill.</UiText></p>
   <div className="walk-grid">
    <label><UiText>Your name</UiText><UiField as="input" required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></label>
    <label><UiText>WhatsApp / contact number</UiText><UiField as="input" type="tel" required maxLength={30} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+960…"/></label>
    <label><UiText>Hotel or meeting location</UiText><UiField as="input" required maxLength={150} value={hotel} onChange={e=>setHotel(e.target.value)} placeholder="Hotel name or visiting Dhiffushi"/></label>
    <label><UiText>Hotel room (optional)</UiText><UiField as="input" maxLength={50} value={room} onChange={e=>setRoom(e.target.value)} placeholder="Room number"/></label>
    <label><UiText>Date you are leaving Dhiffushi</UiText><DateFieldDMY required value={departureDate} min={today||undefined} onChange={setDepartureDate} ariaLabel="Departure date from Dhiffushi"/></label>
   </div>
   <button type="submit" disabled={busy}><UiText>{busy?'Creating login…':'Create temporary guest login'}</UiText><ArrowRight size={18}/></button>
  </form>}

  {account&&<section className="walk-account-created" role="status">
   <div className="walk-account-icon"><KeyRound size={28}/></div>
   <h2><UiText>Your temporary login is ready</UiText></h2>
   <p><UiText>Save these details. You can use them for both the restaurant and excursions.</UiText></p>
   <div className="walk-credentials">
    <div><span><UiText>Username</UiText></span><strong>{account.username}</strong><button type="button" onClick={()=>copy(account.username)} aria-label="Copy username"><Copy size={17}/></button></div>
    <div><span><UiText>Password</UiText></span><strong>{account.password}</strong><button type="button" onClick={()=>copy(account.password)} aria-label="Copy password"><Copy size={17}/></button></div>
   </div>
   <p className="walk-lifecycle"><UiText>Your temporary login will end automatically at the end of your departure date: </UiText>{formatDateDMY(account.departureDate)}</p>
   <button type="button" disabled={busy} onClick={()=>signIn(account.username,account.password)}><UiText>{busy?'Signing in…':'Continue to guest portal'}</UiText><ArrowRight size={18}/></button>
  </section>}

  <section className="walk-returning">
   <h2><UiText>Already have a temporary guest login?</UiText></h2>
   <p><UiText>Use the username and password provided when you registered.</UiText></p>
   <div className="walk-grid">
    <label><UiText>Username</UiText><UiField as="input" autoCapitalize="none" autoComplete="username" value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="exc-xxxxxxx"/></label>
    <label><UiText>Password</UiText><UiField as="input" type="password" autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Temporary password"/></label>
   </div>
   <button type="button" disabled={busy||!loginUser||!loginPassword} onClick={()=>signIn()}><UiText>{busy?'Signing in…':'Sign in to guest portal'}</UiText></button>
  </section>
 </main>;
}
