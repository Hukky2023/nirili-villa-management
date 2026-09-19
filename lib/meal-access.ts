export const hasMealPlan=(meal?:string)=>meal==='Full Board'||meal==='Half Board';
export const mealItemIncluded=(meal:string|undefined,item:{fullBoard?:boolean},halfBoardAvailable=true)=>
 meal==='Full Board'?item.fullBoard===true:meal==='Half Board'&&halfBoardAvailable&&item.fullBoard===true;

export const maldivesDay=(value:string|Date=new Date())=>{
 const d=value instanceof Date?value:new Date(value);
 return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
};

export function halfBoardFreeOrderAvailable(state:any,stayId?:string,now:string|Date=new Date()){
 if(!stayId)return false;
 const stay=state?.stays?.find((s:any)=>s.id===stayId);
 if(stay?.meal!=='Half Board')return true;
 const today=maldivesDay(now);
 return !(state?.posOrders||[]).some((o:any)=>
  o.stayId===stayId&&
  maldivesDay(o.createdAt)===today&&
  Array.isArray(o.items)&&
  o.items.some((i:any)=>i.included===true)
 );
}
