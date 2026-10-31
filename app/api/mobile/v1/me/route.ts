import {env} from 'cloudflare:workers';
import {authDb,digest,publicUser,roomLoginActive} from '../../../../../lib/auth';
import {supabaseBridgeConfigured} from '../../../../../lib/supabase-bridge';

export async function GET(request:Request){
  if((env as unknown as Record<string,string>).NIRILI_MOBILE_AUTH_ENABLED!=='true'||supabaseBridgeConfigured())return Response.json({error:'Not available'},{status:503});
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return Response.json({error:'Unauthorized'},{status:401});
  try {
    const hash=await digest(authorization.slice(7));
    const row=await authDb().prepare("SELECT a.* FROM accounts a JOIN mobile_access_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1").bind(hash,Date.now()).first<any>();
    if(!row||row.role==='guest'||!await roomLoginActive(row.id))return Response.json({error:'Unauthorized'},{status:401});
    return Response.json({user:publicUser(row)},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Unavailable'},{status:503});}
}
