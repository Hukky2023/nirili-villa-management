import {excursionComponents,normalizeExcursionName} from './excursion-operations';

const signature=(name:string)=>excursionComponents(name).sort().join('|');
// Use the saved catalog for every new quote. Stored booking amounts remain snapshots.
export function scheduleCatalogPrice(schedule:any,menu:any[]):number|null{
 const reference=String(schedule.menuItemId||''),name=String(schedule.name||'');
 const match=reference?menu.find(item=>item.id===reference):menu.find(item=>normalizeExcursionName(item.name)===normalizeExcursionName(name)||normalizeExcursionName(item.scheduleName)===normalizeExcursionName(name))||menu.find(item=>signature(item.scheduleName||item.name)===signature(name));
 if(match)return match.active===false?null:Math.max(0,Number(match.cents)||0);
 if(reference)return null;
 const components=excursionComponents(name);
 const parts=components.map(component=>menu.find(item=>item.category==='single'&&signature(item.scheduleName||item.name)===component));
 if(parts.length&&parts.every(Boolean))return parts.some(item=>item.active===false)?null:parts.reduce((sum,item)=>sum+Math.max(0,Number(item.cents)||0),0);
 const explicit=Number(schedule.priceCents);
 return Number.isInteger(explicit)&&explicit>=0?explicit:null;
}
