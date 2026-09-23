'use client';
import {UiText,UiField,UiOption} from './ui-language';

import {useState,useEffect} from 'react';
import './account-password.css';

export default function AccountPassword({user,autoReveal=false}:{user:any;autoReveal?:boolean}){
 const isGuest=user.role==='guest';
 const [currentPassword,setCurrentPassword]=useState(''),[open,setOpen]=useState(false),[password,setPassword]=useState(''),[available,setAvailable]=useState<boolean|null>(null),[draft,setDraft]=useState(''),[show,setShow]=useState(false),[mode,setMode]=useState('remember'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 async function request(body:any){
  const r=await fetch('/api/account-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id,...body})}),d=await r.json();
  if(!r.ok)throw Error(d.error);return d;
 }

 async function reveal(share=false){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const d=await request({action:'reveal'});
   setAvailable(d.available===true);
   if(!d.available){
    setPassword('');setShow(false);
    if(isGuest){
     setMessage('Guest has already created a private password. Reception cannot view it.');
     if(share)setOpen(false);
     return;
    }
    setOpen(true);setMessage('This older password is not available yet. Verify the current password or set a new one once.');return;
   }
   setPassword(d.password);setShow(true);
   if(share){setOpen(true);setMessage(isGuest?'Setup details are ready to share.':'Login details are ready. Tap Share login details below.');}
  }catch(e){setMessage((e as Error).message)}
  finally{setBusy(false);}
 }

 useEffect(()=>{if(autoReveal)void reveal();},[user.id,autoReveal]);

 function text(){
  const rooms=(user.stays||[]).filter((s:any)=>s.status!=='Checked Out').map((s:any)=>'Room '+s.room+' · '+s.meal).join('\n');
  if(isGuest){
   return 'Nirili Villa guest portal setup\nName: '+user.name+'\nRoom: '+user.username+'\nSetup code: '+password+'\n'+(rooms?rooms+'\n':'')+'Portal: https://booking.nirilihotels.com/stay\n\nOpen the portal, choose Create password, enter the room number and setup code, then create your own private password.';
  }
  const link=window.location.origin+'/login?portal=direct&username='+encodeURIComponent(user.username);
  return 'Nirili Villa login\nName: '+user.name+'\nUsername: '+user.username+'\nPassword: '+password+'\n'+(rooms?rooms+'\n':'')+'Login: '+link+'\n\nOpen the link and sign in. You will be taken directly to your assigned page.';
 }

 async function share(){
  if(!password)return;
  try{
   if(navigator.share)await navigator.share({title:isGuest?'Nirili Villa guest setup':'Nirili Villa login',text:text()});
   else{await navigator.clipboard.writeText(text());setMessage(isGuest?'Setup details copied. Paste them into WhatsApp or another app.':'Login details copied. Paste them into WhatsApp or another app.');}
  }catch(e){if((e as Error).name!=='AbortError')setMessage('Sharing unavailable. Use Copy details.');}
 }

 const masked=isGuest?'•••••':'••••••••';
 const primaryLabel=isGuest?'Setup code':'Password';
 const unavailableGuest=available===false;

 return <div className="account-password">
  <p><UiText>{primaryLabel+': '}</UiText><span><UiText>{unavailableGuest?'Private password created':show&&password?password:masked}</UiText></span></p>
  <div className="account-password-actions">
   {!unavailableGuest&&<button type="button" disabled={busy} onClick={()=>show?setShow(false):reveal()}><UiText>{show?(isGuest?'Hide setup code':'Hide password'):(isGuest?'Show setup code':'Show password')}</UiText></button>}
   {!unavailableGuest&&<button disabled={busy} onClick={()=>password?(setOpen(true),setMessage('')):reveal(true)}><UiText>{isGuest?'Share setup details':'Share login details'}</UiText></button>}
   {user.role!=='guest'&&<button onClick={()=>{setOpen(true);setMode('reset');setCurrentPassword('');setDraft('');setMessage('');}}><UiText>Manage password</UiText></button>}
  </div>

  {isGuest&&unavailableGuest&&<p role="status"><UiText>Guest chose their own password. Reception cannot view or share it.</UiText></p>}
  {message&&!open&&<p role="status"><UiText>{message}</UiText></p>}

  {open&&<div className="account-password-overlay"><UiField as="section" className="account-password-dialog" role="dialog" aria-modal="true" aria-label={isGuest?'Share guest setup':'Share account login'}>
   <h2><UiText>{isGuest?'Guest password setup':'Login details'}</UiText></h2>
   <p>{user.name} · <UiText>{user.role}</UiText></p>
   <p><UiText>{isGuest?'Room: ':'Username: '}</UiText><b>{user.username}</b></p>
   {user.stays?.filter((s:any)=>s.status!=='Checked Out').map((s:any)=><p key={s.id}><UiText>Room </UiText><UiText>{s.room}</UiText> · <UiText>{s.meal}</UiText></p>)}
   {password&&<><p><UiText>{isGuest?'Setup code: ':'Password: '}</UiText><b><UiText>{password}</UiText></b></p>
    {isGuest&&<p><UiText>Guest opens booking.nirilihotels.com/stay, chooses Create password, and uses this code once to create a private password.</UiText></p>}
    <div className="account-password-actions"><button className="primary" onClick={share}><UiText>{isGuest?'Share setup details':'Share login details'}</UiText></button><button onClick={async()=>{try{await navigator.clipboard.writeText(text());setMessage(isGuest?'Setup details copied.':'Login details copied.')}catch{setMessage('Copy unavailable. Select the displayed details to copy.')}}}><UiText>Copy details</UiText></button></div>
   </>}

   {user.role!=='guest'&&<form onSubmit={async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setMessage('');
    try{
     const result=await request({action:mode==='remember'?'remember':'reset',password:draft,currentPassword});
     if(result.signInAgain){setDraft('');setCurrentPassword('');setPassword('');setShow(false);setMessage('Password changed. Close this dialog, sign out, then sign in with your new password.');return;}
     setPassword(draft);setShow(true);setDraft('');setMessage('Password saved for Admin viewing and sharing.');
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
   }}>
    <h3><UiText>Manage password</UiText></h3>
    <label><UiText>Password action</UiText><select disabled={busy} value={mode} onChange={e=>setMode(e.target.value)}><UiOption value="remember">Verify and save current password</UiOption><UiOption value="reset">Set a new password</UiOption></select></label>
    {mode==='reset'&&<p><UiText>This replaces the password and signs this account out of other devices.</UiText></p>}
    {mode==='reset'&&user.role==='admin'&&<label><UiText>Current Admin password</UiText><input required type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>}
    <label><UiText>{mode==='remember'?'Current password':'New password'}</UiText><input required disabled={busy} minLength={8} maxLength={128} type="password" autoComplete={mode==='remember'?'current-password':'new-password'} value={draft} onChange={e=>setDraft(e.target.value)}/></label>
    <button disabled={busy}><UiText>{busy?'Saving…':mode==='remember'?'Verify & save':'Confirm new password'}</UiText></button>
   </form>}

   {message&&<p role="status"><UiText>{message}</UiText></p>}
   <button disabled={busy} onClick={()=>{setOpen(false);setShow(false);setPassword('');setDraft('');setMessage('');}}><UiText>Close</UiText></button>
  </UiField></div>}
 </div>;
}
