import {restaurantOnly} from '../../../lib/pos-access';
import {discountsUnchanged} from "../../../lib/discounts";
import {authDb,currentUser,hasPermission,sameOrigin} from "../../../lib/auth";
import {mirrorOperationalRecord,readOperationalRecordPrimary,readOperationalRecordsPrimaryByPrefix,saveOperationalRecordPrimary} from '../../../lib/supabase-bridge';

function prefix(room:string){return "folio:"+room+":";}
function parsePayload(value:any){if(value&&typeof value==='object')return value;try{return JSON.parse(String(value||'{}'))}catch{return {}}}

async function mergedBillRows(room:string){
 const p=prefix(room);
 const d1Promise=authDb().prepare("SELECT key,payload,revision,updated_by FROM operation_records WHERE key LIKE ?").bind(p+"%").all<any>();
 const primaryPromise=readOperationalRecordsPrimaryByPrefix(p).catch(()=>[]);
 const [d1,primary]=await Promise.all([d1Promise,primaryPromise]);
 const byKey=new Map<string,any>();
 for(const row of d1.results||[])byKey.set(String(row.key),{...row,payload:parsePayload(row.payload)});
 for(const row of primary||[]){
  const key=String(row.key),current=byKey.get(key);
  if(!current||Number(row.revision||0)>=Number(current.revision||0))byKey.set(key,{...row,payload:parsePayload(row.payload)});
 }
 return [...byKey.values()];
}

async function currentBillRecord(key:string){
 let primary:any=null;try{primary=await readOperationalRecordPrimary(key)}catch{}
 const d1=await authDb().prepare("SELECT key,payload,revision,updated_by FROM operation_records WHERE key=?").bind(key).first<any>();
 if(primary&&(!d1||Number(primary.revision||0)>=Number(d1.revision||0)))return {...primary,payload:parsePayload(primary.payload)};
 return d1?{...d1,payload:parsePayload(d1.payload)}:null;
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!user||restaurantOnly(user)||user.role==="guest")return Response.json({error:"Staff login required"},{status:403});
 const room=new URL(r.url).searchParams.get("room")||"";
 if(!/^(?:10[1-6]|20[1-4]|30[1-4])$/.test(room))return Response.json({error:"Invalid room"},{status:400});
 try{
  const rows=await mergedBillRows(room);
  return Response.json({bills:rows.map(row=>({...row.payload,revision:Number(row.revision)||0}))},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Could not load bills"},{status:503});}
}

export async function PUT(r:Request){
 const user=await currentUser();
 if(!hasPermission(user,"edit_bills")||!sameOrigin(r))return Response.json({error:"Bill editing permission required"},{status:403});
 try{
  const b=await r.json(),x=b.bill;
  if(!/^(?:10[1-6]|20[1-4]|30[1-4])$/.test(String(b.room))||!x||!["Accommodation","Transfer","Excursions"].includes(x.department)||typeof x.id!=="string"||!/^[-A-Z0-9]{1,40}$/.test(x.id)||!Number.isInteger(x.revision)||x.revision<0||typeof x.date!=="string"||!x.date.trim()||x.date.length>100||!["Posted","Pending","Paid","Unpaid","Cancelled"].includes(x.status)||!Array.isArray(x.items)||x.items.length>100||x.items.some((i:any)=>!Array.isArray(i)||i.length!==4||typeof i[0]!=="string"||!i[0].trim()||i[0].length>200||!Number.isInteger(i[1])||i[1]<1||i[1]>10000||!Number.isFinite(i[2])||i[2]<0||i[2]>1000000||!Number.isFinite(i[3])||i[3]<0||i[3]>100))return Response.json({error:"Check bill items, amounts and discounts."},{status:400});

  const bill={id:x.id,department:x.department,date:x.date,status:x.status,items:x.items,total:Math.round(x.items.reduce((s:number,i:any)=>s+Math.round(i[2]*100)*(1-i[3]/100),0))/100};
  const key=prefix(String(b.room))+x.department+":"+x.id;
  const current=await currentBillRecord(key);
  if(Number(current?.revision||0)!==x.revision)return Response.json({error:"Bill changed elsewhere. Reopen it before saving."},{status:409});
  if(user!.role!=="admin"&&!discountsUnchanged(current?.payload?.items||[],x.items))return Response.json({error:"Only admin can change discounts or discounted items."},{status:403});

  let nextRevision=0,primaryAvailable=true;
  try{
   if(!await readOperationalRecordPrimary(key)&&current&&x.revision>0)await mirrorOperationalRecord(key,current.payload,x.revision,String(current.updated_by||''));
   nextRevision=await saveOperationalRecordPrimary(key,bill,x.revision,user!.userId);
  }catch{primaryAvailable=false;}

  if(primaryAvailable){
   if(!nextRevision)return Response.json({error:"Bill changed elsewhere. Reopen it before saving."},{status:409});
   try{
    await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by").bind(key,JSON.stringify(bill),nextRevision,user!.userId).run();
   }catch{}
   return Response.json({bill:{...bill,revision:nextRevision}});
  }

  const payload=JSON.stringify(bill);
  const result=x.revision===0
   ?await authDb().prepare("INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)").bind(key,payload,user!.userId).run()
   :await authDb().prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?").bind(payload,user!.userId,key,x.revision).run();
  if(!result.meta.changes)return Response.json({error:"Bill changed elsewhere. Reopen it before saving."},{status:409});
  nextRevision=x.revision+1;
  try{await mirrorOperationalRecord(key,bill,nextRevision,user!.userId);}catch{}
  return Response.json({bill:{...bill,revision:nextRevision}});
 }catch{return Response.json({error:"Could not save bill. Retry."},{status:503});}
}
