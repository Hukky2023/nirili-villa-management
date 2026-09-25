import {env} from 'cloudflare:workers';
import {authDb} from './auth';

type NativeToken={accountId:string;token:string;platform:string;updatedAt:string};
type FcmConfig={projectId:string;clientEmail:string;privateKey:string};

let cachedAccessToken:{token:string;expiresAt:number}|null=null;
const enc=new TextEncoder();

function config():FcmConfig|null{
 const values=env as unknown as Record<string,string|undefined>;
 const read=(key:string)=>String(values[key]||'').trim();
 const projectId=read('FCM_PROJECT_ID');
 const clientEmail=read('FCM_CLIENT_EMAIL');
 const privateKey=read('FCM_PRIVATE_KEY').replace(/\\n/g,'\n');
 if(!projectId||!clientEmail||!privateKey)return null;
 return {projectId,clientEmail,privateKey};
}

async function ensureTable(){
 await authDb().prepare('CREATE TABLE IF NOT EXISTS admin_native_push_tokens (account_id TEXT NOT NULL, token TEXT NOT NULL, platform TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,token))').run();
}

function validToken(value:string){
 return value.length>=20&&value.length<=4096&&/^[A-Za-z0-9:_\-.]+$/.test(value);
}

export function adminNativePushConfigured(){return !!config();}

export async function saveAdminNativePushToken(accountId:string,rawToken:unknown,platform='android'){
 const token=String(rawToken||'').trim();
 const safePlatform=String(platform||'android').toLowerCase()==='android'?'android':'android';
 if(!validToken(token))throw Error('Invalid native notification token.');
 await ensureTable();
 const now=new Date().toISOString();
 await authDb().prepare('INSERT INTO admin_native_push_tokens(account_id,token,platform,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,token) DO UPDATE SET platform=excluded.platform,updated_at=excluded.updated_at')
  .bind(accountId,token,safePlatform,now).run();
 const extras=(await authDb().prepare('SELECT token FROM admin_native_push_tokens WHERE account_id=? ORDER BY updated_at DESC LIMIT -1 OFFSET 5').bind(accountId).all<any>()).results||[];
 if(extras.length)await authDb().batch(extras.map((row:any)=>authDb().prepare('DELETE FROM admin_native_push_tokens WHERE account_id=? AND token=?').bind(accountId,String(row.token))));
 return {token,platform:safePlatform,updatedAt:now};
}

export async function removeAdminNativePushToken(accountId:string,rawToken?:unknown){
 await ensureTable();
 const token=String(rawToken||'').trim();
 if(token)await authDb().prepare('DELETE FROM admin_native_push_tokens WHERE account_id=? AND token=?').bind(accountId,token).run();
 else await authDb().prepare('DELETE FROM admin_native_push_tokens WHERE account_id=?').bind(accountId).run();
 return true;
}

async function readTokens():Promise<NativeToken[]>{
 await ensureTable();
 const rows=(await authDb().prepare('SELECT account_id,token,platform,updated_at FROM admin_native_push_tokens ORDER BY updated_at DESC LIMIT 100').all<any>()).results||[];
 return rows.map((row:any)=>({accountId:String(row.account_id||''),token:String(row.token||''),platform:String(row.platform||'android'),updatedAt:String(row.updated_at||'')}))
  .filter((row:NativeToken)=>row.accountId&&validToken(row.token));
}

function b64url(input:Uint8Array){
 let raw='';for(let i=0;i<input.length;i+=0x8000)raw+=String.fromCharCode(...input.subarray(i,i+0x8000));
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function pemBytes(pem:string){
 const raw=pem.replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s+/g,'');
 const decoded=atob(raw),bytes=new Uint8Array(decoded.length);
 for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
 return bytes;
}

async function accessToken(cfg:FcmConfig){
 if(cachedAccessToken&&cachedAccessToken.expiresAt>Date.now()+60_000)return cachedAccessToken.token;
 const now=Math.floor(Date.now()/1000);
 const header=b64url(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const payload=b64url(enc.encode(JSON.stringify({
  iss:cfg.clientEmail,
  scope:'https://www.googleapis.com/auth/firebase.messaging',
  aud:'https://oauth2.googleapis.com/token',
  iat:now,
  exp:now+3600
 })));
 const unsigned=header+'.'+payload;
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(cfg.privateKey),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(unsigned)));
 const assertion=unsigned+'.'+b64url(signature);
 const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
 const response=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:body.toString(),
  redirect:'error'
 });
 const data:any=await response.json().catch(()=>({}));
 if(!response.ok||!data?.access_token)throw Error('FCM authorization failed.');
 cachedAccessToken={token:String(data.access_token),expiresAt:Date.now()+Math.max(300,Number(data.expires_in)||3600)*1000};
 return cachedAccessToken.token;
}

function cleanPath(value:unknown){
 const raw=String(value||'/home').trim();
 if(!raw.startsWith('/')||raw.startsWith('//'))return '/home';
 return raw.slice(0,1000);
}

async function sendOne(cfg:FcmConfig,oauthToken:string,token:string,notice:any){
 const payload={
  message:{
   token,
   data:{
    title:'Nirili Villa · '+String(notice?.title||'New notification').slice(0,120),
    body:String(notice?.detail||'You have a new update.').slice(0,1000),
    tag:String(notice?.id||notice?.ref||('admin:'+Date.now())).slice(0,200),
    url:cleanPath(notice?.url),
    type:String(notice?.type||'change').slice(0,80),
    ref:String(notice?.ref||'').slice(0,250)
   },
   android:{priority:'high',ttl:'300s'}
  }
 };
 const response=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(cfg.projectId)+'/messages:send',{
  method:'POST',
  redirect:'error',
  headers:{Authorization:'Bearer '+oauthToken,'Content-Type':'application/json'},
  body:JSON.stringify(payload)
 });
 const data:any=await response.json().catch(()=>({}));
 const code=String(data?.error?.details?.[0]?.errorCode||data?.error?.status||'');
 return {ok:response.ok,gone:response.status===404||code==='UNREGISTERED',status:response.status};
}

export async function sendAdminNativePushNotification(notice:{id?:string;type?:string;title?:string;detail?:string;url?:string;ref?:string}){
 const cfg=config();
 if(!cfg)return {sent:0,total:0,configured:false};
 const tokens=await readTokens();
 if(!tokens.length)return {sent:0,total:0,configured:true};
 const oauthToken=await accessToken(cfg);
 const results=await Promise.allSettled(tokens.map(item=>sendOne(cfg,oauthToken,item.token,notice)));
 const stale:NativeToken[]=[];
 let sent=0;
 results.forEach((result,index)=>{
  if(result.status==='fulfilled'){
   if(result.value.ok)sent++;
   if(result.value.gone)stale.push(tokens[index]);
  }
 });
 for(const item of stale)await authDb().prepare('DELETE FROM admin_native_push_tokens WHERE account_id=? AND token=?').bind(item.accountId,item.token).run();
 return {sent,total:tokens.length,configured:true};
}
