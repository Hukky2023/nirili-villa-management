import {credentialStatement} from '../../../../lib/credential-store';
import {bootstrap,authDb,sameOrigin,limit,validPassword,validEmail,hashPassword,issueSession} from "../../../../lib/auth";
import {mirrorLegacyAccount} from "../../../../lib/supabase-bridge";
export async function POST(request:Request){
if(!sameOrigin(request))return Response.json({error:"Invalid request"},{status:403});
try{
const b=await request.json();const phone=b.method==="phone";const email=typeof b.email==="string"?b.email.trim().toLowerCase():"";const identifier=phone?(typeof b.phone==="string"?b.phone.replace(/[ ()-]/g,""):""):email;
if((phone?!/^\+[1-9][0-9]{7,14}$/.test(identifier):!validEmail(email))||!validPassword(b.password)||typeof b.name!=="string"||!b.name.trim()||b.name.length>100)return Response.json({error:"Enter your name, a valid email or international phone number and a password of 8–128 characters."},{status:400});
if(!await limit("register:"+(request.headers.get("cf-connecting-ip")||"unknown"),10,3600000))return Response.json({error:"Too many registrations. Please try again later."},{status:429});
await bootstrap();
const id=crypto.randomUUID(),p=await hashPassword(b.password);
const results=await authDb().batch([authDb().prepare("INSERT OR IGNORE INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,'guest','[]',1)").bind(id,identifier,phone?null:email,b.name.trim(),p.hash,p.salt),await credentialStatement(id,p.hash,b.password,id)]);const r=results[0];
if(!r.meta.changes)return Response.json({error:"Account could not be created. If you already registered, please sign in."},{status:409});
try{const row=await authDb().prepare("SELECT * FROM accounts WHERE id=?").bind(id).first<any>();if(row)await mirrorLegacyAccount(row);}catch{}
return Response.json({redirect:"/?portal=guest"},{headers:{"Set-Cookie":await issueSession(id),"Cache-Control":"no-store"}});
}catch{return Response.json({error:"Registration unavailable. Please retry."},{status:503});}}
