import {credentialStatement} from '../../../lib/credential-store';
import {loadStays} from '../../../lib/stays';
import {authDb,currentUser,hashPassword,validPassword,sameOrigin,validEmail} from "../../../lib/auth";
const permissions=["waiter_pos","restaurant_pos","kitchen_pos","edit_bills","edit_excursions","edit_transfers","buggy_driver"];
export async function GET(){if((await currentUser())?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});try{const users=(await authDb().prepare("SELECT id,username,email,name,role,permissions,active FROM accounts ORDER BY name").all()).results;const {state}=await loadStays();return Response.json({staff:users.filter((u:any)=>u.role==='staff'),users:users.map((u:any)=>({...u,stays:u.role==='guest'?state.stays.filter((s:any)=>s.accountId===u.id).map((s:any)=>({id:s.id,room:s.room,status:s.status,meal:s.meal})):[]}))},{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Could not load accounts."},{status:503});}}
async function change(r:Request){
const admin=await currentUser();if(admin?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
if(!sameOrigin(r))return Response.json({error:"Invalid request"},{status:403});
try{const b=await r.json();
if(r.method==="DELETE"){await authDb().prepare("UPDATE accounts SET active=0 WHERE id=? AND role='staff'").bind(b.id||"").run();return Response.json({ok:true});}
if(!Array.isArray(b.permissions)||b.permissions.some((p:any)=>!permissions.includes(p)))return Response.json({error:"Choose valid permissions."},{status:400});
if(b.id){const result=await authDb().prepare("UPDATE accounts SET permissions=?,active=? WHERE id=? AND role='staff'").bind(JSON.stringify(b.permissions),b.active===false?0:1,b.id).run();return Response.json(result.meta.changes?{ok:true}:{error:"Staff not found"},{status:result.meta.changes?200:404});}
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
return Response.json(result.meta.changes?{ok:true}:{error:"Could not create the staff account."},{status:result.meta.changes?200:503});
}catch{return Response.json({error:"Could not update staff. Retry."},{status:503});}}
export const POST=change;export const DELETE=change;
