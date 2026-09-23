export type RestaurantMealPeriod='Breakfast'|'Lunch'|'Dinner';
export type HalfBoardIncludedMeal='Lunch'|'Dinner';

export const hasMealPlan=(meal?:string)=>meal==='Full Board'||meal==='Half Board';

export const maldivesDay=(value:string|Date=new Date())=>{
 const d=value instanceof Date?value:new Date(value);
 return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
};

export function restaurantMealPeriod(value:string|Date=new Date()):RestaurantMealPeriod|''{
 const d=value instanceof Date?value:new Date(value);
 if(Number.isNaN(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Indian/Maldives',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 const minutes=(Number(get('hour'))||0)*60+(Number(get('minute'))||0);
 if(minutes>=7*60&&minutes<9*60)return 'Breakfast';
 const lunchStart=get('weekday')==='Fri'?13*60+30:12*60;
 if(minutes>=lunchStart&&minutes<15*60)return 'Lunch';
 if(minutes>=18*60&&minutes<21*60)return 'Dinner';
 return '';
}

function stayFor(state:any,stayId?:string){return stayId?(state?.stays||[]).find((stay:any)=>stay.id===stayId):null;}

export function halfBoardIncludedMealPeriod(state:any,stayId?:string,now:string|Date=new Date()):HalfBoardIncludedMeal|''{
 const stay=stayFor(state,stayId);
 if(stay?.meal!=='Half Board')return '';
 const today=maldivesDay(now);
 const order=(state?.posOrders||[]).find((order:any)=>{
  if(order.stayId!==stayId||maldivesDay(order.createdAt)!==today||!Array.isArray(order.items)||!order.items.some((item:any)=>item.included===true))return false;
  const period=String(order.includedMealPeriod||order.mealPeriod||'');
  return period==='Lunch'||period==='Dinner'||period==='';
 });
 if(!order)return '';
 const period=String(order.includedMealPeriod||order.mealPeriod||'');
 return period==='Dinner'?'Dinner':'Lunch';
}

export function halfBoardMealSelection(state:any,stayId?:string,now:string|Date=new Date()):HalfBoardIncludedMeal|''{
 return halfBoardIncludedMealPeriod(state,stayId,now);
}

export function halfBoardIncludedMealUsed(state:any,stayId?:string,now:string|Date=new Date()){
 return halfBoardIncludedMealPeriod(state,stayId,now)!=='';
}

export function halfBoardFreeOrderAvailable(state:any,stayId?:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(stay?.meal!=='Half Board')return true;
 return !halfBoardIncludedMealUsed(state,stayId,now);
}

export function halfBoardMealStatus(state:any,stayId?:string,now:string|Date=new Date()){
 const includedMeal=halfBoardIncludedMealPeriod(state,stayId,now);
 const freeOrderAvailable=halfBoardFreeOrderAvailable(state,stayId,now);
 return {
  selectedMeal:includedMeal,
  includedMeal,
  freeOrderAvailable,
  locked:!freeOrderAvailable,
  period:restaurantMealPeriod(now),
  date:maldivesDay(now)
 };
}

// Kept for compatibility with older callers/data. Half Board meal choice is now automatic.
export function setHalfBoardMealSelection(state:any,stayId:string,meal:any,by:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(!stay||stay.status!=='In House')throw Error('Select a checked-in Half Board room.');
 if(stay.meal!=='Half Board')throw Error('This room is not on Half Board.');
 return halfBoardIncludedMealPeriod(state,stayId,now);
}

export const mealItemCoveredByPackage=(meal:string|undefined,item:{fullBoard?:boolean})=>
 item.fullBoard===true&&(meal==='Full Board'||meal==='Half Board');

export const mealItemIncluded=(
 meal:string|undefined,
 item:{fullBoard?:boolean},
 halfBoardAvailable=true,
 _halfBoardMeal:HalfBoardIncludedMeal|''='',
 period:RestaurantMealPeriod|''=restaurantMealPeriod()
)=>{
 if(item.fullBoard!==true)return false;
 if(meal==='Full Board')return true;
 if(meal!=='Half Board')return false;
 if(period==='Breakfast')return true;
 return halfBoardAvailable&&(period==='Lunch'||period==='Dinner');
};
