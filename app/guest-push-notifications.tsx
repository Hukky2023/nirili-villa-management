'use client';

import {useEffect,useState} from 'react';
import {BellRing,BellOff,CheckCircle2} from 'lucide-react';
import {UiText} from './ui-language';

type Status='checking'|'ready'|'enabled'|'blocked'|'unsupported'|'error';

function applicationKey(value:string){
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/'),raw=atob(normalized+'='.repeat((4-normalized.length%4)%4)),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;
}

export default function GuestPushNotifications(){
 const [status,setStatus]=useState<Status>('checking'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 async function syncExisting(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setStatus('unsupported');return;}
  if(Notification.permission==='denied'){setStatus('blocked');return;}
  if(Notification.permission!=='granted'){setStatus('ready');return;}
  try{
   const registration=await navigator.serviceWorker.register('/guest-push-sw.js',{scope:'/'});
   const subscription=await registration.pushManager.getSubscription();
   if(!subscription){setStatus('ready');return;}
   const response=await fetch('/api/guest-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()})});
   if(!response.ok)throw Error('Could not sync notification subscription.');
   setStatus('enabled');
  }catch{setStatus('error');}
 }

 useEffect(()=>{void syncExisting()},[]);

 async function enable(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setStatus('unsupported');return;}
   const permission=await Notification.requestPermission();
   if(permission!=='granted'){setStatus(permission==='denied'?'blocked':'ready');return;}
   const configResponse=await fetch('/api/guest-push',{cache:'no-store'}),config=await configResponse.json();
   if(!configResponse.ok||!config.publicKey)throw Error(config.error||'Push service is unavailable.');
   const registration=await navigator.serviceWorker.register('/guest-push-sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(config.publicKey)});
   const response=await fetch('/api/guest-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()})}),saved=await response.json();
   if(!response.ok)throw Error(saved.error||'Could not save notification subscription.');
   setStatus('enabled');setMessage('Ride notifications are enabled on this device.');
  }catch(error){setStatus('error');setMessage(error instanceof Error?error.message:'Could not enable notifications.');}
  finally{setBusy(false);}
 }

 async function disable(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const registration=await navigator.serviceWorker.getRegistration('/'),subscription=await registration?.pushManager.getSubscription();
   const endpoint=subscription?.endpoint||'';
   if(subscription)await subscription.unsubscribe();
   if(endpoint)await fetch('/api/guest-push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint})});
   setStatus('ready');setMessage('Ride notifications are disabled on this device.');
  }catch{setMessage('Could not disable notifications. Try again.');}
  finally{setBusy(false);}
 }

 return <section className={'guest-push '+status}>
  <div className="guest-push-icon">{status==='enabled'?<CheckCircle2/>:status==='blocked'?<BellOff/>:<BellRing/>}</div>
  <div className="guest-push-copy"><strong><UiText>Buggy ride notifications</UiText></strong>
   <span><UiText>{status==='enabled'?'Enabled — alerts can appear even when the guest portal is closed.':status==='blocked'?'Notifications are blocked in your browser settings.':status==='unsupported'?'Background notifications are not available in this browser. On iPhone, install the guest portal to the Home Screen and allow notifications.':'Enable alerts for buggy assignment, driver arrival, ride start and completion.'}</UiText></span>
   {message&&<small role="status"><UiText>{message}</UiText></small>}
  </div>
  {status==='enabled'?<button type="button" disabled={busy} onClick={disable}><UiText>{busy?'Saving…':'Disable'}</UiText></button>:!['blocked','unsupported','checking'].includes(status)&&<button type="button" className="primary" disabled={busy} onClick={enable}><UiText>{busy?'Enabling…':'Enable notifications'}</UiText></button>}
 </section>;
}
