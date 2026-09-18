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
  category:excursionCategoryFromGroup(x.group,x.name),
  group:categoryGroup(excursionCategoryFromGroup(x.group,x.name)),
  active:x.active!==false
 }));
}
export async function loadExcursionMenu(){
 const base=baseExcursionMenu();
 const retiredBaseIds=new Set(['snorkeling']);
 const latestPosterAt=Date.parse('2026-09-18T09:14:34.000Z');
 const latestPosterIds=new Set(['turtle','coral','fishtank','dolphin','fishing','beach-seafood-dinner','sandbank','shark','sandbank-dinner']);
 const rows=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(PREFIX+'%').all<any>();
 const overrides=new Map<string,any>();
 for(const row of rows.results||[]){
  try{const item=JSON.parse(row.payload);if(item?.id)overrides.set(String(item.id),{...item,revision:row.revision});}catch{}
 }
 const merged=base.map((item:any)=>{
  const override=overrides.get(item.id);
  if(!override)return item;
  if(latestPosterIds.has(String(item.id))&&(!override.updatedAt||Date.parse(String(override.updatedAt))<=latestPosterAt)){overrides.delete(item.id);return item;}
  overrides.delete(item.id);
  const category=(override.category||item.category) as ExcursionCategory;
  return {...item,...override,kind:'excursion',category,group:categoryGroup(category),active:override.active!==false};
 });
 for(const item of overrides.values()){
  if(retiredBaseIds.has(String(item.id)))continue;
  const category=excursionCategoryFromGroup(item.category||item.group,item.name);
  merged.push({...item,kind:'excursion',category,group:categoryGroup(category),active:item.active!==false});
 }
 return merged.filter((x:any)=>x.active!==false).sort((a:any,b:any)=>{
  const order:any={single:0,combined:1,special:2};
  return (order[a.category]??9)-(order[b.category]??9)||String(a.name).localeCompare(String(b.name));
 });
}
export const excursionMenuKey=(id:string)=>PREFIX+id;
