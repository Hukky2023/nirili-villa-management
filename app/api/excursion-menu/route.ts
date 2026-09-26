import {currentUser,hasPermission,sameOrigin,authDb} from '../../../lib/auth';
import {loadExcursionMenu,excursionMenuKey,categoryGroup,type ExcursionCategory} from '../../../lib/excursion-menu';
import {readOperationalRecordPrimary,saveOperationalRecordPrimary} from '../../../lib/supabase-bridge';

const validCategory=(v:any):v is ExcursionCategory=>['single','combined','special'].includes(String(v));
const canonicalCombinedNames:Record<string,string>={
 'shark-turtle':'Shark Snorkeling (Nurse Shark) + Turtle Snorkeling',
 'coral-sandbank':'Coral Garden Snorkeling + Sandbank Trip',
 'dolphin-fishing-dinner':'Dolphin Watching + Fishing with Dinner',
 'fishtank-turtle':'Fish Tank Snorkeling + Turtle Snorkeling'
};
function cleanYouTubeUrl(value:any){
 const raw=String(value||'').trim().slice(0,500);
 if(!raw)return '';
 try{
  const url=new URL(raw);
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(!['youtube.com','m.youtube.com','youtu.be','youtube-nocookie.com'].includes(host))throw Error('Only YouTube video links are allowed.');
  return url.toString();
 }catch(e){
  if(e instanceof Error&&e.message==='Only YouTube video links are allowed.')throw e;
  throw Error('Enter a valid YouTube video link.');
 }
}
function cleanGallery(value:any){
 const input=Array.isArray(value)?value:[];
 const valid=input.map(item=>String(item||'').trim()).filter(url=>/^\/api\/menu-images\/[a-f0-9-]{36}$/.test(url));
 return Array.from(new Set(valid)).slice(0,10);
}
function clean(raw:any,id?:string){
 let name=String(raw?.name||'').trim().slice(0,180);
 const recordId=id||String(raw?.id||'');
 if(canonicalCombinedNames[recordId])name=canonicalCombinedNames[recordId];
 if(!name)throw Error('Excursion name is required.');
 const category=String(raw?.category||'single') as ExcursionCategory;
 if(!validCategory(category))throw Error('Choose Single, Combined or Special.');
 const cents=Math.max(0,Math.min(1000000,Math.round(Number(raw?.cents)||0)));
 const pricingUnit=raw?.pricingUnit==='couple'?'couple':'guest';
 const detail=String(raw?.detail||'').trim().slice(0,1000);
 const longDetail=String(raw?.longDetail||'').trim().slice(0,8000);
 const youtubeUrl=cleanYouTubeUrl(raw?.youtubeUrl);
 const galleryUrls=cleanGallery(raw?.galleryUrls);
 return {id:recordId,kind:'excursion',name,cents,category,group:categoryGroup(category),pricingUnit,detail,longDetail,youtubeUrl,galleryUrls,active:raw?.active!==false,updatedAt:new Date().toISOString()};
}
function canEdit(user:any){return !!user&&user.role!=='guest'&&(hasPermission(user,'edit_excursions')||hasPermission(user,'excursions_manager'));}

export async function GET(){
 const user=await currentUser();
 if(!hasPermission(user,'edit_excursions')&&!hasPermission(user,'excursions_manager'))return Response.json({error:'Excursion editing permission is required.'},{status:403});
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
  const key=excursionMenuKey(id);let revision=0,primaryAvailable=true;
  try{revision=await saveOperationalRecordPrimary(key,item,0,user.userId);}catch{primaryAvailable=false;}
  if(primaryAvailable){if(!revision)throw Error('Could not add excursion.');try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(item),revision,user.userId).run();}catch{}return Response.json({item:{...item,revision}},{status:201});}
  const result=await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(item),user.userId).run();
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
  let existing:any=null;try{existing=await readOperationalRecordPrimary(key);}catch{}
  if(!existing)existing=await authDb().prepare('SELECT revision FROM operation_records WHERE key=?').bind(key).first<any>();
  const expected=Number(existing?.revision)||0;
  let revision=0,primaryAvailable=true;try{revision=await saveOperationalRecordPrimary(key,item,expected,user.userId);}catch{primaryAvailable=false;}
  if(primaryAvailable){
   if(!revision)return Response.json({error:'Excursion changed. Refresh and try again.'},{status:409});
   try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,JSON.stringify(item),revision,user.userId).run();}catch{}
   return Response.json({item:{...item,revision}});
  }
  if(existing){
   await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=?').bind(JSON.stringify(item),user.userId,key).run();
   return Response.json({item:{...item,revision:expected+1}});
  }
  await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,JSON.stringify(item),user.userId).run();
  return Response.json({item:{...item,revision:1}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update excursion.'},{status:400})}
}
