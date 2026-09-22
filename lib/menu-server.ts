import {authDb} from './auth';
import {menuSeed,MenuItem} from './menu-seed';
import {readOperationalRecordPrimary} from './supabase-bridge';
export const menuKey='restaurant-menu-v1';
export async function loadMenu(){let row:any=null;try{row=await readOperationalRecordPrimary(menuKey);}catch{}if(!row)row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(menuKey).first<any>();const payload=row?(typeof row.payload==='string'?JSON.parse(row.payload):row.payload):menuSeed;return {items:payload as MenuItem[],revision:Number(row?.revision)||0};}
export async function foodCatalog(){return (await loadMenu()).items.map(i=>({...i,kind:'food',name:i.category+' · '+i.name,detail:i.detail||i.category+' · '+i.name}));}
