import {authDb,digest,publicUser,roomLoginActive} from './auth';
import {supabaseBridgeConfigured} from './supabase-bridge';
import {env} from 'cloudflare:workers';
export function mobileEnabled(){return (env as unknown as Record<string,string>).NIRILI_MOBILE_AUTH_ENABLED==='true'&&!supabaseBridgeConfigured();}
export async function mobileActor(request:Request){
 const header=request.headers.get('authorization')||'';
 if(!mobileEnabled()||!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const row=await authDb().prepare("SELECT a.* FROM accounts a JOIN mobile_access_sessions s ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1").bind(await digest(header.slice(7)),Date.now()).first<any>();
 if(!row||row.role==='guest'||!await roomLoginActive(row.id))return null;
 return publicUser(row);
}
