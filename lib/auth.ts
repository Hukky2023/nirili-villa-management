import {sessionCookieName,currentTab} from './tab-session';
import {env} from "cloudflare:workers";
import {cookies} from "next/headers";
import {walkInExcursionOrderPaid} from './walkin-excursion-access';
export type Permission="waiter_pos"|"restaurant_pos"|"edit_bills"|"edit_excursions"|"edit_transfers";
export type Actor={userId:string;username:string;email:string;displayName:string;role:"admin"|"staff"|"guest";permissions:Permission[]};
export function authDb(){if(!env.DB)throw new Error("Account service unavailable");return env.DB;}
export const cookieName="nirili_session";
export const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b as ArrayBuffer),x=>x.toString(16).padStart(2,"0")).join("");
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(s:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));}
export async function hashPassword(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
const hash=hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},key,256));return {salt,hash};}
export async function verifyPassword(password:string,salt:string,expected:string){const {hash}=await hashPassword(password,salt);let d=hash.length^expected.length;for(let i=0;i<hash.length;i++)d|=hash.charCodeAt(i)^(expected.charCodeAt(i)||0);return d===0;}
export function publicUser(row:any):Actor{return {userId:row.id,username:row.username,email:row.email||"",displayName:row.name,role:row.role,permissions:JSON.parse(row.permissions||"[]")};}
export async function currentUser():Promise<Actor|null>{
const token=(await cookies()).get(await sessionCookieName())?.value;if(!token)return null;
const row=await authDb().prepare("SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1").bind(await digest(token),Date.now()).first();
return row&&await roomLoginActive(row.id)?publicUser(row):null;}
export function hasPermission(user:Actor|null,permission:Permission){return !!user&&(user.role==="admin"||(user.role==="staff"&&user.permissions.includes(permission)));}
export function sameOrigin(r:Request){return r.headers.get("origin")===new URL(r.url).origin;}
export async function issueSession(id:string,tab?:string){
const token=randomToken();await authDb().prepare("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(await digest(token),id,Date.now()+12*60*60*1000).run();
return (tab?cookieName+"_"+tab:await sessionCookieName())+"="+token+"; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200";}
export async function bootstrap(){
const value=(env as unknown as Record<string,string>).NIRILI_BOOTSTRAP;
if(!value)throw new Error("Initial accounts have not been configured");
const seeds=JSON.parse(value);
await authDb().batch(seeds.map((s:any)=>authDb().prepare("INSERT OR IGNORE INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,?,?,1)").bind(s.id,s.username,s.email,s.name,s.hash,s.salt,s.role,"[]")));
}
export async function limit(key:string,max:number,ms:number){const bucket=Math.floor(Date.now()/ms);const k=await digest(key)+":"+bucket;const r=await authDb().prepare("INSERT INTO account_limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(k).first<{count:number}>();return !!r&&r.count<=max;}
export function validPassword(p:unknown):p is string{return typeof p==="string"&&p.length>=8&&p.length<=128;}
export const validEmail=(e:string)=>e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function roomLoginActive(id:string){
 if(!id.startsWith('room-')&&!id.startsWith('walkin-exc-'))return true;
 const r=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('hotel-stays-v1').first<any>();
 if(!r)return false;
 const state=JSON.parse(r.payload);
 if(id.startsWith('walkin-exc-')){
  const profile=(state.walkinExcursionAccounts||[]).find((x:any)=>x.accountId===id);
  if(!profile||profile.active!==true||(profile.expiresAt&&Date.parse(profile.expiresAt)<=Date.now()))return false;
  const orders=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&o.accountId===id&&o.status!=='Cancelled'&&o.approvalStatus!=='Cancelled'&&o.approvalStatus!=='Declined');
  if(orders.length&&orders.every((o:any)=>o.status==='Completed'&&walkInExcursionOrderPaid(o)))return false;
  return true;
 }
 return state.stays.some((s:any)=>s.accountId===id&&s.status==='In House');
}
