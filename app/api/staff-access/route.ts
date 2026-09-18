import {credentialStatement} from '../../../lib/credential-store';
import {loadStays} from '../../../lib/stays';
import {authDb,currentUser,hashPassword,validPassword,sameOrigin,validEmail} from "../../../lib/auth";
const permissions=["waiter_pos","restaurant_pos","edit_bills","edit_excursions","edit_transfers","buggy_driver"];
export async function GET(){if((await currentUser())?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});try{const users=(await authDb().prepare("SELECT id,username,email,name,role,permissions,active FROM accounts ORDER BY name").all()).results;const {state}=await loadStays();return Response.json({staff:users.filter((u:any)=>u.role==='staff'),users:users.map((u:any)=>({...u,stays:u.role==='guest'?state.stays.filter((s:any)=>s.accountId===u.id).map((s:any)=>({id:s.id,room:s.room,status:s.status,meal:s.meal})):[]}))},{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Could not load accounts."},{status:503});}}
async function change(r:Request){
const admin=await currentUser();if(admin?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
if(!sameOrigin(r))return Response.json({error:"Invalid request"},{status:403});
try{const b=await r.json();
if(r.method==="DELETE"){await authDb().prepare("UPDATE accounts SET active=0 WHERE id=? AND role='staff'").bind(b.id||"").run();return Response.json({ok:true});}
if(!Array.isArray(b.permissions)||b.permissions.some((p:any)=>!permissions.includes(p)))return Response.json({error:"Choose valid permissions."},{status:400});
if(b.id){const result=await authDb().prepare("UPDATE accounts SET permissions=?,active=? WHERE id=? AND role='staff'").bind(JSON.stringify(b.permissions),b.active===false?0:1,b.id).run();return Response.json(result.meta.changes?{ok:true}:{error:"Staff not found"},{status:result.meta.changes?200:404});}
const username=typeof b.username==="string"?b.username.trim().toLowerCase():"";const email=typeof b.email==="string"?b.email.trim().toLowerCase():"";
if(!/^[a-z0-9._-]{3,40}$/.test(username)||!validPassword(b.password)||typeof b.name!=="string"||!b.name.trim()||b.name.length>100||(email&&!validEmail(email)))return Response.json({error:"Enter a name, username (3–40 letters/numbers) and password (8–128 characters). Email is optional."},{status:400});
const p=await hashPassword(b.password),id=crypto.randomUUID();const results=await authDb().batch([authDb().prepare("INSERT OR IGNORE INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,'staff',?,1)").bind(id,username,email||null,b.name.trim(),p.hash,p.salt,JSON.stringify(b.permissions)),await credentialStatement(id,p.hash,b.password,admin.userId)]);const result=results[0];
return Response.json(result.meta.changes?{ok:true}:{error:"Username or email is already used."},{status:result.meta.changes?200:409});
}catch{return Response.json({error:"Could not update staff. Retry."},{status:503});}}
export const POST=change;export const DELETE=change;
