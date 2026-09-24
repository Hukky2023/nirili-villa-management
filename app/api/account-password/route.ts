import {authDb,currentUser,hashPassword,hasPermission,limit,roomLoginActive,sameOrigin,validPassword,verifyPassword} from '../../../lib/auth';
import {credentialStatement,mirrorCredentialRecord,readCredential} from '../../../lib/credential-store';
import {deleteLegacySessionsForAccount,mirrorLegacyAccount,updateSupabaseEmployeePassword} from '../../../lib/supabase-bridge';
import {appendAccountHistory} from '../../../lib/account-history';

function canHandleGuestAccess(user:any,target:any){
 return user?.role==='admin'||(target?.role==='guest'&&user?.role==='staff'&&(user.permissions.length===0||hasPermission(user,'guesthouse_reception')));
}

function fiveDigitCode(){
 let n:number;
 do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294890000);
 return String(10000+n%90000);
}

export async function POST(r:Request){
 const u=await currentUser();
 if(!u||!sameOrigin(r))return Response.json({error:'Staff access required.'},{status:403});
 const headers={'Cache-Control':'private, no-store'};
 try{
  const b=await r.json();
  if(typeof b.id!=='string')return Response.json({error:'Select an account.'},{status:400,headers});
  const db=authDb();
  const target=await db.prepare('SELECT id,role,password_hash,salt,active FROM accounts WHERE id=?').bind(b.id).first<any>();
  if(!target)return Response.json({error:'Account not found.'},{status:404,headers});

  if(b.action==='reveal'){
   if(target.role!=='guest')return Response.json({error:'Passwords are private. Set a new password if access needs to be recovered.'},{status:403,headers});
   if(!canHandleGuestAccess(u,target))return Response.json({error:'Admin or Reception access required.'},{status:403,headers});
   const password=await readCredential(target.id,target.password_hash);
   return Response.json({password,available:password!==null},{headers});
  }

  if(b.action==='guest-reset-code'){
   if(target.role!=='guest'||target.active!==1||!target.id.startsWith('room-'))return Response.json({error:'Only an active in-house guest account can be reset.'},{status:400,headers});
   if(!canHandleGuestAccess(u,target))return Response.json({error:'Admin or Reception access required.'},{status:403,headers});
   if(!await roomLoginActive(target.id))return Response.json({error:'This guest is no longer checked in.'},{status:409,headers});
   if(!await limit('guest-reset-code:'+u.userId+':'+target.id,10,900000))return Response.json({error:'Too many reset attempts. Try again later.'},{status:429,headers});

   const setupCode=fiveDigitCode();
   const p=await hashPassword(setupCode);
   const result=await db.batch([
    db.prepare("UPDATE accounts SET password_hash=?,salt=? WHERE id=? AND password_hash=? AND role='guest' AND active=1").bind(p.hash,p.salt,target.id,target.password_hash),
    db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(target.id),
    await credentialStatement(target.id,p.hash,setupCode,u.userId)
   ]);
   if(!result[0].meta.changes)return Response.json({error:'Guest access changed while resetting. Refresh and try again.'},{status:409,headers});

   await deleteLegacySessionsForAccount(target.id);
   {
    const row=await db.prepare('SELECT * FROM accounts WHERE id=?').bind(target.id).first<any>();
    if(row)await mirrorLegacyAccount(row);
    await mirrorCredentialRecord(target.id);
   }
   try{await appendAccountHistory(target.id,{at:new Date().toISOString(),action:'Guest password reset',by:u.username,detail:'One-time reset code issued. Previous guest password and active sessions invalidated.'});}catch{}

   return Response.json({ok:true,setupCode,requiresNewPassword:true},{headers});
  }

  if(target.role==='guest')return Response.json({error:'Guest passwords are private. Use Reset guest password to issue a one-time reset code.'},{status:400,headers});
  if(u.role!=='admin')return Response.json({error:'Only Admin can manage account passwords.'},{status:403,headers});
  if(!validPassword(b.password))return Response.json({error:'Use a password of 8–128 characters.'},{status:400,headers});

  if(b.action==='remember')return Response.json({error:'Passwords cannot be saved for later viewing. Use password reset.'},{status:400,headers});

  if(b.action!=='reset')return Response.json({error:'Invalid password action.'},{status:400,headers});
  if(target.role==='admin'){
   if(target.id!==u.userId)return Response.json({error:'Admins must change their own password.'},{status:403,headers});
   if(!await limit('admin-password-change:'+u.userId,10,900000))return Response.json({error:'Too many attempts. Try later.'},{status:429,headers});
   if(typeof b.currentPassword!=='string'||b.currentPassword.length>128||!await verifyPassword(b.currentPassword,target.salt,target.password_hash))return Response.json({error:'The current Admin password is incorrect.'},{status:400,headers});
  }

  if(['admin','staff'].includes(target.role)){
   try{await updateSupabaseEmployeePassword(target.id,b.password);}
   catch{return Response.json({error:'Could not update the Supabase employee login. Password was not changed.'},{status:503,headers});}
  }

  const p=await hashPassword(b.password);
  await db.batch([
   db.prepare("UPDATE accounts SET password_hash=?,salt=? WHERE id=? AND password_hash=?").bind(p.hash,p.salt,b.id,target.password_hash),
   db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(b.id),
   await credentialStatement(b.id,p.hash,b.password,u.userId)
  ]);
  await deleteLegacySessionsForAccount(b.id);
  {
   const row=await db.prepare('SELECT * FROM accounts WHERE id=?').bind(b.id).first<any>();
   if(row)await mirrorLegacyAccount(row);
   await mirrorCredentialRecord(b.id);
  }
  return Response.json({ok:true,signInAgain:target.id===u.userId},{headers});
 }catch{
  return Response.json({error:'Could not access the password. Please try again.'},{status:503,headers});
 }
}

