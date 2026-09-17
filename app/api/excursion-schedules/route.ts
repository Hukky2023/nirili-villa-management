import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';

const prefix='excursion-schedule:';
const validDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
const validTime=(v:any)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const clean=(x:any)=>{
 if(!x||!validDate(x.date)||!validTime(x.time))throw Error('Choose a valid date and departure time.');
 const name=String(x.name||'').trim().slice(0,180);
 if(!name)throw Error('Excursion name is required.');
 const capacity=Math.max(1,Math.min(100,Number(x.capacity)||1));
 const vesselId=String(x.vesselId||'').slice(0,100);
 const crewIds=Array.isArray(x.crewIds)?[...new Set(x.crewIds.map((id:any)=>String(id).slice(0,100)).filter(Boolean))].slice(0,20):[];
 const status=x.status==='Closed'?'Closed':'Open';
 const notes=String(x.notes||'').trim().slice(0,1000);
 return {date:x.date,time:x.time,name,capacity,vesselId,crewIds,status,notes};
};

export async function GET(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest')return Response.json({error:'Staff login required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||'';
 if(!validDate(date))return Response.json({error:'Valid schedule date required.'},{status:400});
 try{
  const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
  const schedules=(rows.results||[]).map((row:any)=>({...JSON.parse(row.payload),revision:row.revision})).sort((a:any,b:any)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
  return Response.json({date,schedules,canEdit:hasPermission(user,'edit_excursions')},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load excursion schedules.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const body=clean(await r.json());
  const id=crypto.randomUUID();
  const record={id,...body,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const result=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(prefix+body.date+':'+id,JSON.stringify(record),user.userId).run();
  if(!result.meta.changes)throw Error('Could not create schedule.');
  return Response.json({schedule:{...record,revision:1}},{status:201});
 }catch(e){return Response.json({error:(e as Error).message||'Could not create schedule.'},{status:400});}
}

export async function PUT(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const raw=await r.json();
  const id=String(raw.id||'').slice(0,100),revision=Number(raw.revision);
  if(!id||!Number.isInteger(revision)||revision<1)throw Error('Invalid schedule record.');
  const body=clean(raw);
  const key=prefix+body.date+':'+id;
  const existing=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(key).first<any>();
  if(!existing)throw Error('Schedule not found.');
  const old=JSON.parse(existing.payload);
  const record={...old,...body,id,updatedAt:new Date().toISOString()};
  const result=await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(record),user.userId,key,revision).run();
  if(!result.meta.changes)return Response.json({error:'Schedule changed elsewhere. Reload and try again.'},{status:409});
  return Response.json({schedule:{...record,revision:revision+1}});
 }catch(e){return Response.json({error:(e as Error).message||'Could not update schedule.'},{status:400});}
}

export async function DELETE(r:Request){
 const user=await currentUser();
 if(!user||user.role==='guest'||!sameOrigin(r)||!hasPermission(user,'edit_excursions'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const body=await r.json(),id=String(body.id||'').slice(0,100),date=String(body.date||'');
  if(!id||!validDate(date))throw Error('Invalid schedule record.');
  await authDb().prepare('DELETE FROM operation_records WHERE key=?').bind(prefix+date+':'+id).run();
  return Response.json({ok:true});
 }catch(e){return Response.json({error:(e as Error).message||'Could not delete schedule.'},{status:400});}
}
