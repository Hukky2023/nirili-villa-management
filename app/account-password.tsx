'use client';
import {UiText,UiField,UiOption} from './ui-language';

import {useState,useEffect} from 'react';
import './account-password.css';

export default function AccountPassword({user,autoReveal=false}:{user:any;autoReveal?:boolean}){
 const isGuest=user.role==='guest';
 const [currentPassword,setCurrentPassword]=useState(''),[open,setOpen]=useState(false),[password,setPassword]=useState(''),[available,setAvailable]=useState<boolean|null>(null),[draft,setDraft]=useState(''),[show,setShow]=useState(false),[mode,setMode]=useState('reset'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

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

 async function resetGuestPassword(){
  if(!isGuest||busy)return;
  if(!window.confirm('Reset this guest password? The current password will stop working immediately and all guest sessions will be signed out.'))return;
  setBusy(true);setMessage('');
  try{
   const d=await request({action:'guest-reset-code'});
   setAvailable(true);setPassword(d.setupCode||'');setShow(true);setOpen(true);
   setMessage('Password reset. The guest must create a new password using this one-time setup code. Their previous password no longer works.');
  }catch(e){setMessage((e as Error).message)}
  finally{setBusy(false);}
 }

 useEffect(()=>{if(autoReveal&&isGuest)void reveal();},[user.id,autoReveal]);

 function text(){
  const rooms=(user.stays||[]).filter((s:any)=>s.status!=='Checked Out').map((s:any)=>'Room '+s.room+' · '+s.meal).join('\n');
  if(isGuest){
   return 'Nirili Villa guest portal setup\nName: '+user.name+'\nRoom: '+user.username+'\nSetup code: '+password+'\n'+(rooms?rooms+'\n':'')+'Portal: https://booking.nirilihotels.com/stay?mode=setup\n\nOpen the portal, choose Create password, enter the room number and setup code, then create your own private password.';
  }
  const link=window.location.origin+'/login?portal=direct&username='+encodeURIComponent(user.username);
  return 'Nirili Villa login\nName: '+user.name+'\nUsername: '+user.username+'\nPassword: '+password+'\n'+(rooms?rooms+'\n':'')+'Login: '+link+'\n\nOpen the link and sign in. You will be taken directly to your assigned page.';
 }

 const guestStay=(user.stays||[]).find((s:any)=>s.status==='In House')||(user.stays||[]).find((s:any)=>s.status==='Confirmed');
 const guestPhone=String(guestStay?.whatsapp||user.whatsapp||user.walkIn?.phone||'').trim();
 const whatsappPhone=guestPhone.replace(/[\s()+.-]/g,'').replace(/^00/,'');

 async function share(){
  if(!password)return;
  if(isGuest){
   if(!/^[1-9]\d{7,14}$/.test(whatsappPhone)){
    setMessage('Save a valid guest WhatsApp number with country code in the booking details, then reopen guest access.');
    return;
   }
   window.open('https://wa.me/'+whatsappPhone+'?text='+encodeURIComponent(text()),'_blank','noopener,noreferrer');
   setMessage('WhatsApp opened for the guest. Review the message and tap Send.');
   return;
  }
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
   {isGuest&&!unavailableGuest&&<button type="button" disabled={busy} onClick={()=>show?setShow(false):reveal()}><UiText>{show?(isGuest?'Hide setup code':'Hide password'):(isGuest?'Show setup code':'Show password')}</UiText></button>}
   {isGuest&&!unavailableGuest&&<button disabled={busy} onClick={()=>password?(setOpen(true),setMessage('')):reveal(true)}><UiText>{isGuest?'Share setup details':'Share login details'}</UiText></button>}
   {isGuest&&unavailableGuest&&<button type="button" disabled={busy} onClick={resetGuestPassword}><UiText>{busy?'Resetting…':'Reset guest password'}</UiText></button>}
   {user.role!=='guest'&&<button onClick={()=>{setOpen(true);setMode('reset');setCurrentPassword('');setDraft('');setMessage('');}}><UiText>Manage password</UiText></button>}
  </div>

  {isGuest&&available===true&&<p role="status"><UiText>Password setup required. Share the setup code so the guest can create a new private password.</UiText></p>}
  {isGuest&&unavailableGuest&&<p role="status"><UiText>Guest chose their own password. Reception cannot view it. If the guest forgets it, use Reset guest password to issue a new one-time setup code.</UiText></p>}
  {message&&!open&&<p role="status"><UiText>{message}</UiText></p>}

  {open&&<div className="account-password-overlay"><UiField as="section" className="account-password-dialog" role="dialog" aria-modal="true" aria-label={isGuest?'Share guest setup':'Share account login'}>
   <h2><UiText>{isGuest?'Guest password setup':'Login details'}</UiText></h2>
   <p>{user.name} · <UiText>{user.role}</UiText></p>
   <p><UiText>{isGuest?'Room: ':'Username: '}</UiText><b>{user.username}</b></p>
   {user.stays?.filter((s:any)=>s.status!=='Checked Out').map((s:any)=><p key={s.id}><UiText>Room </UiText><UiText>{s.room}</UiText> · <UiText>{s.meal}</UiText></p>)}
   {password&&<><p><UiText>{isGuest?'Setup code: ':'Password: '}</UiText><b><UiText>{password}</UiText></b></p>
    {isGuest&&<p><UiText>WhatsApp recipient: </UiText><b>{guestPhone||'No WhatsApp number saved'}</b></p>}
    {isGuest&&<p><UiText>Guest opens booking.nirilihotels.com/stay, chooses Create password, and uses this code once to create a private password.</UiText></p>}
    <div className="account-password-actions"><button className="primary" onClick={share}><UiText>{isGuest?'Open guest WhatsApp':'Share login details'}</UiText></button><button onClick={async()=>{try{await navigator.clipboard.writeText(text());setMessage(isGuest?'Setup details copied.':'Login details copied.')}catch{setMessage('Copy unavailable. Select the displayed details to copy.')}}}><UiText>Copy details</UiText></button></div>
   </>}

   {user.role!=='guest'&&<form onSubmit={async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setMessage('');
    try{
     const result=await request({action:mode==='remember'?'remember':'reset',password:draft,currentPassword});
     if(result.signInAgain){setDraft('');setCurrentPassword('');setPassword('');setShow(false);setMessage('Password changed. Close this dialog, sign out, then sign in with your new password.');return;}
     setPassword(draft);setShow(true);setDraft('');setMessage('Password changed. You can share it now; it cannot be viewed again after closing.');
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
   }}>
    <h3><UiText>Manage password</UiText></h3>
    <label><UiText>Password action</UiText><select disabled={busy} value={mode} onChange={e=>setMode(e.target.value)}><UiOption value="reset">Set a new password</UiOption></select></label>
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

