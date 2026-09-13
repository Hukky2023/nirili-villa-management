import {authDb} from './auth';
import {menuSeed,MenuItem} from './menu-seed';
export const menuKey='restaurant-menu-v1';
export async function loadMenu(){const row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(menuKey).first<any>();return {items:(row?JSON.parse(row.payload):menuSeed) as MenuItem[],revision:row?.revision||0};}
export async function foodCatalog(){return (await loadMenu()).items.map(i=>({...i,kind:'food',name:i.category+' · '+i.name,detail:i.detail||i.category+' · '+i.name}));}
