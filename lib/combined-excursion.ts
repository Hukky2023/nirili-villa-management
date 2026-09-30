export function combinedExcursionQuote(ids:unknown,menu:any[]){
 if(!Array.isArray(ids)||ids.length<2||ids.length>3||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('Select two or three different single excursions.');
 const selected=ids.map(id=>menu.find(item=>item.id===id&&item.category==='single'&&item.active!==false));
 if(selected.some(item=>!item||item.pricingUnit==='couple'||!Number.isInteger(item.cents)||item.cents<=0))throw Error('Choose available single excursions with a recorded per-guest price.');
 const subtotalCents=selected.reduce((sum,item)=>sum+item.cents,0);
 const discountCents=ids.length===3?2000:1000;
 return {componentIds:ids as string[],subtotalCents,discountCents,cents:Math.max(0,subtotalCents-discountCents),name:selected.map(item=>item.name).join(' + '),scheduleName:selected.map(item=>item.scheduleName||item.name).join(' + ')};
}
