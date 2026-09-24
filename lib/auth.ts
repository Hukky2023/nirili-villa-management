import {sessionCookieName,currentTab} from './tab-session';
import {env} from "cloudflare:workers";
import {cookies} from "next/headers";
import {deactivateSupabaseAccount,hitSupabaseRateLimit,readLegacySessionAccount,readOperationalRecordPrimary,upsertLegacySession,supabaseBridgeConfigured} from './supabase-bridge';

export type Permission="guesthouse_reception"|"excursions_manager"|"waiter_pos"|"restaurant_pos"|"kitchen_pos"|"edit_bills"|"edit_excursions"|"edit_transfers"|"buggy_driver"|"crew_location";
export type Actor={userId:string;username:string;email:string;displayName:string;role:"admin"|"staff"|"guest";permissions:Permission[]};
export function authDb(){if(!env.DB)throw new Error("Account service unavailable");return env.DB;}
export const cookieName="nirili_session";
export const guestCookieName="nirili_guest_session";
const bookingResetMarker20260919='system-reset:2026-09-19-terminate-non-admin-sessions-clear-bookings-v1';
const guestLoginPurgeMarker20260922='system-reset:2026-09-22-delete-all-guest-logins-v1';

async function purgeAllGuestLoginsOnce(){
 const db=authDb();
 const marker=await db.prepare('SELECT key FROM operation_records WHERE key=?').bind(guestLoginPurgeMarker20260922).first<any>();
 if(marker)return;
 const hotelRow=await db.prepare("SELECT payload FROM operation_records WHERE key='hotel-stays-v1'").first<any>();
 const statements:any[]=[];
 if(hotelRow){
  const state=JSON.parse(hotelRow.payload||'{}');
  for(const stay of state.stays||[]){
   delete stay.accountId;delete stay.roomLogin;delete stay.loginIssuedAt;delete stay.loginTerminatedAt;delete stay.loginTerminatedAccountId;
  }
  state.walkinExcursionAccounts=[];
  for(const order of state.orders||[])delete order.accountId;
  for(const order of state.posOrders||[])if(typeof order.guestKey==='string'&&order.guestKey.startsWith('guest:'))delete order.guestKey;
  statements.push(db.prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key='hotel-stays-v1'")
   .bind(JSON.stringify(state),'system:'+guestLoginPurgeMarker20260922));
 }
 statements.push(
  db.prepare("DELETE FROM operation_records WHERE key IN (SELECT 'credential:'||id FROM accounts WHERE role='guest')"),
  db.prepare("DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM accounts WHERE role='guest')"),
  db.prepare("DELETE FROM accounts WHERE role='guest'"),
  db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)')
   .bind(guestLoginPurgeMarker20260922,JSON.stringify({at:new Date().toISOString(),action:'Deleted all guest logins and revoked guest sessions.'}),'system:'+guestLoginPurgeMarker20260922)
 );
 await db.batch(statements);
}


async function applyBookingAndSessionResetOnce(){
 const db=authDb();
 const marker=await db.prepare('SELECT key FROM operation_records WHERE key=?').bind(bookingResetMarker20260919).first<any>();
 if(marker)return;

 const [hotelRow,transportRow]=await Promise.all([
  db.prepare("SELECT payload FROM operation_records WHERE key='hotel-stays-v1'").first<any>(),
  db.prepare("SELECT payload FROM operation_records WHERE key='transport-bookings-v1'").first<any>()
 ]);
 const statements:any[]=[
  db.prepare("DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM accounts WHERE role<>'admin')")
 ];

 if(hotelRow){
  const state=JSON.parse(hotelRow.payload||'{}');
  state.stays=[];
  state.requests=[];
  state.orders=[];
  if(Array.isArray(state.rooms))for(const room of state.rooms)if(room.status==='Occupied')room.status='Available';
  state.dataResets=[...new Set([...(Array.isArray(state.dataResets)?state.dataResets:[]),bookingResetMarker20260919])];
  statements.push(db.prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key='hotel-stays-v1'")
   .bind(JSON.stringify(state),'system:'+bookingResetMarker20260919));
 }

 if(transportRow){
  const transport=JSON.parse(transportRow.payload||'{}');
  transport.bookings=[];
  statements.push(db.prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key='transport-bookings-v1'")
   .bind(JSON.stringify(transport),'system:'+bookingResetMarker20260919));
 }

 statements.push(db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)')
  .bind(bookingResetMarker20260919,JSON.stringify({at:new Date().toISOString(),terminated:'all non-admin sessions',cleared:['room bookings','guest/service bookings','excursion bookings','transfer bookings']}),'system-reset'));
 await db.batch(statements);
}
export const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b as ArrayBuffer),x=>x.toString(16).padStart(2,"0")).join("");
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(s:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));}
export async function hashPassword(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
const hash=hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},key,256));return {salt,hash};}
export async function verifyPassword(password:string,salt:string,expected:string){const {hash}=await hashPassword(password,salt);let d=hash.length^expected.length;for(let i=0;i<hash.length;i++)d|=hash.charCodeAt(i)^(expected.charCodeAt(i)||0);return d===0;}
export function publicUser(row:any):Actor{let permissions:Permission[]=[];try{permissions=Array.isArray(row.permissions)?row.permissions:JSON.parse(row.permissions||"[]");}catch{}return {userId:row.id,username:row.username,email:row.email||"",displayName:row.name,role:row.role,permissions};}
export async function currentUser():Promise<Actor|null>{
try{await applyBookingAndSessionResetOnce();}catch{}
const token=(await cookies()).get(await sessionCookieName())?.value;if(!token)return null;
const tokenHash=await digest(token),now=Date.now();let row:any=null;
if(supabaseBridgeConfigured()){
 try{row=await readLegacySessionAccount(tokenHash,now);}catch{return null;}
}else row=await authDb().prepare("SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1").bind(tokenHash,now).first();
if(!row||row.role==='guest')return null;
return await roomLoginActive(row.id)?publicUser(row):null;}

