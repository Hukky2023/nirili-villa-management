import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
import {appendAccountHistory} from '../../../lib/account-history';
async function change(r:Request){
 const admin=await currentUser();if(admin?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Only Admin can manage user accounts.'},{status:403});
 try{const b=await r.json();if(typeof b.id!=='string'||!b.id||b.id.length>160)return Response.json({error:'Select a user.'},{status:400});
 if(b.id===admin.userId)return Response.json({error:'You cannot delete or disable your own login.'},{status:400});
 const db=authDb();const account=await db.prepare('SELECT id,role,active FROM accounts WHERE id=?').bind(b.id).first<any>();
 if(!account)return Response.json({error:'This user no longer exists. Refresh the list.'},{status:404});
 if(account.role==='admin')return Response.json({error:'Admin accounts are protected.'},{status:403});
 if(r.method==='POST'){
 const result=await db.batch([db.prepare("UPDATE accounts SET active=0 WHERE id=? AND role<>'admin'").bind(b.id),db.prepare("DELETE FROM account_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND active=0 AND role<>'admin')").bind(b.id,b.id)]);
 if(result[0].meta.changes)await appendAccountHistory(b.id,{at:new Date().toISOString(),action:'Account disabled',by:admin.username,detail:'Login access disabled by Admin.'});
 return Response.json({ok:!!result[0].meta.changes});
 }
 if(account.role==='staff'){
  // Staff accounts can be removed directly by Admin. Historical orders, bills,
  // excursions and audit records keep their recorded names/usernames.
  await appendAccountHistory(b.id,{at:new Date().toISOString(),action:'Staff account deleted',by:admin.username,detail:'Login removed. Operational history retained.'});
  await db.batch([
   db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(b.id),
   db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+b.id),
   db.prepare("DELETE FROM accounts WHERE id=? AND role='staff'").bind(b.id)
  ]);
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }
 if(account.active)return Response.json({error:'Disable this account before deleting it.'},{status:409});
 // Keep historic bookings/bills unchanged. A current stay must retain its linked login.
 await appendAccountHistory(b.id,{at:new Date().toISOString(),action:'Guest account deleted',by:admin.username,detail:'Disabled login removed. Booking and bill history retained.'});
 const results=await db.batch([
 db.prepare("DELETE FROM accounts WHERE id=? AND active=0 AND role<>'admin' AND NOT EXISTS(SELECT 1 FROM operation_records o, json_each(o.payload,'$.stays') s WHERE o.key='hotel-stays-v1' AND json_extract(s.value,'$.accountId')=? AND json_extract(s.value,'$.status') IN ('In House','Confirmed'))").bind(b.id,b.id),
 db.prepare('DELETE FROM account_sessions WHERE account_id=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=?)').bind(b.id,b.id),
 db.prepare('DELETE FROM operation_records WHERE key=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=?)').bind('credential:'+b.id,b.id)
 ]);
 if(!results[0].meta.changes)return Response.json({error:'The user was re-enabled or is linked to a confirmed/in-house stay. Complete that stay before deleting the login.'},{status:409});
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not update the user. Refresh and try again.'},{status:503});}
}
export const POST=change;export const DELETE=change;
