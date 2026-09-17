import {currentUser,hasPermission,sameOrigin,authDb} from '../../../lib/auth';
import {loadExcursionMenu,excursionMenuKey,categoryGroup,type ExcursionCategory} from '../../../lib/excursion-menu';

const validCategory=(v:any):v is ExcursionCategory=>['single','combined','special'].includes(String(v));
function clean(raw:any,id?:string){
 const name=String(raw?.name||'').trim().slice(0,180);
 if(!name)throw Error('Excursion name is required.');
 const category=String(raw?.category||'single') as ExcursionCategory;
 if(!validCategory(category))throw Error('Choose Single, Combined or Special.');
 const cents=Math.max(0,Math.min(1000000,Math.round(Number(raw?.cents)||0)));
 const minGuests=Math.max(1,Math.min(20,Math.round(Number(raw?.minGuests)||1)));
 const detail=String(raw?.detail||'').trim().slice(0,1000);
 return {id:id||String(raw?.id||''),kind:'excursion',name,cents,category,group:categoryGroup(category),minGuests,detail,active:raw?.active!==false,updatedAt:new Date().toISOString()};
}
function canEdit(user:any){return !!user&&user.role!=='guest'&&hasPermission(user,'edit_excursions');}

export async function GET(){
 const user=await currentUser();
 if(!user)return Response.json({error:'Login required.'},{status:401});
 try{return Response.json({items:await loadExcursionMenu()},{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({error:'Could not load excursion menu.'},{status:503})}
}
export async function POST(r:Request){
 const user=await currentUser();
 if(!canEdit(user)||!sameOrigin(r))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const body=await r.json();
  const id='custom-'+crypto.randomUUID().slice(0,12);
  const item=clean(body,id);
  const result=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(excursionMenuKey(id),JSON.stringify(item),user.userId).run();
  if(!result.meta.changes)throw Error('Could not add excursion.');
  return Response.json({item:{...item,revision:1}},{status:201});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not add excursion.'},{status:400})}
}
export async function PUT(r:Request){
 const user=await currentUser();
 if(!canEdit(user)||!sameOrigin(r))return Response.json({error:'Excursion editing permission is required.'},{status:403});
 try{
  const body=await r.json(),id=String(body?.id||'').trim().slice(0,100);
  if(!id)throw Error('Excursion record is required.');
  const item=clean(body,id),key=excursionMenuKey(id);
  const existing=await authDb().prepare('SELECT revision FROM operation_records WHERE key=?').bind(key).first<any>();
  if(existing){
   await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=?').bind(JSON.stringify(item),user.userId,key).run();
   return Response.json({item:{...item,revision:Number(existing.revision||0)+1}});
  }
  await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(item),user.userId).run();
  return Response.json({item:{...item,revision:1}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update excursion.'},{status:400})}
}
