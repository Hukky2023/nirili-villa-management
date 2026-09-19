"use client";

import {UiText,UiField} from '../ui-language';
import {tabNavigate} from '../../lib/tab-navigation';
import {useState} from 'react';
import {ArrowRight,Eye,EyeOff,LogIn} from 'lucide-react';
import AuthShell from '../auth-shell';

const portalLabel=(portal:string)=>({
 admin:'Admin',
 staff:'Staff',
 guest:'Guest',
 crew_member:'Crew Member',
 buggy_driver:'Buggy Driver',
 restaurant_cashier:'Restaurant Cashier',
 restaurant_waiter:'Restaurant Waiter',
 restaurant_kitchen:'Kitchen',
 restaurant_guest:'Guest',
 direct:'Account'
} as Record<string,string>)[portal]||'Account';

export default function LoginForm({portal='direct',returnTo='',restaurant=false,initialUsername=''}:{portal?:string;returnTo?:string;restaurant?:boolean;initialUsername?:string}){
 const [username,setUsername]=useState(initialUsername),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const target=portal||'direct',label=portalLabel(target);

 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,portal:target,returnTo,restaurant})});
   const d=await r.json();if(!r.ok)throw Error(d.error);
   tabNavigate(d.redirect);
  }catch(e){setError((e as Error).message);setBusy(false);}
 }

 return <AuthShell>
  <div className="nv-auth-heading">
   <span className="nv-eyebrow"><UiText>NIRILI VILLA · SECURE LOGIN</UiText></span>
   <h2><UiText>Sign in</UiText></h2>
   <p><UiText>Use the login details sent to you by Nirili Villa.</UiText></p>
  </div>
  <div className="nv-direct-login-badge"><LogIn size={20}/><div><small><UiText>ACCESS</UiText></small><strong><UiText>{label}</UiText></strong></div></div>
  <form className="nv-login-form" onSubmit={submit}>
   <label><UiText>Username</UiText><UiField as="input" required autoCapitalize="none" spellCheck={false} autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Your username"/></label>
   <label><UiText>Password</UiText><span className="nv-password"><UiField as="input" required type={show?'text':'password'} autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/><UiField as="button" type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}><UiText>{show?<EyeOff size={20}/>:<Eye size={20}/>}</UiText></UiField></span></label>
   <UiText>{error&&<p className="nv-login-error" role="alert"><UiText>{error}</UiText></p>}</UiText>
   <button className="nv-submit" disabled={busy}><UiText>{busy?'Signing in…':'Sign in'}</UiText><ArrowRight size={18}/></button>
   <p className="nv-phone-note"><UiText>After sign-in you will be sent directly to the page assigned to this account.</UiText></p>
  </form>
 </AuthShell>;
}
