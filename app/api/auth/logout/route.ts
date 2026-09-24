import {sessionCookieName,currentTab,withTab} from '../../../../lib/tab-session';
import {cookies} from "next/headers";
import {authDb,cookieName,digest,sameOrigin} from "../../../../lib/auth";
import {deleteLegacySession} from "../../../../lib/supabase-bridge";
export async function POST(r:Request){if(!sameOrigin(r))return new Response("Invalid request",{status:403});const name=await sessionCookieName();const token=(await cookies()).get(name)?.value;if(token){const tokenHash=await digest(token);try{await deleteLegacySession(tokenHash);}catch{return Response.json({error:'Sign-out could not be completed. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});}try{await authDb().prepare("DELETE FROM account_sessions WHERE token_hash=?").bind(tokenHash).run();}catch{}}return new Response(null,{status:303,headers:{Location:withTab(new URL(r.url).searchParams.get("transport")==="1"?"/transport/login":new URL(r.url).searchParams.get("restaurant")==="1"?"/restaurant/login":"/",await currentTab()), "Set-Cookie":name+"=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"}});}

