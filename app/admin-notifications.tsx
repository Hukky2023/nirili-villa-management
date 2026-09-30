"use client";
import {startLiveRefresh} from "../lib/live-refresh";
import {Bell,CheckCheck,X} from "lucide-react";
import {useEffect,useMemo,useRef,useState} from "react";
import {UiText} from "./ui-language";

type Notice={id:string;type:string;title:string;detail:string;at:string;read:boolean;ref?:string};
type NoticeTarget="Bookings"|"Guests"|"Transfers"|"Excursions"|"WaterSports"|"Buggy"|"POS";
type Snapshot={stays?:any;services?:any;transport?:any;excursions?:any;chat?:any};
const SNAP_KEY="nirili-admin-notification-snapshot-v1";
const NOTICE_KEY="nirili-admin-notifications-v1";

const obj=(v:any)=>v&&typeof v==="object"?v:{};
const arr=(v:any)=>Array.isArray(v)?v:[];
const mapBy=(items:any[],key="id")=>new Map(items.filter(Boolean).map(x=>[String(x?.[key]??""),x]));
const changed=(a:any,b:any)=>JSON.stringify(a)!==JSON.stringify(b);
const time=()=>new Date().toISOString();

function labelOrder(o:any){
 const kind=String(o?.kind||"").toLowerCase();
 if(kind==="excursion")return "Excursion";
 if(kind==="transfer")return "Transport";
 if(kind==="food")return "Restaurant";
 if(kind==="buggy")return "Buggy";
 return String(o?.kind||"Service");
}
function push(list:Notice[],type:string,title:string,detail:string,id:string,ref?:string){
 list.push({id:type+":"+id+":"+Date.now()+":"+list.length,type,title,detail,at:time(),read:false,ref:ref||id});
}
function diffCollection(next:Notice[],oldItems:any[],newItems:any[],type:string,title:string,detail:(x:any)=>string){
 const old=mapBy(oldItems),fresh=mapBy(newItems);
 for(const [id,item] of fresh){
  if(!old.has(id))push(next,type,title,detail(item),id);
  else if(changed(old.get(id),item))push(next,type,title+" updated",detail(item),id);
 }
}
function buildNotices(previous:Snapshot,current:Snapshot){
 const out:Notice[]=[];
 const ps=obj(previous.stays),cs=obj(current.stays);
 diffCollection(out,arr(ps.stays),arr(cs.stays),"hotel","New hotel booking",s=>String(s.guest||"Guest")+" · "+String(s.id||"")+" · room "+String(s.room||"—"));
 const oldStays=mapBy(arr(ps.stays)),newStays=mapBy(arr(cs.stays));
 for(const [id,s] of newStays){
  const old=oldStays.get(id); if(!old)continue;
  if(!old.accountId&&s.accountId)push(out,"guest","New guest joined",String(s.guest||"Guest")+" · room "+String(s.room||"—"),id+":account");
  if(old.status!=="In House"&&s.status==="In House")push(out,"guest","Guest checked in",String(s.guest||"Guest")+" · room "+String(s.room||"—"),id+":checkin");
  const core=(x:any)=>({guest:x?.guest,room:x?.room,checkIn:x?.checkIn,checkOut:x?.checkOut,meal:x?.meal,pax:x?.pax,status:x?.status,whatsapp:x?.whatsapp,base:x?.base,payments:x?.payments,extensions:x?.extensions});
  if(changed(core(old),core(s))&&!(old.status!=="In House"&&s.status==="In House"))
   push(out,"change","Hotel booking changed",String(s.guest||"Guest")+" · "+String(s.id||id)+" · "+String(s.status||""),id+":hotel");
 }
 diffCollection(out,arr(ps.buggyBookings),arr(cs.buggyBookings),"buggy","New buggy booking",b=>String(b.guest||"Guest")+" · "+String(b.date||"")+" "+String(b.pickupTime||"")+" · "+String(b.location||"")+" → "+String(b.destination||""));
 const oldOrders=mapBy(arr(ps.orders)),newOrders=mapBy(arr(cs.orders));
 for(const [id,o] of newOrders){
  const old=oldOrders.get(id);
  const kind=labelOrder(o);
  if(!old)push(out,kind.toLowerCase(), "New "+kind+" booking",String(o.guest||"Guest")+" · "+String(o.name||kind)+" · "+String(o.date||""),id);
  else if(changed(old,o))push(out,"change",kind+" booking changed",String(o.guest||"Guest")+" · "+String(o.name||kind)+" · "+String(o.status||""),id+":order");
 }
 const psvc=obj(previous.services),csvc=obj(current.services);
 diffCollection(out,arr(psvc.requests),arr(csvc.requests),"hotel","New room booking",r=>String(r.guest||"Guest")+" · "+String(r.checkIn||"")+" → "+String(r.checkOut||""));
 diffCollection(out,arr(psvc.bookingChanges),arr(csvc.bookingChanges),"hotel","Guest booking action",r=>String(r.type==="cancel"?"Cancellation request":"Change request")+" · "+String(r.bookingId||"")+" · "+String(r.status||"Pending"));
 diffCollection(out,arr(psvc.excursionChanges),arr(csvc.excursionChanges),"excursion","Guest excursion action",r=>String(r.type==="cancel"?"Cancellation request":"Change request")+" · "+String(r.bookingId||"")+" · "+String(r.status||"Pending"));
 const pt=obj(previous.transport),ct=obj(current.transport);
 diffCollection(out,arr(pt.bookings),arr(ct.bookings),"transport","New transport booking",b=>{
  const j=arr(b.journeys)[0]||{};return String(b.guest||b.name||"Guest")+" · "+String(j.from||"")+" → "+String(j.to||"")+" · "+String(j.date||"")+" "+String(j.depart||"");
 });
 diffCollection(out,arr(pt.sailings),arr(ct.sailings),"change","Transport schedule changed",s=>String(s.boat||"Boat")+" · "+String(s.from||"")+" → "+String(s.to||"")+" · "+String(s.depart||""));
 const pe=obj(previous.excursions),ce=obj(current.excursions);
 diffCollection(out,arr(pe.records),arr(ce.records),"change","Excursion operation changed",r=>String(r.service||r.name||"Excursion")+" · "+String(r.time||"")+" · "+String(r.status||""));
 const pc=obj(previous.chat),cc=obj(current.chat);
 const oldContacts=mapBy(arr(pc.contacts)),newContacts=mapBy(arr(cc.contacts));
 for(const [id,c] of newContacts){
  const old=oldContacts.get(id);
  if(old&&c.lastGuestMessage&&c.lastGuestMessage!==old.lastGuestMessage)push(out,"message","New message",String(c.name||"Guest")+" sent a new message.",id+":message:"+String(c.lastGuestMessage),id);
 }
 return out;
}
async function getJson(url:string){
 try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)return undefined;return await r.json();}catch{return undefined}
}
function applicationKey(value:string){
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/'),raw=atob(normalized+'='.repeat((4-normalized.length%4)%4)),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
function nativePushBridge(){
 if(typeof window==='undefined')return undefined;
 const bridge=(window as any).NiriliNative;
 return bridge&&typeof bridge.getNotificationStatus==='function'?bridge:undefined;
}
async function saveNativeToken(token:string){
 const value=String(token||'').trim();
 if(!value)return false;
 const response=await fetch('/api/admin-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nativeToken:value,platform:'android'})});
 return response.ok;
}
function noticeTarget(n:Notice):NoticeTarget|undefined{
 const value=(n.type+" "+n.title+" "+n.detail).toLowerCase();
 if(n.type==="message")return undefined;
 if(n.type==="water-sports"||value.includes("water sports"))return "WaterSports";
 if(value.includes("buggy"))return "Buggy";
 if(value.includes("excursion"))return "Excursions";
 if(value.includes("transport")||value.includes("transfer"))return "Transfers";
 if(value.includes("restaurant")||value.includes("food"))return "POS";
 if(n.type==="guest")return "Guests";
 if(n.type==="hotel"||value.includes("hotel")||value.includes("booking"))return "Bookings";
 return undefined;
}

export default function AdminNotifications({onOpen}:{onOpen?:(module:NoticeTarget)=>void}){
 const [open,setOpen]=useState(false);
 const [notices,setNotices]=useState<Notice[]>([]);
 const [phoneStatus,setPhoneStatus]=useState<'checking'|'ready'|'enabled'|'blocked'|'unsupported'|'setup'|'error'>('checking');
 const [phoneBusy,setPhoneBusy]=useState(false);
 const started=useRef(false);
 const polling=useRef(false);
 useEffect(()=>{
  try{setNotices(JSON.parse(localStorage.getItem(NOTICE_KEY)||"[]"))}catch{}
  void (async()=>{
   const native=nativePushBridge();
   if(native){
    try{
     const token=String(native.getPushToken?.()||'');
     const status=String(native.getNotificationStatus?.()||'ready');
     if(token){setPhoneStatus(await saveNativeToken(token)?'enabled':'error');return;}
     setPhoneStatus(status==='blocked'?'blocked':status==='setup'?'setup':status==='error'?'error':'ready');
    }catch{setPhoneStatus('error');}
    return;
   }
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setPhoneStatus('unsupported');return;}
   if(Notification.permission==='denied'){setPhoneStatus('blocked');return;}
   if(Notification.permission!=='granted'){setPhoneStatus('ready');return;}
   try{
    const registration=await navigator.serviceWorker.register('/admin-push-sw.js',{scope:'/'});
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription){setPhoneStatus('ready');return;}
    const response=await fetch('/api/admin-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()})});
    setPhoneStatus(response.ok?'enabled':'error');
   }catch{setPhoneStatus('error');}
  })();
  void getJson("/api/notifications").then(server=>{
   if(Array.isArray(server?.notifications)){
    setNotices(server.notifications);
    try{localStorage.setItem(NOTICE_KEY,JSON.stringify(server.notifications))}catch{}
   }
  });
  const onNativePushStatus=(event:Event)=>{
   const detail=(event as CustomEvent).detail||{};
   const status=String(detail.status||'ready');
   const token=String(detail.token||'');
   setPhoneBusy(false);
   if(token)void saveNativeToken(token).then(ok=>setPhoneStatus(ok?'enabled':'error')).catch(()=>setPhoneStatus('error'));
   else setPhoneStatus(status==='blocked'?'blocked':status==='setup'?'setup':status==='error'?'error':'ready');
  };
  window.addEventListener('nirili:native-push-status',onNativePushStatus as EventListener);
  let stop=false;
  const poll=async()=>{
   if(stop||polling.current||document.hidden)return;
   polling.current=true;
   const [stays,services,transport,excursions,chat,serverNotices]=await Promise.all([
    getJson("/api/stays"),getJson("/api/guest-services"),getJson("/api/transport"),getJson("/api/operations?category=Excursions"),getJson("/api/chat"),getJson("/api/notifications")
   ]);
   const serverFingerprints=new Set<string>();
   if(Array.isArray(serverNotices?.notifications)){
    for(const n of serverNotices.notifications)serverFingerprints.add(String(n.type||'')+'|'+String(n.title||'')+'|'+String(n.detail||''));
    setNotices(existing=>{
     const byId=new Map<string,Notice>();
     for(const n of existing)byId.set(n.id,n);
     for(const n of serverNotices.notifications)byId.set(n.id,n);
     const merged=Array.from(byId.values()).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,150);
     try{localStorage.setItem(NOTICE_KEY,JSON.stringify(merged))}catch{}
     return merged;
    });
   }
   const current:Snapshot={};
   if(stays)current.stays=stays;if(services)current.services=services;if(transport)current.transport=transport;if(excursions)current.excursions=excursions;if(chat)current.chat=chat;
   try{
    const raw=localStorage.getItem(SNAP_KEY);
    const previous:Snapshot=raw?JSON.parse(raw):{};
    if(raw){
     const added=buildNotices(previous,{...previous,...current});
     if(added.length){
      setNotices(existing=>{
       const ids=new Set(existing.map(n=>n.id));const fresh=added.filter(n=>!ids.has(n.id)),merged=[...fresh,...existing].slice(0,150);
       localStorage.setItem(NOTICE_KEY,JSON.stringify(merged));
       if(fresh.length)void fetch("/api/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({notifications:fresh})}).catch(()=>{});
       return merged;
      });
      try{navigator.vibrate?.([120,70,120])}catch{}
     }
    }
    localStorage.setItem(SNAP_KEY,JSON.stringify({...previous,...current}));
   }catch{}
   polling.current=false;started.current=true;
  };
  poll();const stopLive=startLiveRefresh(poll);
  return()=>{stop=true;window.removeEventListener('nirili:native-push-status',onNativePushStatus as EventListener);stopLive()};
 },[]);
 const unread=useMemo(()=>notices.filter(n=>!n.read).length,[notices]);
 const save=(next:Notice[])=>{setNotices(next);try{localStorage.setItem(NOTICE_KEY,JSON.stringify(next))}catch{}};
 const markAll=()=>{save(notices.map(n=>({...n,read:true})));void fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}).catch(()=>{})};
 const markOne=(id:string)=>{save(notices.map(x=>x.id===id?{...x,read:true}:x));void fetch("/api/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:[id]})}).catch(()=>{})};
 const openNotice=(n:Notice)=>{markOne(n.id);setOpen(false);if(n.type==="message"){window.dispatchEvent(new CustomEvent("nirili:open-chat",{detail:{contactId:n.ref||""}}));return;}const target=noticeTarget(n);if(target)onOpen?.(target)};
 const clear=()=>{save([]);void fetch("/api/notifications",{method:"DELETE"}).catch(()=>{})};
 const testPhone=async()=>{
  try{
   const response=await fetch('/api/admin-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({test:true})});
   const data=await response.json();
   if(response.ok&&data?.sent>0)alert('Test notification sent to '+data.sent+' phone'+(data.sent===1?'':'s')+'. Lock the phone and check the notification.');
   else if(data?.total===0)alert('No Android phone token is registered yet. Keep the app open and logged in for 10 seconds, then try again.');
   else {
    const failure=data?.native?.failures?.[0];
    if(failure?.code==='UNREGISTERED'){
     const native=nativePushBridge();
     try{native?.refreshPushToken?.();}catch{}
     alert('The old phone notification token expired. A fresh token is being created now. Keep the app open for 10 seconds, then tap Send test notification again.');
     return;
    }
    const detail=failure?(' Status '+String(failure.status||0)+(failure.code?' · '+failure.code:'')+(failure.message?' · '+failure.message:'')):'';
    alert('Firebase could not deliver the test notification.'+detail);
   }
  }catch{alert('Could not send the test notification. Please retry.')}
 };
 const enablePhone=async()=>{
  if(phoneBusy||phoneStatus==='enabled')return;
  const native=nativePushBridge();
  if(native){
   if(phoneStatus==='blocked'){
    try{native.openNotificationSettings?.();}catch{setPhoneStatus('error');}
    return;
   }
   setPhoneBusy(true);
   try{native.requestNotificationPermission?.();}
   catch{setPhoneStatus('error');setPhoneBusy(false);}
   window.setTimeout(()=>setPhoneBusy(false),10000);
   return;
  }
  setPhoneBusy(true);
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setPhoneStatus('unsupported');return;}
   const permission=await Notification.requestPermission();
   if(permission!=='granted'){setPhoneStatus(permission==='denied'?'blocked':'ready');return;}
   const configResponse=await fetch('/api/admin-push',{cache:'no-store'}),config=await configResponse.json();
   if(!configResponse.ok||!config.publicKey)throw Error(config.error||'Push service is unavailable.');
   const registration=await navigator.serviceWorker.register('/admin-push-sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(config.publicKey)});
   const response=await fetch('/api/admin-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()})});
   if(!response.ok)throw Error('Could not save notification subscription.');
   setPhoneStatus('enabled');
  }catch{setPhoneStatus('error');}
  finally{setPhoneBusy(false);}
 };
 return <div className="nv-notifications">
  <button className={"nv-notification-trigger "+(unread?"has-unread":"")} onClick={()=>setOpen(v=>!v)} aria-label={"Notifications, "+unread+" unread"} aria-expanded={open}>
   <Bell size={17}/><span><UiText>Notifications</UiText></span><b>{unread}</b>
  </button>
  {open&&<><button className="nv-notification-backdrop" aria-label="Close notifications" onClick={()=>setOpen(false)}/><section className="nv-notification-panel">
   <header><div><strong><UiText>Notifications</UiText></strong><small><UiText>Bookings, messages, guests and system changes</UiText></small></div><button onClick={()=>setOpen(false)} aria-label="Close"><X size={18}/></button></header>
   <div className="nv-notification-actions"><button onClick={markAll} disabled={!unread}><CheckCheck size={15}/><UiText>Mark all as read</UiText></button></div>
   <div className="nv-notification-list">{notices.length?notices.map(n=><button key={n.id} className={n.read?"read":""} onClick={()=>openNotice(n)}>
    <i className={"type "+n.type}/><span><strong><UiText>{n.title}</UiText></strong><small><UiText>{n.detail}</UiText></small><time>{new Date(n.at).toLocaleString('en-GB',{timeZone:'Indian/Maldives',hour12:false})}</time></span>
   </button>):<p className="empty"><UiText>No notifications yet.</UiText></p>}</div>
  </section></>}
  <style jsx>{`
   .nv-notifications{position:relative}.nv-notification-trigger{height:34px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;border-radius:9px;padding:0 10px;display:flex;align-items:center;gap:6px;font:inherit;cursor:pointer}.nv-notification-trigger b{min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#fff;color:#0876b9;display:grid;place-items:center;font-size:11px}.nv-notification-trigger.has-unread b{background:#ffec6e;color:#222}.nv-notification-backdrop{position:fixed;inset:0;background:transparent;border:0;z-index:79}.nv-notification-panel{position:absolute;right:0;top:42px;width:min(390px,calc(100vw - 22px));max-height:min(650px,78vh);background:#fff;color:#17324a;border:1px solid #dbe5ec;border-radius:14px;box-shadow:0 18px 50px rgba(20,45,70,.22);z-index:80;overflow:hidden}.nv-notification-panel header{display:flex;align-items:flex-start;justify-content:space-between;padding:14px 14px 10px;border-bottom:1px solid #edf2f5}.nv-notification-panel header div{display:grid;gap:3px}.nv-notification-panel header strong{font-size:16px}.nv-notification-panel header small{font-size:11px;color:#6d7f8d}.nv-notification-panel header button{border:0;background:transparent;padding:4px;cursor:pointer}.nv-notification-actions{display:flex;gap:6px;padding:9px;border-bottom:1px solid #edf2f5;overflow:auto}.nv-notification-actions button{white-space:nowrap;border:1px solid #dce6ec;background:#f8fbfc;border-radius:8px;padding:7px 9px;display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer}.nv-notification-list{max-height:520px;overflow:auto}.nv-notification-list>button{width:100%;border:0;border-bottom:1px solid #edf2f5;background:#f4fbff;padding:11px 12px;text-align:left;display:flex;gap:9px;cursor:pointer}.nv-notification-list>button.read{background:#fff}.nv-notification-list .type{width:8px;height:8px;border-radius:50%;background:#1583c4;margin-top:5px;flex:0 0 auto}.nv-notification-list .type.message{background:#8a4bd6}.nv-notification-list .type.excursion{background:#16a085}.nv-notification-list .type.transport{background:#ef8b2c}.nv-notification-list .type.buggy{background:#d9a400}.nv-notification-list .type.guest{background:#27a35a}.nv-notification-list .type.change{background:#718096}.nv-notification-list span{display:grid;gap:3px}.nv-notification-list strong{font-size:13px}.nv-notification-list small{font-size:12px;color:#4f6372;line-height:1.35}.nv-notification-list time{font-size:10px;color:#8a99a5}.nv-notification-list .empty{padding:28px 16px;text-align:center;color:#7d8d99;font-size:13px}@media(max-width:700px){.nv-notification-trigger span{display:none}.nv-notification-trigger{padding:0 8px}.nv-notification-panel{position:fixed;top:72px;right:10px;left:10px;width:auto;max-height:78vh}}
  `}</style>
 </div>
}
