import {limit,sameOrigin} from '../../../../lib/auth';
import {clearedOperatorCookie,operatorFromRequest,publicOperator,signInOperator,signOutOperator} from '../../../../lib/travel-operators';
import {clearedCrewCookie,crewFromRequest,publicCrew,signInCrew,signOutCrew,type Crew} from '../../../../lib/operator-crew';
import type {Operator} from '../../../../lib/travel-operators';

// Sign-in for speedboat operators, buggy owners and their boat crew on operators.nirilihotels.com.
// Operators and crew share one sign-in form; crew sessions only open the crew boarding view.
const headers={'Cache-Control':'private, no-store'};
const crewView=(crew:Crew,operator:Operator)=>({...publicCrew(crew),operatorName:operator.name});

export async function GET(r:Request){
 try{
  const operator=await operatorFromRequest(r);
  if(operator)return Response.json({operator:publicOperator(operator),crew:null},{headers});
  const found=await crewFromRequest(r);
  return Response.json({operator:null,crew:found?crewView(found.crew,found.operator):null},{headers});
 }catch{return Response.json({error:'Could not check your sign-in. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await r.json(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
  if(!username||!password)return Response.json({error:'Enter your username and password.'},{status:400,headers});
  const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('operator-login-ip:'+ip,60,900000)||!await limit('operator-login:'+username,10,900000))return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers});
  const result=await signInOperator(username,password);
  if(result)return Response.json({operator:publicOperator(result.operator),crew:null},{headers:{...headers,'Set-Cookie':result.cookie}});
  const crew=await signInCrew(username,password);
  if(crew)return Response.json({operator:null,crew:crewView(crew.crew,crew.operator)},{headers:{...headers,'Set-Cookie':crew.cookie}});
  return Response.json({error:'Incorrect username or password, or this account is paused. Contact your operator or Nirili if you need help.'},{status:401,headers});
 }catch{return Response.json({error:'Sign-in is unavailable. Please retry.'},{status:503,headers});}
}

export async function DELETE(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{await signOutOperator(r);}catch{}
 try{await signOutCrew(r);}catch{}
 const out=new Headers(headers);
 out.append('Set-Cookie',clearedOperatorCookie);out.append('Set-Cookie',clearedCrewCookie);
 return Response.json({ok:true},{headers:out});
}
