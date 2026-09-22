import {restaurantOnly} from '../../../lib/pos-access';
import {authDb,currentUser,hasPermission,sameOrigin} from "../../../lib/auth";
import {operationSeeds} from "../../../lib/operations";
import {readOperationalRecordPrimary,saveOperationalRecordPrimary} from "../../../lib/supabase-bridge";
export async function GET(r:Request){const u=await currentUser();const category=new URL(r.url).searchParams.get("category")||"";if(!operationSeeds[category])return Response.json({error:"Not found"},{status:404});const permission=category==="Transfers"?"edit_transfers":"edit_excursions";if(!u||restaurantOnly(u)||u.role==="guest"||!hasPermission(u,permission))return Response.json({error:"This account does not have access to these operation records."},{status:403});
try{const records=await Promise.all(operationSeeds[category].map(async seed=>{let row:any=null;try{row=await readOperationalRecordPrimary(category+":"+seed.id);}catch{}if(!row)row=await authDb().prepare("SELECT payload,revision FROM operation_records WHERE key=?").bind(category+":"+seed.id).first<any>();return row?{...(typeof row.payload==="string"?JSON.parse(row.payload):row.payload),revision:Number(row.revision)||0}:{...seed,revision:0};}));return Response.json({records},{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Could not load records. Please retry."},{status:503});}}
export async function PUT(r:Request){
const u=await currentUser();if(!u||u.role==="guest"||!sameOrigin(r))return Response.json({error:"Not allowed"},{status:403});
try{const b=await r.json(),category=b.category,x=b.record;
if(!operationSeeds[category]||!hasPermission(u,category==="Transfers"?"edit_transfers":"edit_excursions"))return Response.json({error:"Editing permission is required."},{status:403});
if(!x||!operationSeeds[category].some(s=>s.id===x.id)||!Number.isInteger(x.revision)||x.revision<0||!Number.isInteger(x.guests)||x.guests<1||x.guests>500||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)||["service","boat","status",category==="Transfers"?"guest":"guide"].some(k=>typeof x[k]!=="string"||!x[k].trim()||x[k].length>200))return Response.json({error:"Check time, passenger count and required fields."},{status:400});
const next={id:x.id,time:x.time,service:x.service,guests:x.guests,boat:x.boat,status:x.status,...(category==="Transfers"?{guest:x.guest}:{guide:x.guide})};
const key=category+":"+x.id;
let nextRevision=0,primaryAvailable=true;
try{nextRevision=await saveOperationalRecordPrimary(key,next,x.revision,u.userId);}catch{primaryAvailable=false;}
if(primaryAvailable){
 if(!nextRevision)return Response.json({error:"Record changed elsewhere. Reload before editing."},{status:409});
 try{await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by").bind(key,JSON.stringify(next),nextRevision,u.userId).run();}catch{}
 return Response.json({record:{...next,revision:nextRevision}});
}
const payload=JSON.stringify(next);
const result=x.revision===0?await authDb().prepare("INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)").bind(key,payload,u.userId).run():await authDb().prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?").bind(payload,u.userId,key,x.revision).run();
return Response.json(result.meta.changes?{record:{...next,revision:x.revision+1}}:{error:"Record changed elsewhere. Reload before editing."},{status:result.meta.changes?200:409});
}catch{return Response.json({error:"Unable to save. Your changes remain here; retry."},{status:503});}}
