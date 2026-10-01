import {limit,sameOrigin} from '../../../../lib/auth';
import {agentFromRequest,clearedSessionCookie,publicAgent,signIn,signOut} from '../../../../lib/excursion-agents';

// Sign-in for partner guest houses on agents.nirilihotels.com.
const headers={'Cache-Control':'private, no-store'};

export async function GET(r:Request){
 try{
  const agent=await agentFromRequest(r);
  return Response.json({agent:agent?publicAgent(agent):null},{headers});
 }catch{return Response.json({error:'Could not check your sign-in. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await r.json(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
  if(!username||!password)return Response.json({error:'Enter your username and password.'},{status:400,headers});
  const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('agent-login-ip:'+ip,60,900000)||!await limit('agent-login:'+username,10,900000))return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers});
  const result=await signIn(username,password);
  if(!result)return Response.json({error:'Incorrect username or password, or this partner account is paused. Contact Nirili Tours if you need help.'},{status:401,headers});
  return Response.json({agent:publicAgent(result.agent)},{headers:{...headers,'Set-Cookie':result.cookie}});
 }catch{return Response.json({error:'Sign-in is unavailable. Please retry.'},{status:503,headers});}
}

export async function DELETE(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{await signOut(r);}catch{}
 return Response.json({ok:true},{headers:{...headers,'Set-Cookie':clearedSessionCookie}});
}
