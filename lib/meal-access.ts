export type RestaurantMealPeriod='Breakfast'|'Lunch'|'Dinner';
export type HalfBoardIncludedMeal='Lunch'|'Dinner';

export const hasMealPlan=(meal?:string)=>meal==='Full Board'||meal==='Half Board';

export const maldivesDay=(value:string|Date=new Date())=>{
 const d=value instanceof Date?value:new Date(value);
 return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
};

export function restaurantOrderingStatus(value:string|Date=new Date()){
 const d=value instanceof Date?value:new Date(value);
 if(Number.isNaN(d.getTime()))return {open:false,period:'',reason:'Ordering is temporarily unavailable.'};
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Indian/Maldives',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 const minutes=(Number(get('hour'))||0)*60+(Number(get('minute'))||0);
 const lunchStart=get('weekday')==='Fri'?13*60+30:12*60;
 if(minutes>=lunchStart&&minutes<15*60)return {open:true,period:'Lunch',reason:'Lunch ordering is open until 15:00.'};
 if(minutes>=18*60&&minutes<22*60)return {open:true,period:'Dinner',reason:'Dinner ordering is open until 22:00.'};
 if(minutes<lunchStart)return {open:false,period:'',reason:get('weekday')==='Fri'?'Ordering is closed. Friday lunch ordering opens at 13:30.':'Ordering is closed. Lunch ordering opens at 12:00.'};
 if(minutes<18*60)return {open:false,period:'',reason:'Ordering is closed between lunch and dinner. Dinner ordering opens at 18:00.'};
 return {open:false,period:'',reason:'Ordering is closed for today. Lunch ordering opens tomorrow at 12:00.'};
}

// Kept as informational metadata only. Meal-plan inclusion no longer depends on service time.
export function restaurantMealPeriod(value:string|Date=new Date()):RestaurantMealPeriod|''{
 const d=value instanceof Date?value:new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Indian/Maldives',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 const minutes=(Number(get('hour'))||0)*60+(Number(get('minute'))||0);
 if(minutes>=7*60&&minutes<9*60)return 'Breakfast';
 const lunchStart=get('weekday')==='Fri'?13*60+30:12*60;
 if(minutes>=lunchStart&&minutes<15*60)return 'Lunch';
 if(minutes>=18*60&&minutes<22*60)return 'Dinner';
 return '';
}

function stayFor(state:any,stayId?:string){return stayId?(state?.stays||[]).find((stay:any)=>stay.id===stayId):null;}

export function mealPlanDailyOrderLimit(meal?:string){
 return meal==='Full Board'?2:meal==='Half Board'?1:0;
}

export function mealPlanIncludedOrderCount(
 state:any,
 stayId?:string,
 now:string|Date=new Date(),
 excludeOrderId=''
){
 const stay=stayFor(state,stayId);
 if(!stay||!hasMealPlan(stay.meal))return 0;
 const day=maldivesDay(now);
 return (state?.posOrders||[]).filter((order:any)=>{
  if(!order||String(order.id||'')===String(excludeOrderId||''))return false;
  if(order.stayId!==stayId||maldivesDay(order.createdAt)!==day)return false;
  return Array.isArray(order.items)&&order.items.some((item:any)=>item?.included===true);
 }).length;
}

export function mealPlanOrderStatus(
 state:any,
 stayId?:string,
 now:string|Date=new Date(),
 excludeOrderId=''
){
 const stay=stayFor(state,stayId);
 const limit=mealPlanDailyOrderLimit(stay?.meal);
 const used=limit?mealPlanIncludedOrderCount(state,stayId,now,excludeOrderId):0;
 const remaining=Math.max(0,limit-used);
 return {meal:stay?.meal||'',limit,used,remaining,available:remaining>0,date:maldivesDay(now)};
}

// Compatibility helpers used by older UI/API fields.
export function halfBoardIncludedMealPeriod(_state:any,_stayId?:string,_now:string|Date=new Date()):HalfBoardIncludedMeal|''{return '';}
export function halfBoardMealSelection(_state:any,_stayId?:string,_now:string|Date=new Date()):HalfBoardIncludedMeal|''{return '';}
export function halfBoardIncludedMealUsed(state:any,stayId?:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 return stay?.meal==='Half Board'&&mealPlanOrderStatus(state,stayId,now).used>=1;
}
export function halfBoardFreeOrderAvailable(state:any,stayId?:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(stay?.meal!=='Half Board')return true;
 return mealPlanOrderStatus(state,stayId,now).available;
}
export function halfBoardMealStatus(state:any,stayId?:string,now:string|Date=new Date()){
 const status=mealPlanOrderStatus(state,stayId,now);
 return {
  selectedMeal:'',
  includedMeal:'',
  freeOrderAvailable:status.available,
  locked:!status.available,
  period:restaurantMealPeriod(now),
  date:status.date,
  limit:status.limit,
  used:status.used,
  remaining:status.remaining
 };
}
export function setHalfBoardMealSelection(state:any,stayId:string,_meal:any,_by:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(!stay||stay.status!=='In House')throw Error('Select a checked-in Half Board room.');
 if(stay.meal!=='Half Board')throw Error('This room is not on Half Board.');
 return halfBoardMealSelection(state,stayId,now);
}

export const mealItemCoveredByPackage=(meal:string|undefined,item:{fullBoard?:boolean})=>
 item.fullBoard===true&&hasMealPlan(meal);

export const mealItemIncluded=(
 meal:string|undefined,
 item:{fullBoard?:boolean},
 freeOrderAvailable=true,
 _halfBoardMeal:HalfBoardIncludedMeal|''='',
 _period:RestaurantMealPeriod|''=''
)=>{
 return item.fullBoard===true&&hasMealPlan(meal)&&freeOrderAvailable;
};
