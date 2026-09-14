import {authDb,currentUser,sameOrigin,limit} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {chatRecipients,validateChat,mayReadChat} from '../../../lib/guest-chat';
const prefix='guest-chat-message:';
export async function GET(r:Request){
 const u=await currentUser();if(!u||!['admin','guest'].includes(u.role))return Response.json({error:'Please sign in as Admin or guest.'},{status:403});
 const db=authDb(),url=new URL(r.url),recipient=url.searchParams.get('recipient')||'',before=url.searchParams.get('before')||'';
 let contacts:any[]=[],inHouseCount=0,withoutLogin=0;
 if(u.role==='admin'){
 const [{state},rows]=await Promise.all([loadStays(),db.prepare("SELECT id,name,active,role FROM accounts WHERE role='guest' ORDER BY name").all<any>()]);
 const active=new Set(rows.results.filter(a=>a.active).map(a=>a.id));
 const incoming=await db.prepare("SELECT json_extract(payload,'$.senderId') AS senderId,MAX(json_extract(payload,'$.createdAt')) AS latest FROM operation_records WHERE key LIKE ? AND json_extract(payload,'$.fromAdmin')=0 GROUP BY json_extract(payload,'$.senderId')").bind(prefix+'%').all<any>();
 contacts=rows.results.map(a=>{const stays=state.stays.filter((s:any)=>s.accountId===a.id&&s.status==='In House');return {id:a.id,name:a.name,lastGuestMessage:incoming.results.find(m=>m.senderId===a.id)?.latest||'',active:!!a.active,rooms:stays.map((s:any)=>s.room),inHouse:stays.length>0}});
 inHouseCount=new Set(state.stays.filter((s:any)=>s.status==='In House'&&active.has(s.accountId)).map((s:any)=>s.accountId)).size;
 withoutLogin=state.stays.filter((s:any)=>s.status==='In House'&&!active.has(s.accountId)).length;
 }
 const thread=u.role==='guest'?u.userId:recipient;
 let condition=thread?"EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.recipients')) WHERE value=?)":"json_extract(payload,'$.broadcast')=1";
 const args:any[]=[prefix+'%'];if(thread)args.push(thread);
 if(before){const split=before.split('|');if(split.length!==2||!/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(split[0])||!/^[a-f0-9-]{36}$/.test(split[1]))return Response.json({error:'Invalid history cursor.'},{status:400});condition+=" AND (json_extract(payload,'$.createdAt') < ? OR (json_extract(payload,'$.createdAt') = ? AND key < ?))";args.push(split[0],split[0],prefix+split[1]);}
 const rows=await db.prepare("SELECT payload FROM operation_records WHERE key LIKE ? AND "+condition+" ORDER BY json_extract(payload,'$.createdAt') DESC,key DESC LIMIT 101").bind(...args).all<any>();
 const messages=rows.results.slice(0,100).map(x=>JSON.parse(x.payload)).filter(m=>mayReadChat(u,m));const last=messages.at(-1);
 return Response.json({actor:{id:u.userId,name:u.displayName,role:u.role},contacts,inHouseCount,withoutLogin,messages:messages.reverse().map(m=>({id:m.id,text:m.text,sender:m.sender,fromAdmin:m.fromAdmin,broadcast:m.broadcast,createdAt:m.createdAt,...(u.role==='admin'?{recipientCount:m.recipients.length}:{})})),next:rows.results.length>100&&last?last.createdAt+'|'+last.id:null},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(r:Request){
 const u=await currentUser();if(!u||!['admin','guest'].includes(u.role)||!sameOrigin(r))return Response.json({error:'Admin or guest access required.'},{status:403});
 try{
 const body=await r.json(),text=validateChat(body),db=authDb(),key=prefix+body.token;
 const existing=await db.prepare('SELECT payload FROM operation_records WHERE key=?').bind(key).first<any>();
 if(existing){const m=JSON.parse(existing.payload);if(m.senderId!==u.userId)throw Error('Message identifier is already used.');return Response.json({sent:true,count:m.recipients.length});}
 if(!await limit('chat:'+u.userId,30,60000))return Response.json({error:'Please wait a minute before sending more messages.'},{status:429});
 const {state}=await loadStays();const accounts=u.role==='admin'?(await db.prepare("SELECT id,active,role FROM accounts WHERE role='guest'").all<any>()).results:[];
 const recipients=chatRecipients(u,body,accounts,state.stays),message={id:body.token,text,senderId:u.userId,sender:u.role==='admin'?'Nirili Villa · '+u.displayName:u.displayName,fromAdmin:u.role==='admin',broadcast:u.role==='admin'&&body.broadcast===true,recipients,createdAt:new Date().toISOString()};
 const result=await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(message),u.userId).run();
 if(!result.meta.changes){const saved=await db.prepare('SELECT payload FROM operation_records WHERE key=?').bind(key).first<any>();if(!saved||JSON.parse(saved.payload).senderId!==u.userId)throw Error('Message could not be saved. Please retry.');}
 return Response.json({sent:true,count:recipients.length});
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}
}
