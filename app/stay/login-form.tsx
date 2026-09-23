'use client';
import {useState} from 'react';
import {ArrowRight,Eye,EyeOff,KeyRound,ShieldCheck} from 'lucide-react';
import AuthShell from '../auth-shell';
import {UiField,UiText} from '../ui-language';

export default function GuestStayLogin(){
 const [mode,setMode]=useState<'login'|'setup'>('login');
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [setupCode,setSetupCode]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[showNew,setShowNew]=useState(false);

 function switchMode(next:'login'|'setup'){
  if(busy)return;
  setMode(next);setError('');setPassword('');setSetupCode('');setNewPassword('');setConfirmPassword('');setShow(false);setShowNew(false);
 }

 async function submitLogin(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/guest-auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not sign in.');
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
   window.location.assign(d.redirect||'/stay');
  }catch(e){setError((e as Error).message);setBusy(false);}
 }

 return <AuthShell>
  <div className="nv-auth-heading">
   <span className="nv-eyebrow"><UiText>NIRILI VILLA · GUEST STAY</UiText></span>
   <h2><UiText>Guest portal</UiText></h2>
   <p><UiText>{mode==='setup'?'Create your own private password after check-in.':'Sign in with your room number and the password you created.'}</UiText></p>
  </div>

  <div className="nv-direct-login-badge">
   {mode==='setup'?<ShieldCheck size={20}/>:<KeyRound size={20}/>}
   <div><small><UiText>ACCESS</UiText></small><strong><UiText>{mode==='setup'?'First-time password setup':'In-house guest'}</UiText></strong></div>
  </div>

  <div className="nv-guest-auth-tabs" role="tablist" aria-label="Guest access">
   <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'active':''} onClick={()=>switchMode('login')}><UiText>Sign in</UiText></button>
   <button type="button" role="tab" aria-selected={mode==='setup'} className={mode==='setup'?'active':''} onClick={()=>switchMode('setup')}><UiText>Create password</UiText></button>
  </div>

  {mode==='login'?<form className="nv-login-form" onSubmit={submitLogin}>
   <label><UiText>Room number</UiText><UiField as="input" required inputMode="numeric" pattern="[0-9]*" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="e.g. 201"/></label>
   <label><UiText>Your password</UiText><span className="nv-password"><UiField as="input" required type={show?'text':'password'} autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your private password"/><UiField as="button" type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}><UiText>{show?<EyeOff size={20}/>:<Eye size={20}/>}</UiText></UiField></span></label>
   {error&&<p className="nv-login-error" role="alert"><UiText>{error}</UiText></p>}
   <button className="nv-submit" disabled={busy}><UiText>{busy?'Signing in…':'Open my stay'}</UiText><ArrowRight size={18}/></button>
   <p className="nv-phone-note"><UiText>First time here? Choose Create password and use the 5-digit setup code from reception.</UiText></p>
  </form>:<form className="nv-login-form" onSubmit={submitSetup}>
   <label><UiText>Room number</UiText><UiField as="input" required inputMode="numeric" pattern="[0-9]*" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="e.g. 201"/></label>
   <label><UiText>5-digit setup code</UiText><UiField as="input" required inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={5} value={setupCode} onChange={e=>setSetupCode(e.target.value.replace(/\D/g,'').slice(0,5))} placeholder="Code from reception"/></label>
   <label><UiText>Create password</UiText><span className="nv-password"><UiField as="input" required minLength={8} maxLength={128} type={showNew?'text':'password'} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="8 or more characters"/><UiField as="button" type="button" aria-label={showNew?'Hide password':'Show password'} onClick={()=>setShowNew(!showNew)}><UiText>{showNew?<EyeOff size={20}/>:<Eye size={20}/>}</UiText></UiField></span></label>
   <label><UiText>Confirm password</UiText><UiField as="input" required minLength={8} maxLength={128} type={showNew?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter it again"/></label>
   {error&&<p className="nv-login-error" role="alert"><UiText>{error}</UiText></p>}
   <button className="nv-submit" disabled={busy||newPassword.length<8||newPassword!==confirmPassword}><UiText>{busy?'Creating password…':'Create password & open my stay'}</UiText><ArrowRight size={18}/></button>
   <p className="nv-phone-note"><UiText>Your setup code works only until you create your private password. Reception does not need to know your new password.</UiText></p>
  </form>}
 </AuthShell>;
}
