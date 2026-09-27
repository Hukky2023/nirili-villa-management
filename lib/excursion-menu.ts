import {authDb} from './auth';
import {catalog} from './guest-catalog';
import {readOperationalRecordsPrimary} from './supabase-bridge';

const PREFIX='excursion-menu:';
export type ExcursionCategory='single'|'combined'|'special';

export function excursionCategoryFromGroup(group:any,name=''):ExcursionCategory{
 const value=String(group||'').trim().toLowerCase();
 const n=String(name||'').trim().toLowerCase();
 if(value.includes('special')||n.includes('special package'))return 'special';
 if(value.includes('combined'))return 'combined';
 if(value.includes('single')||value==='excursions')return 'single';
 if(n.includes('+'))return 'combined';
 return 'single';
}
export function categoryGroup(category:ExcursionCategory){
 return category==='single'?'Single Excursions':category==='combined'?'Combined Excursions':'Special Packages';
}
export function baseExcursionMenu(){
 return catalog.filter((x:any)=>x.kind==='excursion').map((x:any)=>({
  ...x,
  scheduleName:x.name,
  minGuests:1,
  category:excursionCategoryFromGroup(x.group,x.name),
  group:categoryGroup(excursionCategoryFromGroup(x.group,x.name)),
  active:x.active!==false
 }));
}
export async function loadExcursionMenu(includeInactive=false){
 const base=baseExcursionMenu();
 let rawRows:any[]=[];
 try{rawRows=await readOperationalRecordsPrimary(PREFIX);}catch{}
 if(!rawRows.length){const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(PREFIX+'%').all<any>();rawRows=rows.results||[];}
 const overrides=new Map<string,any>();
 for(const row of rawRows){
  try{const item=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;if(item?.id)overrides.set(String(item.id),{...item,revision:Number(row.revision)||0});}catch{}
 }
 const merged=base.map((item:any)=>{
  const override=overrides.get(item.id);
  if(!override)return item;
  overrides.delete(item.id);
  const category=(override.category||item.category) as ExcursionCategory;
  const mergedItem={...item,...override,kind:'excursion',scheduleName:item.scheduleName||item.name,minGuests:1,category,group:categoryGroup(category),active:override.active!==false};
  // Replace the old seeded setup note while preserving admin-written descriptions.
  if(mergedItem.id==='clownfish'&&mergedItem.detail==='Snorkel among colorful clown fish and reef life. Price can be set by Admin from the Excursion menu.')mergedItem.detail=item.detail;
  return mergedItem;
 });
 for(const item of overrides.values()){
  const category=excursionCategoryFromGroup(item.category||item.group,item.name);
  merged.push({...item,scheduleName:item.scheduleName||item.name,kind:'excursion',minGuests:1,category,group:categoryGroup(category),active:item.active!==false});
 }
 return merged.filter((x:any)=>includeInactive||x.active!==false).sort((a:any,b:any)=>{
  const order:any={single:0,combined:1,special:2};
  return (order[a.category]??9)-(order[b.category]??9)||String(a.name).localeCompare(String(b.name));
 });
}
export const excursionMenuKey=(id:string)=>PREFIX+id;
