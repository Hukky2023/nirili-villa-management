import {credentialStatement} from '../../../lib/credential-store';
import {loadStays} from '../../../lib/stays';
import {authDb,currentUser,hashPassword,validPassword,sameOrigin,validEmail} from "../../../lib/auth";
import {walkInExcursionProfile} from '../../../lib/walkin-excursion-access';
import {appendAccountHistory,readAccountHistory} from '../../../lib/account-history';
const permissions=["waiter_pos","restaurant_pos","kitchen_pos","edit_bills","edit_excursions","edit_transfers","buggy_driver","crew_location"];
function historyFor(user:any,state:any,stays:any[],walkIn:any,audit:any[]){
 const events:any[]=[...audit];
 const add=(at:any,action:string,detail='',by='')=>{if(at)events.push({at:String(at),action,detail:String(detail||''),by:String(by||'')});};
 if(walkIn){
  add(walkIn.createdAt,'Temporary walk-in login created',(walkIn.hotel||'')+(walkIn.room?' · Room '+walkIn.room:''));
  if(walkIn.endedAt)add(walkIn.endedAt,'Temporary walk-in login ended','Access expired or was terminated.');
 }
 for(const stay of stays){
  add(stay.checkedInAt,'Checked in','Room '+stay.room+' · '+stay.id);
  add(stay.checkedOutAt,'Checked out','Room '+stay.room+' · '+stay.id);
  for(const h of stay.history||[])add(h.date,h.detail||'Stay updated','Room '+stay.room+' · '+stay.id,h.by||'');
 }
 const stayIds=new Set(stays.map((s:any)=>s.id));
 for(const order of state.orders||[]){
  if(user.role==='guest'&&(order.accountId===user.id||stayIds.has(order.stayId))){
   add(order.createdAt,(order.kind==='excursion'?'Excursion':'Service')+' created',(order.name||order.id)+' · '+(order.status||''),order.createdBy||'');
   add(order.reviewedAt,'Excursion reviewed',(order.name||order.id)+' · '+(order.approvalStatus||order.status||''),order.reviewedBy||'');
   add(order.cancelledAt,'Excursion cancelled',(order.name||order.id)+(order.cancellationReason?' · '+order.cancellationReason:''),order.cancelledBy||'');
  }else if(user.role==='staff'){
   const actors=[order.createdBy,order.updatedBy,order.reviewedBy,order.cancelledBy,order.by].filter(Boolean);
   if(actors.includes(user.username))add(order.reviewedAt||order.cancelledAt||order.updatedAt||order.createdAt,'Operational update',(order.name||order.id)+' · '+(order.status||''),user.username);
  }
 }
 for(const order of state.posOrders||[]){
  if(user.role==='guest'&&(order.guestKey==='guest:'+user.id||stayIds.has(order.stayId))){
   add(order.createdAt,'Restaurant order created',order.id+' · Table '+(order.table||'')+' · '+(order.kitchen||''),order.createdBy||'');
  }
  for(const h of order.history||[])if(user.role==='staff'&&h.by===user.username)add(h.date,'Restaurant update',h.detail||order.id,user.username);
 }
 const seen=new Set<string>();
 return events.filter((event:any)=>{
  const key=[event.at,event.action,event.detail,event.by].join('|');if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a:any,b:any)=>String(b.at).localeCompare(String(a.at))).slice(0,60);
}

export async function GET(){
 if((await currentUser())?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
 try{
  const users=(await authDb().prepare("SELECT id,username,email,name,role,permissions,active FROM accounts ORDER BY name").all()).results;
  const {state}=await loadStays();
  const shaped=await Promise.all(users.map(async(u:any)=>{
   const stays=u.role==='guest'?(state.stays||[]).filter((s:any)=>s.accountId===u.id):[];
   const stayView=stays.map((s:any)=>({id:s.id,room:s.room,status:s.status,meal:s.meal,checkIn:s.checkIn,checkOut:s.checkOut,checkedInAt:s.checkedInAt||'',checkedOutAt:s.checkedOutAt||'',history:s.history||[]}));
   const walkIn=u.role==='guest'?walkInExcursionProfile(state,u.id):undefined;
   const currentInHouse=stayView.find((s:any)=>s.status==='In House')||stayView.find((s:any)=>s.status==='Confirmed');
   const audit=await readAccountHistory(u.id);
   return {
    ...u,
    stays:stayView.map(({history,...s}:any)=>s),
    guestType:u.role==='guest'?(walkIn?'walkin':currentInHouse?'inhouse':stayView.length?'inhouse':'guest'):'',
    walkIn:walkIn?{hotel:walkIn.hotel,room:walkIn.room,phone:walkIn.phone,departureDate:walkIn.departureDate,expiresAt:walkIn.expiresAt,guests:walkIn.guests||[],createdAt:walkIn.createdAt,endedAt:walkIn.endedAt||'',active:walkIn.active}:null,
    history:historyFor(u,state,stayView,walkIn,audit)
   };
  }));
  return Response.json({staff:shaped.filter((u:any)=>u.role==='staff'),users:shaped},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Could not load accounts."},{status:503});}
}
async function change(r:Request){
const admin=await currentUser();if(admin?.role!=="admin")return Response.json({error:"Admin access required"},{status:403});
if(!sameOrigin(r))return Response.json({error:"Invalid request"},{status:403});
try{const b=await r.json();
if(r.method==="DELETE"){const id=String(b.id||'');const result=await authDb().prepare("UPDATE accounts SET active=0 WHERE id=? AND role='staff'").bind(id).run();if(result.meta.changes)await appendAccountHistory(id,{at:new Date().toISOString(),action:'Account disabled',by:admin.username,detail:'Staff login disabled.'});return Response.json({ok:!!result.meta.changes});}
if(!Array.isArray(b.permissions)||b.permissions.some((p:any)=>!permissions.includes(p)))return Response.json({error:"Choose valid permissions."},{status:400});
if(b.id){
 const before=await authDb().prepare("SELECT active,permissions FROM accounts WHERE id=? AND role='staff'").bind(b.id).first<any>();
 if(!before)return Response.json({error:"Staff not found"},{status:404});
 const active=b.active===false?0:1;
 const result=await authDb().prepare("UPDATE accounts SET permissions=?,active=? WHERE id=? AND role='staff'").bind(JSON.stringify(b.permissions),active,b.id).run();
 if(result.meta.changes){
  const oldPermissions=String(before.permissions||'[]'),newPermissions=JSON.stringify(b.permissions);
  if(Number(before.active)!==active)await appendAccountHistory(b.id,{at:new Date().toISOString(),action:active?'Account enabled':'Account disabled',by:admin.username,detail:active?'Staff login restored.':'Staff login disabled.'});
  if(oldPermissions!==newPermissions)await appendAccountHistory(b.id,{at:new Date().toISOString(),action:'Permissions updated',by:admin.username,detail:(b.permissions||[]).join(', ')||'No permissions assigned.'});
 }
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
if(result.meta.changes)await appendAccountHistory(id,{at:new Date().toISOString(),action:'Staff account created',by:admin.username,detail:(b.permissions||[]).join(', ')||'No permissions assigned.'});
return Response.json(result.meta.changes?{ok:true}:{error:"Could not create the staff account."},{status:result.meta.changes?200:503});
}catch{return Response.json({error:"Could not update staff. Retry."},{status:503});}}
export const POST=change;export const DELETE=change;
