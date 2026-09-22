import {discountsUnchanged} from "../../../lib/discounts";
import {billEditor,billDb,readBill} from "../../../lib/restaurant-server";
import {initialBill} from "../../../lib/restaurant";
import {mirrorRestaurantBillRecord,saveRestaurantBillPrimary} from "../../../lib/supabase-bridge";
export async function GET(request:Request){
 if(!await billEditor())return Response.json({error:"Admin sign-in required"},{status:403});
 try{const u=new URL(request.url);const bill=await readBill(u.searchParams.get("room")||"",u.searchParams.get("id")||"");return Response.json(bill?{bill}:{error:"Bill not found"},{status:bill?200:404,headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Could not load bill. Please retry."},{status:503});}
}
export async function PUT(request:Request){
 const user=await billEditor();if(!user)return Response.json({error:"Admin sign-in required"},{status:403});
 if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Invalid origin"},{status:403});
 try{
 const b=await request.json();const seed=initialBill(b.room,b.id);
 if(!seed||!Number.isInteger(b.revision)||b.revision<0||typeof b.date!=="string"||!b.date.trim()||b.date.length>100||!["Posted","Pending","Paid","Unpaid","Cancelled"].includes(b.status)||!Array.isArray(b.items)||b.items.length>100||b.items.some((x:any)=>!Array.isArray(x)||x.length!==4||typeof x[0]!=="string"||!x[0].trim()||x[0].length>200||!Number.isInteger(x[1])||x[1]<1||x[1]>10000||!Number.isFinite(x[2])||x[2]<0||x[2]>1000000||!Number.isFinite(x[3])||x[3]<0||x[3]>100))return Response.json({error:"Check item names, quantities, amounts and discounts (0–100%)."},{status:400});
 if(user.role!=="admin"&&!discountsUnchanged((await readBill(b.room,b.id))!.items,b.items))return Response.json({error:"Only admin can change discounts or discounted items."},{status:403});
 const nextPayload={...seed,date:b.date,status:b.status,items:b.items};
 const key=b.room+":"+b.id;
 let nextRevision=0;
 try{nextRevision=await saveRestaurantBillPrimary(key,nextPayload,b.revision,user.userId);}catch{}
 if(!nextRevision){
  // During migration, accept a D1 save only if Supabase was unavailable rather than stale.
  const result=await billDb().prepare("INSERT INTO restaurant_bills (key,payload,revision,updated_by) SELECT ?,?,1,? WHERE ? = 0 ON CONFLICT(key) DO UPDATE SET payload = excluded.payload,revision = restaurant_bills.revision + 1,updated_by = excluded.updated_by WHERE restaurant_bills.revision = ?").bind(key,JSON.stringify(nextPayload),user.userId,b.revision,b.revision).run();
  if(!result.meta.changes){if(b.revision>0){const update=await billDb().prepare("UPDATE restaurant_bills SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?").bind(JSON.stringify(nextPayload),user.userId,key,b.revision).run();if(update.meta.changes){const savedBill=await readBill(b.room,b.id);try{await mirrorRestaurantBillRecord(key,savedBill,b.revision+1,user.userId);}catch{}return Response.json({bill:savedBill});}}return Response.json({error:"This bill changed elsewhere. Reopen it before saving."},{status:409});}
  nextRevision=b.revision+1;
 }else{
  // Keep D1 as a rollback mirror while Supabase is primary for this module.
  try{
   await billDb().prepare("INSERT INTO restaurant_bills(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by").bind(key,JSON.stringify(nextPayload),nextRevision,user.userId).run();
  }catch{}
 }
 const savedBill={...nextPayload,revision:nextRevision};
 return Response.json({bill:savedBill});
 }catch{return Response.json({error:"Could not save bill. Your edits remain here; please retry."},{status:503});}
}
