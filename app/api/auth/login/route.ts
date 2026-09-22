import {transportPortalAllowed,isTransportAgent} from '../../../../lib/transport-access';
import {withTab} from '../../../../lib/tab-session';
import {restaurantOnly,canPOS,canKitchen,canTakePayment} from '../../../../lib/pos-access';
import {roomLoginActive,authDb,bootstrap,verifyPassword,issueSession,sameOrigin,limit,publicUser} from "../../../../lib/auth";
import {authenticateSupabaseEmployee,ensureSupabaseEmployee} from "../../../../lib/supabase-bridge";
export async function POST(request:Request){
if(!sameOrigin(request))return Response.json({error:"Invalid request"},{status:403});
try{
const b=await request.json();const username=typeof b.username==="string"?b.username.trim().toLowerCase():"";
if(!username||username.length>254||typeof b.password!=="string"||b.password.length>128)return Response.json({error:"Enter your username and password."},{status:400});
const ip=request.headers.get("cf-connecting-ip")||"unknown";
if(!await limit("login-ip:"+ip,100,900000)||!await limit("login:"+username,15,900000))return Response.json({error:"Too many attempts. Try again in 15 minutes."},{status:429});
await bootstrap();
let row:any=await authDb().prepare("SELECT * FROM accounts WHERE (username=? OR email=?) AND active=1").bind(username,username).first<any>();
const match=await verifyPassword(b.password,row?.salt||"00000000000000000000000000000000",row?.password_hash||"0".repeat(64));
if(row&&match&&await roomLoginActive(row.id)){
 if(['admin','staff'].includes(row.role))try{
  await Promise.race([ensureSupabaseEmployee(row,b.password),new Promise(resolve=>setTimeout(resolve,1200))]);
 }catch{}
}else{
 row=null;
 let supabaseAuth:any=null;
 try{supabaseAuth=await authenticateSupabaseEmployee(username,b.password);}catch{}
 if(supabaseAuth)row=await authDb().prepare("SELECT * FROM accounts WHERE id=? AND active=1").bind(supabaseAuth.legacyId).first<any>();
 if(!row||!await roomLoginActive(row.id))return Response.json({error:"Incorrect username or password."},{status:401});
}
const user=publicUser(row);
if(typeof b.portal==="string"&&b.portal.startsWith("transport_")&&!transportPortalAllowed(user,b.portal))return Response.json({error:"This account cannot access the selected transport portal."},{status:403});
if(isTransportAgent(user)&&!["transport_agent","direct"].includes(b.portal))return Response.json({error:"Use the Agent login on the transport page."},{status:403});
if(b.portal==="admin"&&user.role!=="admin"||b.portal==="staff"&&!["admin","staff"].includes(user.role))return Response.json({error:"This account cannot access that portal."},{status:403});
if(b.portal==='restaurant_cashier'&&!canTakePayment(user)||b.portal==='restaurant_waiter'&&!canPOS(user)||b.portal==='restaurant_kitchen'&&!canKitchen(user)||b.portal==='restaurant_guest'&&user.role!=='guest')return Response.json({error:'This account cannot access the selected restaurant portal.'},{status:403});
if(b.portal==='buggy_driver'&&!(user.role==='admin'||user.role==='staff'&&user.permissions.includes('buggy_driver')))return Response.json({error:'This account cannot access the Buggy Driver portal.'},{status:403});
if(b.portal==='crew_member'&&!(user.role==='admin'||user.role==='staff'&&user.permissions.includes('crew_location')))return Response.json({error:'This account cannot access the Crew Member portal.'},{status:403});
const portal=["admin","staff","guest"].includes(b.portal)?b.portal:user.role;
function directDestination(){
 if(isTransportAgent(user))return "/transport";
 if(user.role==="admin")return "/?portal=admin";
 if(user.role==="guest")return "/?portal=guest";
 if(user.role==="staff"){
  if(user.permissions.length===1&&user.permissions.includes("crew_location"))return "/crew";
  if(user.permissions.length===1&&user.permissions.includes("buggy_driver"))return "/buggy-driver";
  if(restaurantOnly(user)){
   if(user.permissions.length===1&&user.permissions.includes("kitchen_pos"))return "/restaurant/kitchen";
   return "/restaurant";
  }
  return "/?portal=staff";
 }
 return "/login";
}
const back=b.portal==="direct"?directDestination():b.portal==="crew_member"?"/crew":b.portal==="buggy_driver"?"/buggy-driver":typeof b.portal==="string"&&b.portal.startsWith("transport_")?"/transport":b.portal==="restaurant_guest"?"/restaurant/guest?mode=inhouse":b.portal==="restaurant_kitchen"?"/restaurant/kitchen":["restaurant_cashier","restaurant_waiter"].includes(b.portal)?"/restaurant":restaurantOnly(user)?"/restaurant":b.returnTo==="/restaurant"?"/restaurant":typeof b.returnTo==="string"&&/^\/restaurant\/bills\/[a-zA-Z0-9%_-]+\/[a-zA-Z0-9%_-]+$/.test(b.returnTo)?b.returnTo:"/?portal="+portal;
const tab=crypto.randomUUID().replace(/-/g,'');return Response.json({redirect:withTab(back,tab)},{headers:{"Set-Cookie":await issueSession(user.userId,tab),"Cache-Control":"no-store"}});
}catch{return Response.json({error:"Login unavailable. Please retry."},{status:503});}}
