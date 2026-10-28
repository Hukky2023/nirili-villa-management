import {env} from 'cloudflare:workers';
import {authDb, bootstrap, digest, limit, publicUser, randomToken, roomLoginActive, verifyPassword} from '../../../../../lib/auth';
import {supabaseBridgeConfigured} from '../../../../../lib/supabase-bridge';

const disabled=()=>Response.json({error:'Mobile authentication is not enabled.'},{status:503,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
  if((env as unknown as Record<string,string>).NIRILI_MOBILE_AUTH_ENABLED!=='true'||supabaseBridgeConfigured())return disabled();
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return Response.json({error:'Expected JSON'},{status:415});
  try{
    const b=await request.json();
    const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
    const password=typeof b.password==='string'?b.password:'';
    if(!username||username.length>254||!password||password.length>128)return Response.json({error:'Invalid credentials'},{status:400});
    const ip=request.headers.get('cf-connecting-ip')||'unknown';
    if(!await limit('mobile-ip:'+ip,30,900000)||!await limit('mobile-user:'+username,10,900000))return Response.json({error:'Too many attempts'},{status:429});
    await bootstrap();
    const row=await authDb().prepare("SELECT * FROM accounts WHERE (username=? OR email=?) AND active=1").bind(username,username).first<any>();
    const verified=await verifyPassword(password,row?.salt||'00000000000000000000000000000000',row?.password_hash||'0'.repeat(64));
    if(!row||!verified||row.role==='guest'||!await roomLoginActive(row.id))return Response.json({error:'Invalid credentials'},{status:401,headers:{'Cache-Control':'no-store'}});
    const token=randomToken(),hash=await digest(token),expiresAt=Date.now()+15*60*1000;
    await authDb().prepare("INSERT INTO mobile_access_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(hash,row.id,expiresAt).run();
    return Response.json({access_token:token,token_type:'Bearer',expires_in:900,user:publicUser(row)},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Mobile login unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
