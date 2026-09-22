import {cookies} from 'next/headers';
import {authDb,digest,guestCookieName,sameOrigin} from '../../../../lib/auth';
import {deleteLegacySession} from '../../../../lib/supabase-bridge';
export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403});
 const token=(await cookies()).get(guestCookieName)?.value;
 if(token){const tokenHash=await digest(token);try{await authDb().prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(tokenHash).run();}catch{}try{await deleteLegacySession(tokenHash);}catch{}}
 const url=new URL('/stay',r.url);
 return new Response(null,{status:303,headers:{Location:url.toString(),'Set-Cookie':guestCookieName+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0','Cache-Control':'private, no-store'}});
}
