import {authDb} from './auth';
import {catalog} from './guest-catalog';

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
  minGuests:1,
  category:excursionCategoryFromGroup(x.group,x.name),
  group:categoryGroup(excursionCategoryFromGroup(x.group,x.name)),
  active:x.active!==false
 }));
}
export async function loadExcursionMenu(){
 const base=baseExcursionMenu();
 const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(PREFIX+'%').all<any>();
 const overrides=new Map<string,any>();
 for(const row of rows.results||[]){
  try{const item=JSON.parse(row.payload);if(item?.id)overrides.set(String(item.id),{...item,revision:row.revision});}catch{}
 }
 const merged=base.map((item:any)=>{
  const override=overrides.get(item.id);
  if(!override)return item;
  overrides.delete(item.id);
  const category=(override.category||item.category) as ExcursionCategory;
  const mergedItem={...item,...override,kind:'excursion',minGuests:1,category,group:categoryGroup(category),active:override.active!==false};
  if(item.id==='dolphin-fishing-dinner'){
   mergedItem.name='Dolphin Watching + Fishing with Dinner';
   mergedItem.detail='Dolphin watching and fishing with dinner included as part of the same excursion.';
  }
  return mergedItem;
 });
 for(const item of overrides.values()){
  const category=excursionCategoryFromGroup(item.category||item.group,item.name);
  merged.push({...item,kind:'excursion',minGuests:1,category,group:categoryGroup(category),active:item.active!==false});
 }
 return merged.filter((x:any)=>x.active!==false).sort((a:any,b:any)=>{
  const order:any={single:0,combined:1,special:2};
  return (order[a.category]??9)-(order[b.category]??9)||String(a.name).localeCompare(String(b.name));
 });
}
export const excursionMenuKey=(id:string)=>PREFIX+id;
