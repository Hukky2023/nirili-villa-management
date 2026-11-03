import {env} from 'cloudflare:workers';
import {authDb,digest} from '../../../../../../lib/auth';
import {supabaseBridgeConfigured} from '../../../../../../lib/supabase-bridge';
export async function POST(request:Request){
  if((env as unknown as Record<string,string>).NIRILI_MOBILE_AUTH_ENABLED!=='true'||supabaseBridgeConfigured())return Response.json({error:'Not available'},{status:503});
  const authorization=request.headers.get('authorization')||'';
  let refresh:string|null=null;
  try {const data=await request.json();if(typeof data.refresh_token==='string'&&/^[a-f0-9]{64}$/.test(data.refresh_token))refresh=data.refresh_token;}catch{}
  if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return Response.json({error:'Unauthorized'},{status:401});
  try{
    await authDb().prepare('DELETE FROM mobile_access_sessions WHERE token_hash=?').bind(await digest(authorization.slice(7))).run();
    if(refresh)await authDb().prepare('DELETE FROM mobile_refresh_sessions WHERE token_hash=?').bind(await digest(refresh)).run();
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Unavailable'},{status:503});}
}
