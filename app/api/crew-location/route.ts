import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';

const prefix='crew-location:';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

const validCoord=(value:any,min:number,max:number)=>{
 const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};

export async function GET(){
 const user=await currentUser();
 if(!user)return Response.json({error:'Login required.'},{status:401,headers});
 try{
  if(user.role==='admin'||hasPermission(user,'edit_excursions')){
   const accounts=(await authDb().prepare("SELECT id,username,name,permissions,active FROM accounts WHERE role='staff' AND active=1 ORDER BY name").all<any>()).results||[];
   const crew=accounts.filter((a:any)=>{try{return JSON.parse(a.permissions||'[]').includes('crew_location')}catch{return false}});
   const rows=(await authDb().prepare('SELECT key,payload FROM operation_records WHERE key LIKE ?').bind(prefix+'%').all<any>()).results||[];
   const map=new Map(rows.map((row:any)=>[String(row.key).slice(prefix.length),JSON.parse(row.payload||'{}')]));
   return Response.json({mode:'admin',crew:crew.map((a:any)=>{
    const loc=map.get(a.id)||null,updatedAt=String(loc?.updatedAt||''),ageMs=updatedAt?Date.now()-Date.parse(updatedAt):null;
    return {id:a.id,name:a.name,username:a.username,sharing:loc?.sharing===true,latitude:loc?.sharing===true?Number(loc.latitude):null,longitude:loc?.sharing===true?Number(loc.longitude):null,accuracy:loc?.sharing===true?Number(loc.accuracy)||null:null,updatedAt,stale:ageMs===null||ageMs>5*60*1000,stoppedAt:String(loc?.stoppedAt||'')};
   })},{headers});
  }
  if(!hasPermission(user,'crew_location'))return Response.json({error:'Crew location access required.'},{status:403,headers});
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+user.userId).first<any>();
  const loc=row?JSON.parse(row.payload||'{}'):null;
  return Response.json({mode:'crew',profile:{id:user.userId,name:user.displayName,username:user.username},location:loc},{headers});
 }catch{return Response.json({error:'Could not load crew locations.'},{status:503,headers});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||!hasPermission(user,'crew_location')||user.role==='admin'||!sameOrigin(r))return Response.json({error:'Crew location sharing access required.'},{status:403,headers});
 try{
  const b=await r.json(),action=String(b.action||'');
  const key=prefix+user.userId,now=new Date().toISOString();
  if(action==='stop'){
   const current=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(key).first<any>();
   const old=current?JSON.parse(current.payload||'{}'):{};
   const payload={...old,sharing:false,stoppedAt:now,updatedAt:now,name:user.displayName,username:user.username};
   await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by").bind(key,JSON.stringify(payload),user.userId).run();
   return Response.json({ok:true,location:payload},{headers});
  }
  if(action!=='update')throw Error('Choose a valid location action.');
  const latitude=validCoord(b.latitude,-90,90),longitude=validCoord(b.longitude,-180,180),accuracy=Number(b.accuracy);
  if(latitude===null||longitude===null||!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)throw Error('Invalid location received from this device.');
  const payload={sharing:true,latitude,longitude,accuracy:Math.round(accuracy),updatedAt:now,stoppedAt:'',name:user.displayName,username:user.username};
  await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by").bind(key,JSON.stringify(payload),user.userId).run();
  return Response.json({ok:true,location:payload},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update crew location.'},{status:400,headers});}
}
