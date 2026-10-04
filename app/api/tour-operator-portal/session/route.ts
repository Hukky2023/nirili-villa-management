import {limit,sameOrigin} from '../../../../lib/auth';
import {clearedTourOperatorCookie,publicTourOperator,tourOperatorFromRequest,tourOperatorSignIn,tourOperatorSignOut} from '../../../../lib/tour-operators';
const headers={'Cache-Control':'private, no-store'};
export async function GET(r:Request){try{const o=await tourOperatorFromRequest(r);return Response.json({operator:o?publicTourOperator(o):null},{headers});}catch{return Response.json({error:'Could not check sign-in.'},{status:503,headers});}}
export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{const b=await r.json(),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('tour-operator-login-ip:'+ip,60,900000)||!await limit('tour-operator-login:'+username,10,900000))return Response.json({error:'Too many attempts. Try again later.'},{status:429,headers});
  const result=await tourOperatorSignIn(username,password);if(!result)return Response.json({error:'Incorrect username or password, or this account is paused.'},{status:401,headers});
  return Response.json({operator:publicTourOperator(result.operator)},{headers:{...headers,'Set-Cookie':result.cookie}});
 }catch{return Response.json({error:'Sign-in is unavailable.'},{status:503,headers});}
}
export async function DELETE(r:Request){if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});try{await tourOperatorSignOut(r);}catch{}return Response.json({ok:true},{headers:{...headers,'Set-Cookie':clearedTourOperatorCookie}});}
