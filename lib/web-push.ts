import {authDb} from './auth';

type PushKeys={p256dh:string;auth:string};
type StoredSubscription={endpoint:string;expirationTime?:number|null;keys:PushKeys;createdAt:string;updatedAt:string};
type VapidPair={publicKey:string;privateKey:string;createdAt:string};

const vapidRecordKey='guest-web-push-vapid-v1';
const enc=new TextEncoder();

async function ensureTables(){
 const db=authDb();
 await db.prepare('CREATE TABLE IF NOT EXISTS guest_push_config (key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS guest_push_subscriptions (account_id TEXT NOT NULL, endpoint TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,endpoint))').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS admin_push_subscriptions (account_id TEXT NOT NULL, endpoint TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,endpoint))').run();
}

function concat(...parts:Uint8Array[]){
 const size=parts.reduce((n,p)=>n+p.byteLength,0),out=new Uint8Array(size);
 let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength;}return out;
}
function b64url(input:ArrayBuffer|Uint8Array){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64url(value:string){
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/'),padded=normalized+'='.repeat((4-normalized.length%4)%4),raw=atob(padded),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
async function hmac(key:Uint8Array,data:Uint8Array){
 const cryptoKey=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,data));
}
async function hkdfExpand(prk:Uint8Array,info:Uint8Array,length:number){
 const block=await hmac(prk,concat(info,new Uint8Array([1])));
 return block.slice(0,length);
}
async function storedVapid():Promise<VapidPair>{
 await ensureTables();
 const db=authDb(),existing=await db.prepare('SELECT payload FROM guest_push_config WHERE key=?').bind(vapidRecordKey).first<any>();
 if(existing?.payload){
  try{const parsed=JSON.parse(existing.payload);if(parsed?.publicKey&&parsed?.privateKey)return parsed;}catch{}
 }
 const pair:any=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const created:VapidPair={publicKey:b64url(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey:b64url(await crypto.subtle.exportKey('pkcs8',pair.privateKey)),createdAt:new Date().toISOString()};
 await db.prepare('INSERT OR IGNORE INTO guest_push_config(key,payload,updated_at) VALUES(?,?,?)').bind(vapidRecordKey,JSON.stringify(created),new Date().toISOString()).run();
 const row=await db.prepare('SELECT payload FROM guest_push_config WHERE key=?').bind(vapidRecordKey).first<any>();
 if(!row?.payload)throw Error('Could not initialize web push.');
 const saved=JSON.parse(row.payload);if(!saved?.publicKey||!saved?.privateKey)throw Error('Web push keys are unavailable.');
 return saved;
}
async function readSubscriptions(accountId:string):Promise<StoredSubscription[]>{
 await ensureTables();
 const rows=(await authDb().prepare('SELECT payload FROM guest_push_subscriptions WHERE account_id=? ORDER BY updated_at DESC LIMIT 5').bind(accountId).all<any>()).results||[];
 return rows.map((row:any)=>{try{return JSON.parse(row.payload)}catch{return null}}).filter((x:any)=>x?.endpoint&&x?.keys?.p256dh&&x?.keys?.auth);
}
async function writeSubscription(accountId:string,subscription:StoredSubscription){
 await ensureTables();
 await authDb().prepare('INSERT INTO guest_push_subscriptions(account_id,endpoint,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,endpoint) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(accountId,subscription.endpoint,JSON.stringify(subscription),subscription.updatedAt).run();
 const extras=(await authDb().prepare('SELECT endpoint FROM guest_push_subscriptions WHERE account_id=? ORDER BY updated_at DESC LIMIT -1 OFFSET 5').bind(accountId).all<any>()).results||[];
 if(extras.length)await authDb().batch(extras.map((row:any)=>authDb().prepare('DELETE FROM guest_push_subscriptions WHERE account_id=? AND endpoint=?').bind(accountId,String(row.endpoint))));
}
async function deleteSubscription(accountId:string,endpoint?:string){
 await ensureTables();
 if(endpoint)await authDb().prepare('DELETE FROM guest_push_subscriptions WHERE account_id=? AND endpoint=?').bind(accountId,endpoint).run();
 else await authDb().prepare('DELETE FROM guest_push_subscriptions WHERE account_id=?').bind(accountId).run();
}

function cleanSubscription(raw:any):StoredSubscription{
 const endpoint=String(raw?.endpoint||'').trim(),p256dh=String(raw?.keys?.p256dh||'').trim(),auth=String(raw?.keys?.auth||'').trim();
 let url:URL;try{url=new URL(endpoint)}catch{throw Error('Invalid push subscription endpoint.')}
 if(!validPushEndpoint(endpoint)||endpoint.length>2200||p256dh.length<40||p256dh.length>300||auth.length<10||auth.length>120)throw Error('Invalid push subscription.');
 const now=new Date().toISOString();
 return {endpoint,expirationTime:Number.isFinite(Number(raw?.expirationTime))?Number(raw.expirationTime):null,keys:{p256dh,auth},createdAt:now,updatedAt:now};
}

export async function guestPushPublicKey(){return (await storedVapid()).publicKey;}

export async function saveGuestPushSubscription(accountId:string,raw:any){
 const next=cleanSubscription(raw),items=await readSubscriptions(accountId),old=items.find(x=>x.endpoint===next.endpoint);
 const merged={...next,createdAt:old?.createdAt||next.createdAt};
 await writeSubscription(accountId,merged);
 return merged;
}

export async function removeGuestPushSubscription(accountId:string,endpoint?:string){
 await deleteSubscription(accountId,endpoint);return true;
}

async function vapidAuthorization(endpoint:string,pair:VapidPair){
 const audience=new URL(endpoint).origin,header=b64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),payload=b64url(enc.encode(JSON.stringify({aud:audience,exp:Math.floor(Date.now()/1000)+12*60*60,sub:'mailto:nirilivilla@gmail.com'}))),unsigned=header+'.'+payload;
 const privateKey=await crypto.subtle.importKey('pkcs8',fromB64url(pair.privateKey),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,enc.encode(unsigned));
 return 'vapid t='+unsigned+'.'+b64url(signature)+', k='+pair.publicKey;
}

async function encryptedBody(subscription:StoredSubscription,payload:string){
 const uaPublic=fromB64url(subscription.keys.p256dh),authSecret=fromB64url(subscription.keys.auth);
 if(uaPublic.length!==65||uaPublic[0]!==4||authSecret.length<16)throw Error('Invalid browser push keys.');
 const server:any=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const clientKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:clientKey},server.privateKey,256));
 const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',server.publicKey));
 const authPrk=await hmac(authSecret,shared);
 const ikm=await hkdfExpand(authPrk,concat(enc.encode('WebPush: info\0'),uaPublic,serverPublic),32);
 const salt=crypto.getRandomValues(new Uint8Array(16)),prk=await hmac(salt,ikm);
 const cek=await hkdfExpand(prk,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdfExpand(prk,enc.encode('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
 const plaintext=concat(enc.encode(payload),new Uint8Array([2]));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,plaintext));
 const header=new Uint8Array(21+serverPublic.length);header.set(salt,0);new DataView(header.buffer).setUint32(16,4096,false);header[20]=serverPublic.length;header.set(serverPublic,21);
 return concat(header,ciphertext);
}