export async function currentGuestUser():Promise<Actor|null>{
 const token=(await cookies()).get(guestCookieName)?.value;if(!token)return null;
 const tokenHash=await digest(token),now=Date.now();let row:any=null;
 if(supabaseBridgeConfigured()){
  try{row=await readLegacySessionAccount(tokenHash,now);}catch{return null;}
 }else row=await authDb().prepare("SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1").bind(tokenHash,now).first();
 if(!row||row.role!=='guest')return null;
 return await roomLoginActive(row.id)?publicUser(row):null;
}
export function hasPermission(user:Actor|null,permission:Permission){return !!user&&(user.role==="admin"||(user.role==="staff"&&user.permissions.includes(permission)));}
export function sameOrigin(r:Request){return r.headers.get("origin")===new URL(r.url).origin;}
export async function issueSession(id:string,tab?:string){
const token=randomToken(),tokenHash=await digest(token),expiresAt=Date.now()+12*60*60*1000;let primary=false;
if(supabaseBridgeConfigured()){
 primary=await upsertLegacySession(tokenHash,id,expiresAt);
 if(!primary)throw Error('Account service unavailable');
}
try{await authDb().prepare("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(tokenHash,id,expiresAt).run();}catch(error){if(!primary)throw error;}
return (tab?cookieName+"_"+tab:await sessionCookieName())+"="+token+"; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200";}

export async function issueGuestSession(id:string){
 const token=randomToken(),tokenHash=await digest(token),expiresAt=Date.now()+12*60*60*1000;let primary=false;
 if(supabaseBridgeConfigured()){
  primary=await upsertLegacySession(tokenHash,id,expiresAt);
  if(!primary)throw Error('Account service unavailable');
 }
 try{await authDb().prepare("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(tokenHash,id,expiresAt).run();}catch(error){if(!primary)throw error;}
 return guestCookieName+"="+token+"; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200";
}
export async function bootstrap(){
const value=(env as unknown as Record<string,string>).NIRILI_BOOTSTRAP;
if(!value)throw new Error("Initial accounts have not been configured");
const seeds=JSON.parse(value);
await authDb().batch(seeds.map((s:any)=>authDb().prepare("INSERT OR IGNORE INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,?,?,1)").bind(s.id,s.username,s.email,s.name,s.hash,s.salt,s.role,"[]")));
await applyBookingAndSessionResetOnce();
}
export async function limit(key:string,max:number,ms:number){const bucket=Math.floor(Date.now()/ms);const k=await digest(key)+":"+bucket;try{return await hitSupabaseRateLimit(k,max);}catch{}const r=await authDb().prepare("INSERT INTO account_limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(k).first<{count:number}>();return !!r&&r.count<=max;}
export function validPassword(p:unknown):p is string{return typeof p==="string"&&p.length>=8&&p.length<=128;}
export const validEmail=(e:string)=>e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function roomLoginActive(id:string){
 if(!id.startsWith('room-')&&!id.startsWith('walkin-exc-'))return true;
 let state:any=null;try{state=(await readOperationalRecordPrimary('hotel-stays-v1'))?.payload||null;}catch{}
 if(!state){const r=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('hotel-stays-v1').first<any>();if(!r)return false;state=JSON.parse(r.payload);}

 if(id.startsWith('walkin-exc-')){
  const profile=(state.walkinExcursionAccounts||[]).find((x:any)=>x.accountId===id);
  const expired=!profile||profile.active!==true||(profile.expiresAt&&Date.parse(profile.expiresAt)<=Date.now());
  if(expired){
   try{
    const db=authDb();
    await db.batch([
     db.prepare("UPDATE accounts SET active=0 WHERE id=? AND role='guest'").bind(id),
     db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(id),
     db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+id)
    ]);
    try{await deactivateSupabaseAccount(id);}catch{}
   }catch{}
   return false;
  }
  return true;
 }
 return state.stays.some((s:any)=>s.accountId===id&&s.status==='In House');
}
