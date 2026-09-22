import {credentialStatement,mirrorCredentialRecord} from '../../../lib/credential-store';
import {loadStays} from '../../../lib/stays';
import {authDb,currentUser,hashPassword,validPassword,sameOrigin,validEmail} from "../../../lib/auth";
import {walkInExcursionProfile} from '../../../lib/walkin-excursion-access';
import {appendAccountHistory,readAccountHistory,accountHistoryStatement,preserveAccountHistoryStatement} from '../../../lib/account-history';
import {accountStays,historyFor} from '../../../lib/account-history-events';
import {deleteLegacySessionsForAccount,mirrorLegacyAccount,ensureSupabaseEmployee} from '../../../lib/supabase-bridge';
const permissions=["guesthouse_reception","excursions_manager","waiter_pos","restaurant_pos","kitchen_pos","edit_bills","edit_excursions","edit_transfers","buggy_driver","crew_location"];

export async function GET(){
 if((await currentUser())?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
 try{
  const users=(await authDb().prepare("SELECT id,username,email,name,role,permissions,active FROM accounts ORDER BY name").all()).results;
  const {state}=await loadStays();
  const shaped=await Promise.all(users.map(async(u:any)=>{
   const stays=u.role==='guest'?accountStays(u.id,state):[];
   const stayView=stays.map((s:any)=>({id:s.id,room:s.room,status:s.status,meal:s.meal,checkIn:s.checkIn,checkOut:s.checkOut,checkedInAt:s.checkedInAt||'',checkedOutAt:s.checkedOutAt||'',history:s.history||[]}));
   const walkIn=u.role==='guest'?walkInExcursionProfile(state,u.id):undefined;
   const currentInHouse=stayView.find((s:any)=>s.status==='In House')||stayView.find((s:any)=>s.status==='Confirmed');
   const audit=await readAccountHistory(u.id);
   return {
    ...u,
    stays:stayView.map(({history,...s}:any)=>s),
    guestType:u.role==='guest'?(walkIn?'walkin':currentInHouse?'inhouse':stayView.length?'inhouse':'guest'):'',
    walkIn:walkIn?{hotel:walkIn.hotel,room:walkIn.room,phone:walkIn.phone,departureDate:walkIn.departureDate,expiresAt:walkIn.expiresAt,guests:walkIn.guests||[],createdAt:walkIn.createdAt,endedAt:walkIn.endedAt||'',active:walkIn.active}:null,
    history:historyFor(u,state,stays,walkIn,audit)
   };
  }));
  return Response.json({staff:shaped.filter((u:any)=>u.role==='staff'),users:shaped},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({error:"Could not load accounts or their saved history. Please retry."},{status:503});}
}
async function change(r:Request){
const admin=await currentUser();if(admin?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
if(!sameOrigin(r))return Response.json({error:"Invalid request"},{status:403});
try{const b=await r.json();
if(r.method==="DELETE"){
 const id=String(b.id||''),db=authDb();
 const history=await preserveAccountHistoryStatement(id,{at:new Date().toISOString(),action:'Account disabled',by:admin.username,detail:'Staff login disabled. History retained for Admin only.'},{guard:"EXISTS(SELECT 1 FROM accounts WHERE id=? AND role='staff' AND active=0)",args:[id]});
 const results=await db.batch([db.prepare("UPDATE accounts SET active=0 WHERE id=? AND role='staff'").bind(id),db.prepare("DELETE FROM account_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND role='staff' AND active=0)").bind(id,id),history]);
 if(results[0].meta.changes){const row=await db.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first<any>();if(row)try{await mirrorLegacyAccount(row);}catch{}try{await deleteLegacySessionsForAccount(id);}catch{}}
 return Response.json({ok:!!results[0].meta.changes});
}
if(!Array.isArray(b.permissions)||b.permissions.some((p:any)=>!permissions.includes(p)))return Response.json({error:"Choose valid permissions."},{status:400});
if(b.id){
 const db=authDb(),before=await db.prepare("SELECT active,permissions FROM accounts WHERE id=? AND role='staff'").bind(b.id).first<any>();
 if(!before)return Response.json({error:"Staff not found"},{status:404});
 const active=b.active===false?0:1,newPermissions=JSON.stringify(b.permissions);
 const guard="EXISTS(SELECT 1 FROM accounts WHERE id=? AND role='staff' AND active=? AND permissions=?)",args=[b.id,active,newPermissions];
 const writes:any[]=[db.prepare("UPDATE accounts SET permissions=?,active=? WHERE id=? AND role='staff'").bind(newPermissions,active,b.id)];
 if(!active)writes.push(db.prepare("DELETE FROM account_sessions WHERE account_id=? AND "+guard).bind(b.id,...args));
 if(Number(before.active)!==active)writes.push(await preserveAccountHistoryStatement(b.id,{at:new Date().toISOString(),action:active?'Account enabled':'Account disabled',by:admin.username,detail:active?'Staff login restored.':'Staff login disabled. History retained for Admin only.'},{guard,args}));
 if(String(before.permissions||'[]')!==newPermissions)writes.push(accountHistoryStatement(b.id,[{at:new Date().toISOString(),action:'Permissions updated',by:admin.username,detail:(b.permissions||[]).join(', ')||'No permissions assigned.'}],admin.username,{guard,args}));
 const results=await db.batch(writes),result=results[0];
 if(result.meta.changes){const row=await db.prepare("SELECT * FROM accounts WHERE id=?").bind(b.id).first<any>();if(row)try{await mirrorLegacyAccount(row);}catch{}if(!active)try{await deleteLegacySessionsForAccount(b.id);}catch{}}
 return Response.json(result.meta.changes?{ok:true}:{error:"Staff not found"},{status:result.meta.changes?200:404});
}
const username=typeof b.username==="string"?b.username.trim().toLowerCase():"",email=typeof b.email==="string"?b.email.trim().toLowerCase():"",name=typeof b.name==="string"?b.name.trim():"",password=typeof b.password==="string"?b.password:"";
if(!name)return Response.json({error:"Enter the staff member name."},{status:400});
if(name.length>100)return Response.json({error:"Staff name must be 100 characters or fewer."},{status:400});
if(!username)return Response.json({error:"Enter a username."},{status:400});
if(!/^[a-z0-9._-]{3,40}$/.test(username))return Response.json({error:"Username must be 3–40 characters using only lowercase letters, numbers, dots, underscores or hyphens."},{status:400});
if(password.length<8)return Response.json({error:"Password must contain at least 8 characters."},{status:400});
if(password.length>128)return Response.json({error:"Password must be 128 characters or fewer."},{status:400});
if(email&&!validEmail(email))return Response.json({error:"Enter a valid email address, or leave Email blank."},{status:400});
const db=authDb();
const usernameUsed=await db.prepare("SELECT id FROM accounts WHERE username=?").bind(username).first<any>();
if(usernameUsed)return Response.json({error:"That username is already in use. Choose a different username."},{status:409});
if(email){const emailUsed=await db.prepare("SELECT id FROM accounts WHERE email=?").bind(email).first<any>();if(emailUsed)return Response.json({error:"That email address is already linked to another account."},{status:409});}
const p=await hashPassword(password),id=crypto.randomUUID();const results=await db.batch([db.prepare("INSERT INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,'staff',?,1)").bind(id,username,email||null,name,p.hash,p.salt,JSON.stringify(b.permissions)),await credentialStatement(id,p.hash,password,admin.userId)]);const result=results[0];
if(result.meta.changes){
 await appendAccountHistory(id,{at:new Date().toISOString(),action:'Staff account created',by:admin.username,detail:(b.permissions||[]).join(', ')||'No permissions assigned.'});
 const row=await db.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first<any>();
 if(row)try{
  await Promise.race([ensureSupabaseEmployee(row,password),new Promise(resolve=>setTimeout(resolve,1500))]);
 }catch{try{await mirrorLegacyAccount(row);}catch{}}
 try{await mirrorCredentialRecord(id);}catch{}
}
return Response.json(result.meta.changes?{ok:true}:{error:"Could not create the staff account."},{status:result.meta.changes?200:503});
}catch{return Response.json({error:"Could not update staff. Retry."},{status:503});}}
export const POST=change;export const DELETE=change;
