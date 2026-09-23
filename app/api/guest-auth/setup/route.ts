import {authDb,hashPassword,issueGuestSession,limit,roomLoginActive,sameOrigin,validPassword,verifyPassword} from '../../../../lib/auth';
import {readCredential} from '../../../../lib/credential-store';
import {deleteLegacySessionsForAccount,mirrorLegacyAccount} from '../../../../lib/supabase-bridge';
import {deleteOperationalRecordPrimary} from '../../../../lib/supabase-bridge';

function guestHostAllowed(r:Request){
 const host=(r.headers.get('host')||new URL(r.url).host).split(':')[0].toLowerCase();
 return host==='booking.nirilihotels.com'||host==='localhost'||host==='127.0.0.1';
}

export async function POST(r:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!guestHostAllowed(r)||!sameOrigin(r))return Response.json({error:'Guest password setup is available only on the Nirili guest portal.'},{status:403,headers});
 try{
  const b=await r.json();
  const username=String(b.username||'').trim().toLowerCase();
  const setupCode=String(b.setupCode||'').trim();
  const password=typeof b.password==='string'?b.password:'';
  const confirmPassword=typeof b.confirmPassword==='string'?b.confirmPassword:'';

  if(!/^\d{3,10}$/.test(username)||!/^\d{5}$/.test(setupCode)){
   return Response.json({error:'Enter your room number and the 5-digit setup code from reception.'},{status:400,headers});
  }
  if(!validPassword(password)){
   return Response.json({error:'Create a password of 8–128 characters.'},{status:400,headers});
  }
  if(password!==confirmPassword){
   return Response.json({error:'The two passwords do not match.'},{status:400,headers});
  }

  const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('guest-password-setup:'+ip+':'+username,10,900000)){
   return Response.json({error:'Too many setup attempts. Please contact reception.'},{status:429,headers});
  }

  const db=authDb();
  const row=await db.prepare("SELECT * FROM accounts WHERE lower(username)=? AND role='guest' AND active=1").bind(username).first<any>();
  if(!row||!row.id?.startsWith('room-')||!await roomLoginActive(row.id)){
   return Response.json({error:'This room is not currently available for guest password setup.'},{status:401,headers});
  }

  const issuedCode=await readCredential(row.id,row.password_hash);
  if(!issuedCode){
   return Response.json({error:'A private password has already been created for this room. Sign in with it, or contact reception if you need help.'},{status:409,headers});
  }
  if(issuedCode!==setupCode||!await verifyPassword(setupCode,row.salt,row.password_hash)){
   return Response.json({error:'The setup code is incorrect. Check the code given by reception.'},{status:401,headers});
  }

  const next=await hashPassword(password);
  const result=await db.batch([
   db.prepare("UPDATE accounts SET password_hash=?,salt=? WHERE id=? AND password_hash=? AND role='guest' AND active=1").bind(next.hash,next.salt,row.id,row.password_hash),
   db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(row.id),
   db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+row.id)
  ]);
  if(!result[0].meta.changes){
   return Response.json({error:'Guest access changed while the password was being created. Please try again.'},{status:409,headers});
  }

  try{await deleteLegacySessionsForAccount(row.id);}catch{}
  try{await deleteOperationalRecordPrimary('credential:'+row.id);}catch{}
  try{
   const updated=await db.prepare('SELECT * FROM accounts WHERE id=?').bind(row.id).first<any>();
   if(updated)await mirrorLegacyAccount(updated);
  }catch{}

  const cookie=await issueGuestSession(row.id);
  return Response.json({ok:true,redirect:'/stay'},{headers:{...headers,'Set-Cookie':cookie}});
 }catch{
  return Response.json({error:'Could not create the guest password. Please try again or contact reception.'},{status:503,headers});
 }
}