async function sendOne(subscription:StoredSubscription,payload:string,pair:VapidPair){
 if(subscription.expirationTime&&subscription.expirationTime<Date.now())return {ok:false,gone:true};
 const body=await encryptedBody(subscription,payload),authorization=await vapidAuthorization(subscription.endpoint,pair);
 if(!validPushEndpoint(subscription.endpoint))throw Error('Unsupported push provider.');
 const response=await fetch(subscription.endpoint,{redirect:'error',method:'POST',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','TTL':'300','Urgency':'high'},body});
 return {ok:response.ok,status:response.status,gone:response.status===404||response.status===410};
}

function rideMessage(ride:any,event:string){
 const buggy=String(ride.buggyName||ride.buggyId||'Your buggy'),driver=String(ride.buggyDriver||ride.driver||'Your driver'),pickup=String(ride.location||'your pickup point'),destination=String(ride.destination||'your destination'),room=String(ride.room||'');
 const fare=Math.max(0,Number(ride.fareCents)||0);
 if(event==='assigned')return {title:'Buggy assigned',body:buggy+(driver?' · '+driver:'')+' has been assigned to your ride.'};
 if(event==='on-the-way')return {title:'Driver on the way',body:driver+' is now on the way to '+pickup+'.'};
 if(event==='arrived')return {title:'Your buggy has arrived',body:driver+' is waiting at '+pickup+'.'};
 if(event==='started')return {title:'Buggy ride started',body:pickup+' → '+destination+'.'};
 if(event==='completed')return {title:'Ride completed',body:fare>0&&ride.chargeToRoom===true?'You have arrived. USD '+(fare/100).toFixed(2)+' was added to Room '+room+'.':'You have arrived at '+destination+'.'};
 return {title:'Buggy ride update',body:'Your buggy ride was updated.'};
}

export async function sendGuestPushForRide(ride:any,event:'assigned'|'on-the-way'|'arrived'|'started'|'completed'){
 const accountId=String(ride?.accountId||'');if(!accountId)return {sent:0,total:0};
 const subscriptions=await readSubscriptions(accountId);if(!subscriptions.length)return {sent:0,total:0};
 const pair=await storedVapid(),message=rideMessage(ride,event),payload=JSON.stringify({...message,tag:'buggy:'+String(ride.id||''),url:'/stay?service=buggy',rideId:String(ride.id||''),event});
 const results=await Promise.allSettled(subscriptions.map(subscription=>sendOne(subscription,payload,pair)));
 const stale=new Set<string>(),sent=results.filter((result,index)=>{if(result.status==='fulfilled'&&result.value.gone)stale.add(subscriptions[index].endpoint);return result.status==='fulfilled'&&result.value.ok;}).length;
 if(stale.size)for(const endpoint of stale)await deleteSubscription(accountId,endpoint);
 return {sent,total:subscriptions.length};
}


function shortExcursionDate(value:any){
 const date=String(value||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return date||'your excursion date';
 const parsed=new Date(date+'T00:00:00Z');
 return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'}).format(parsed);
}

export async function sendGuestPushForExcursionTimeChange(
 order:any,
 before:{date?:string;time?:string},
 after:{date?:string;time?:string},
){
 const accountId=String(order?.accountId||'');
 if(!accountId)return {sent:0,total:0};
 const subscriptions=await readSubscriptions(accountId);
 if(!subscriptions.length)return {sent:0,total:0};
 const excursion=String(order?.packageName||order?.name||'Your excursion');
 const oldDate=String(before?.date||order?.date||''),newDate=String(after?.date||order?.date||'');
 const oldTime=String(before?.time||''),newTime=String(after?.time||'');
 const dateChanged=oldDate&&newDate&&oldDate!==newDate;
 const timeChanged=oldTime&&newTime&&oldTime!==newTime;
 let body='';
 if(dateChanged&&timeChanged)body=excursion+' changed from '+shortExcursionDate(oldDate)+' '+oldTime+' to '+shortExcursionDate(newDate)+' '+newTime+'.';
 else if(dateChanged)body=excursion+' changed from '+shortExcursionDate(oldDate)+' to '+shortExcursionDate(newDate)+'.';
 else body=excursion+' departure changed from '+(oldTime||'the previous time')+' to '+(newTime||'a new time')+' on '+shortExcursionDate(newDate||oldDate)+'.';
 const pair=await storedVapid(),payload=JSON.stringify({
  title:'Excursion time changed',
  body,
  tag:'excursion-time:'+String(order?.packageGroupId||order?.id||''),
  url:'/stay?service=excursion',
  bookingId:String(order?.packageGroupId||order?.id||''),
  event:'excursion-time-changed'
 });
 const results=await Promise.allSettled(subscriptions.map(subscription=>sendOne(subscription,payload,pair)));
 const stale=new Set<string>(),sent=results.filter((result,index)=>{
  if(result.status==='fulfilled'&&result.value.gone)stale.add(subscriptions[index].endpoint);
  return result.status==='fulfilled'&&result.value.ok;
 }).length;
 if(stale.size)for(const endpoint of stale)await deleteSubscription(accountId,endpoint);
 return {sent,total:subscriptions.length};
}


export function validPushEndpoint(endpoint:string){
 try{
  const u=new URL(endpoint),h=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(
   h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||
   h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com'));
 }catch{return false;}
}


async function readAdminSubscriptions():Promise<Array<StoredSubscription&{accountId:string}>>{
 await ensureTables();
 const rows=(await authDb().prepare('SELECT account_id,payload FROM admin_push_subscriptions ORDER BY updated_at DESC LIMIT 50').all<any>()).results||[];
 return rows.map((row:any)=>{try{return {...JSON.parse(row.payload),accountId:String(row.account_id||'')}}catch{return null}}).filter((x:any)=>x?.endpoint&&x?.keys?.p256dh&&x?.keys?.auth&&x?.accountId);
}

async function writeAdminSubscription(accountId:string,subscription:StoredSubscription){
 await ensureTables();
 await authDb().prepare('INSERT INTO admin_push_subscriptions(account_id,endpoint,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,endpoint) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(accountId,subscription.endpoint,JSON.stringify(subscription),subscription.updatedAt).run();
 const extras=(await authDb().prepare('SELECT endpoint FROM admin_push_subscriptions WHERE account_id=? ORDER BY updated_at DESC LIMIT -1 OFFSET 5').bind(accountId).all<any>()).results||[];
 if(extras.length)await authDb().batch(extras.map((row:any)=>authDb().prepare('DELETE FROM admin_push_subscriptions WHERE account_id=? AND endpoint=?').bind(accountId,String(row.endpoint))));
}

async function deleteAdminSubscription(accountId:string,endpoint?:string){
 await ensureTables();
 if(endpoint)await authDb().prepare('DELETE FROM admin_push_subscriptions WHERE account_id=? AND endpoint=?').bind(accountId,endpoint).run();
 else await authDb().prepare('DELETE FROM admin_push_subscriptions WHERE account_id=?').bind(accountId).run();
}

export async function adminPushPublicKey(){return (await storedVapid()).publicKey;}

export async function saveAdminPushSubscription(accountId:string,raw:any){
 const next=cleanSubscription(raw);
 await writeAdminSubscription(accountId,next);
 return next;
}

export async function removeAdminPushSubscription(accountId:string,endpoint?:string){
 await deleteAdminSubscription(accountId,endpoint);return true;
}

export async function sendAdminPushNotification(notice:{id?:string;type?:string;title?:string;detail?:string;url?:string;ref?:string}){
 const subscriptions=await readAdminSubscriptions();
 if(!subscriptions.length)return {sent:0,total:0};
 const pair=await storedVapid();
 const payload=JSON.stringify({
  title:'Nirili Villa · '+String(notice.title||'New notification'),
  body:String(notice.detail||'You have a new update.'),
  tag:String(notice.id||notice.ref||('admin:'+Date.now())),
  url:String(notice.url||'/home'),
  type:String(notice.type||'change'),
  ref:String(notice.ref||'')
 });
 const results=await Promise.allSettled(subscriptions.map(subscription=>sendOne(subscription,payload,pair)));
 const stale:Array<{accountId:string;endpoint:string}>=[];
 const sent=results.filter((result,index)=>{
  if(result.status==='fulfilled'&&result.value.gone)stale.push({accountId:subscriptions[index].accountId,endpoint:subscriptions[index].endpoint});
  return result.status==='fulfilled'&&result.value.ok;
 }).length;
 for(const item of stale)await deleteAdminSubscription(item.accountId,item.endpoint);
 return {sent,total:subscriptions.length};
}
