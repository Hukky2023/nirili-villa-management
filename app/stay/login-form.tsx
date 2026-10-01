'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,Eye,EyeOff,LockKeyhole,MapPin,Sun,Waves,Utensils,Compass,Car,LoaderCircle} from 'lucide-react';
import LanguageSelector,{UiField,UiText} from '../ui-language';
import './guest-login.css';

export default function GuestStayLogin(){
 const [mode,setMode]=useState<'login'|'setup'>('setup');
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [setupCode,setSetupCode]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[showNew,setShowNew]=useState(false);

 useEffect(()=>{
  if(new URLSearchParams(window.location.search).get('mode')==='setup')return;
  try{
   const room=localStorage.getItem('nirili-guest-password-room');
   if(room&&/^\d{3,10}$/.test(room)){setUsername(room);setMode('login');}
  }catch{}
 },[]);

 function rememberAccount(){
  try{localStorage.setItem('nirili-guest-password-room',username.trim());}catch{}
 }

 function switchMode(next:'login'|'setup'){
  if(busy)return;
  setMode(next);setError('');setPassword('');setSetupCode('');setNewPassword('');setConfirmPassword('');setShow(false);setShowNew(false);
 }

 async function submitLogin(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/guest-auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not sign in.');
   rememberAccount();
   window.location.assign(d.redirect||'/stay');
  }catch(e){setError((e as Error).message);setBusy(false);}
 }

 async function submitSetup(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  if(newPassword!==confirmPassword){setError('The two passwords do not match.');return;}
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/guest-auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,setupCode,password:newPassword,confirmPassword})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not create your password.');
   rememberAccount();
   window.location.assign(d.redirect||'/stay');
  }catch(e){setError((e as Error).message);setBusy(false);}
 }

 const setup=mode==='setup';
 return <main className="nv-guest-entry">
  <header className="nge-header">
   <a className="nge-brand" href="https://nirilihotels.com"><span className="nge-mark" aria-hidden="true"><Sun size={22}/><Waves size={30}/></span><span>Nirili Guest Portal<small><UiText>IN-HOUSE GUESTS · DHIFFUSHI</UiText></small></span></a>
   <div className="nge-language"><span><UiText>Language</UiText></span><LanguageSelector inline/></div>
  </header>
  <section className="nge-layout">
   <aside className="nge-welcome">
    <span className="nge-overline"><UiText>PRIVATE IN-HOUSE GUEST PORTAL</UiText></span>
    <h1><UiText>A little island.</UiText><br/><em><UiText>All yours to enjoy.</UiText></em></h1>
    <p><UiText>This separate portal is only for guests staying with Nirili Villa. Use your room access to reach Nirili services more conveniently.</UiText></p>
    <ul className="nge-services">
     <li><Utensils size={20}/><UiText>Order from Nirili Restaurant</UiText></li>
     <li><Compass size={20}/><UiText>Book Nirili Excursions</UiText></li>
     <li><Car size={20}/><UiText>Use Nirili Ride & Nirili Transfers</UiText></li>
    </ul>
    <footer><p><UiText>Arrive as a Guest, Leave as a Friend.</UiText></p><span><MapPin size={16}/><UiText>Dhiffushi Island, Maldives</UiText></span></footer>
   </aside>
   <section className="nge-card" aria-labelledby="nge-title">
    <div className="nge-mode" aria-label="Guest access">
     <button type="button" disabled={busy} aria-pressed={setup} className={setup?'selected':''} onClick={()=>switchMode('setup')}><UiText>Sign up</UiText></button>
     <button type="button" disabled={busy} aria-pressed={!setup} className={!setup?'selected':''} onClick={()=>switchMode('login')}><UiText>Sign in</UiText></button>
    </div>
    <div className="nge-heading">
     <span className="nge-overline"><UiText>IN-HOUSE GUEST PORTAL</UiText></span>
     <h2 id="nge-title"><UiText>{setup?'Make yourself at home.':'Welcome back.'}</UiText></h2>
     <p><UiText>{setup?'Use your room number and the setup code from reception to create your password.':'Enter your room number and private password to open your stay.'}</UiText></p>
    </div>
    <form className="nge-form" onSubmit={setup?submitSetup:submitLogin} aria-busy={busy}>
     <fieldset disabled={busy}>
      <div className={setup?'nge-room-code':'nge-single'}>
       <label htmlFor="nge-room"><UiText>Room number</UiText><UiField as="input" id="nge-room" name="username" required inputMode="numeric" pattern="[0-9]{3,10}" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="e.g. 101"/></label>
       {setup&&<label htmlFor="nge-code"><UiText>5-digit setup code</UiText><UiField as="input" id="nge-code" name="setupCode" required inputMode="numeric" pattern="[0-9]{5}" autoComplete="one-time-code" minLength={5} maxLength={5} value={setupCode} onChange={e=>setSetupCode(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="From reception"/></label>}
      </div>
      {setup?<>
       <label htmlFor="nge-new-password"><UiText>Create password</UiText><span className="nge-password"><UiField as="input" id="nge-new-password" name="newPassword" required minLength={8} maxLength={128} type={showNew?'text':'password'} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} aria-describedby="nge-password-help" placeholder="At least 8 characters"/><UiField as="button" type="button" aria-label={showNew?'Hide passwords':'Show passwords'} aria-pressed={showNew} onClick={()=>setShowNew(!showNew)}>{showNew?<EyeOff size={20}/>:<Eye size={20}/>}</UiField></span></label>
       <p className="nge-field-help" id="nge-password-help"><UiText>Choose a private password with at least 8 characters.</UiText></p>
       <label htmlFor="nge-confirm"><UiText>Confirm password</UiText><UiField as="input" id="nge-confirm" name="confirmPassword" required minLength={8} maxLength={128} type={showNew?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter your password again"/></label>
      </>:<label htmlFor="nge-password"><UiText>Your password</UiText><span className="nge-password"><UiField as="input" id="nge-password" name="password" required type={show?'text':'password'} autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your private password"/><UiField as="button" type="button" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={20}/>:<Eye size={20}/>}</UiField></span></label>}
      {error&&<p className="nge-error" role="alert"><UiText>{error}</UiText></p>}
      <button className="nge-submit" type="submit" disabled={busy}><UiText>{busy?(setup?'Creating password…':'Signing in…'):(setup?'Create password & continue':'Sign in to my stay')}</UiText>{busy?<LoaderCircle size={19} className="nge-spinner"/>:<ArrowRight size={19}/>}</button>
     </fieldset>
    </form>
    <div className="nge-switch"><UiText>{setup?'Already created your password?':'First time here?'}</UiText><button type="button" disabled={busy} onClick={()=>switchMode(setup?'login':'setup')}><UiText>{setup?'Sign in':'Set up your access'}</UiText></button></div>
    <details className="nge-help"><summary><UiText>{setup?'Need a setup code or password reset?':'Forgot your password?'}</UiText></summary><p><UiText>Ask reception for a new 5-digit code, then choose Sign up to create a new password. The code can only be used once.</UiText></p></details>
    <p className="nge-private"><LockKeyhole size={15}/><UiText>Your password stays private.</UiText></p>
   </section>
  </section>
  <footer className="nge-mobile-footer"><MapPin size={15}/><UiText>Dhiffushi Island, Maldives</UiText></footer>
 </main>;
}
