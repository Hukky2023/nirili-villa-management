import {limit,sameOrigin} from '../../../../lib/auth';
import {clearedPartnerCookie,partnerFromRequest,publicPartner,signInPartner,signOutPartner} from '../../../../lib/partners';
import {clearedCrewCookie,crewFromRequest,publicCrew,signInCrew,signOutCrew,type Crew} from '../../../../lib/operator-crew';
import type {Operator} from '../../../../lib/travel-operators';

// Sign-in for every partner on partners.nirilihotels.com, and for operators' boat crew. Partners
// see the sections their permissions allow; crew see only their assigned trips.
const headers={'Cache-Control':'private, no-store'};
const crewView=(crew:Crew,operator:Operator)=>({...publicCrew(crew),operatorName:operator.name});

export async function GET(r:Request){
 try{
  const partner=await partnerFromRequest(r);
  if(partner)return Response.json({partner:publicPartner(partner),crew:null},{headers});
  const found=await crewFromRequest(r);
  return Response.json({partner:null,crew:found?crewView(found.crew,found.operator):null},{headers});
 }catch{return Response.json({error:'Could not check your sign-in. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await r.json(),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
  if(!username||!password)return Response.json({error:'Enter your username and password.'},{status:400,headers});
  const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('partner-login-ip:'+ip,60,900000)||!await limit('partner-login:'+username,10,900000))return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers});
  const result=await signInPartner(username,password);
  if(result)return Response.json({partner:publicPartner(result.partner),crew:null},{headers:{...headers,'Set-Cookie':result.cookie}});
  const crew=await signInCrew(username,password);
  if(crew)return Response.json({partner:null,crew:crewView(crew.crew,crew.operator)},{headers:{...headers,'Set-Cookie':crew.cookie}});
  return Response.json({error:'Incorrect username or password, or this account is paused. Contact Nirili if you need help.'},{status:401,headers});
 }catch{return Response.json({error:'Sign-in is unavailable. Please retry.'},{status:503,headers});}
}

export async function DELETE(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{await signOutPartner(r);}catch{}
 try{await signOutCrew(r);}catch{}
 const out=new Headers(headers);
 out.append('Set-Cookie',clearedPartnerCookie);out.append('Set-Cookie',clearedCrewCookie);
 return Response.json({ok:true},{headers:out});
}
