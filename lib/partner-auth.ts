import {digest,hashPassword,validPassword,verifyPassword} from './auth';
import {readRecord,saveRecord} from './operation-records';

// Logins for outside businesses that work with Nirili: partner guest houses (Agent Portal) and
// travel operators (speedboat and buggy owners). Each kind keeps its accounts, usernames and
// sessions in its own operation records and cookie, so a partner login can never open the
// management system, the guest portal or another partner type's portal.
export type PartnerCredentials={id:string;username:string;passwordHash:string;salt:string;passwordVersion:number;active:boolean};
type Session={accountId:string;passwordVersion:number;expiresAt:number;createdAt:string;revoked?:boolean;agentId?:string};
export type PartnerAuthConfig={accountPrefix:string;usernamePrefix:string;sessionPrefix:string;cookie:string;sessionDays?:number};

export const USERNAME=/^[a-z0-9._-]{3,40}$/;
export const cleanUsername=(value:any)=>String(value??'').trim().toLowerCase().slice(0,40);

function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');}
function readCookie(request:Request,name:string){
 for(const part of (request.headers.get('cookie')||'').split(';')){
  const [key,...value]=part.trim().split('=');
  if(key===name)return value.join('=');
 }
 return '';
}

export function partnerAuth<T extends PartnerCredentials>(config:PartnerAuthConfig){
 const sessionMs=(config.sessionDays||30)*24*60*60*1000;
 const sessionCookie=(token:string)=>config.cookie+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+Math.floor(sessionMs/1000);
 const clearedCookie=config.cookie+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

 async function load(id:string){
  const row=await readRecord<T>(config.accountPrefix+id);
  return row?{account:row.value,revision:row.revision}:null;
 }

 // Username records are created only if absent, so two accounts can never share a login.
 async function reserveUsername(username:string,id:string,by:string){
  if(!USERNAME.test(username))throw Error('Choose a username of 3–40 letters, numbers, dots, dashes or underscores.');
  return !!await saveRecord(config.usernamePrefix+username,{accountId:id},0,by);
 }

 async function credentials(password:unknown){
  if(!validPassword(password))throw Error('Choose a password of 8–128 characters.');
  const {hash,salt}=await hashPassword(password);
  return {passwordHash:hash,salt};
 }

 async function signIn(username:string,password:string):Promise<{account:T;cookie:string}|null>{
  const login=cleanUsername(username);
  if(!USERNAME.test(login)||typeof password!=='string'||!password||password.length>128)return null;
  const index=await readRecord<{accountId?:string;agentId?:string}>(config.usernamePrefix+login);
  const id=index?.value.accountId||index?.value.agentId||'';
  const found=id?await load(id):null,account=found?.account;
  // Always run the hash so unknown usernames take as long as wrong passwords.
  const match=await verifyPassword(password,account?.salt||'00000000000000000000000000000000',account?.passwordHash||'0'.repeat(64));
  if(!account||!match||!account.active||account.username!==login)return null;
  const token=randomToken();
  const session:Session={accountId:account.id,passwordVersion:Number(account.passwordVersion)||1,expiresAt:Date.now()+sessionMs,createdAt:new Date().toISOString()};
  if(!await saveRecord(config.sessionPrefix+await digest(token),session,0,'partner:'+account.id))return null;
  return {account,cookie:sessionCookie(token)};
 }

 async function fromRequest(request:Request):Promise<T|null>{
  const token=readCookie(request,config.cookie);
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const session=await readRecord<Session>(config.sessionPrefix+await digest(token));
  if(!session||session.value.revoked||session.value.expiresAt<Date.now())return null;
  const found=await load(session.value.accountId||session.value.agentId||'');
  if(!found||!found.account.active||(Number(found.account.passwordVersion)||1)!==session.value.passwordVersion)return null;
  return found.account;
 }

 async function signOut(request:Request){
  const token=readCookie(request,config.cookie);
  if(!/^[a-f0-9]{64}$/.test(token))return;
  const key=config.sessionPrefix+await digest(token),session=await readRecord<Session>(key);
  if(session&&!session.value.revoked)await saveRecord(key,{...session.value,revoked:true},session.revision,'partner:'+(session.value.accountId||session.value.agentId));
 }

 return {load,reserveUsername,credentials,signIn,fromRequest,signOut,sessionCookie,clearedCookie};
}
