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

export function halfBoardMealSelection(state:any,stayId?:string,now:string|Date=new Date()):HalfBoardIncludedMeal|''{
 const stay=stayFor(state,stayId);
 if(stay?.meal!=='Half Board')return '';
 const selected=stay?.halfBoardMealSelections?.[maldivesDay(now)];
 return selected==='Lunch'||selected==='Dinner'?selected:'';
}

export function halfBoardIncludedMealUsed(state:any,stayId?:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(stay?.meal!=='Half Board')return false;
 const today=maldivesDay(now);
 return (state?.posOrders||[]).some((order:any)=>{
  if(order.stayId!==stayId||maldivesDay(order.createdAt)!==today||!Array.isArray(order.items)||!order.items.some((item:any)=>item.included===true))return false;
  const period=String(order.includedMealPeriod||order.mealPeriod||'');
  // Old Half Board orders did not store a meal period. Treat them as the daily
  // lunch/dinner entitlement so migration cannot accidentally grant a second free meal.
  return period!=='Breakfast';
 });
}

export function halfBoardFreeOrderAvailable(state:any,stayId?:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(stay?.meal!=='Half Board')return true;
 return !halfBoardIncludedMealUsed(state,stayId,now);
}

export function halfBoardMealStatus(state:any,stayId?:string,now:string|Date=new Date()){
 const selectedMeal=halfBoardMealSelection(state,stayId,now);
 const freeOrderAvailable=halfBoardFreeOrderAvailable(state,stayId,now);
 return {
  selectedMeal,
  freeOrderAvailable,
  locked:!freeOrderAvailable,
  period:restaurantMealPeriod(now),
  date:maldivesDay(now)
 };
}

export function setHalfBoardMealSelection(state:any,stayId:string,meal:any,by:string,now:string|Date=new Date()){
 const stay=stayFor(state,stayId);
 if(!stay||stay.status!=='In House')throw Error('Select a checked-in Half Board room.');
 if(stay.meal!=='Half Board')throw Error('This room is not on Half Board.');
 if(meal!=='Lunch'&&meal!=='Dinner')throw Error('Choose Lunch or Dinner for today’s included Half Board meal.');
 const date=maldivesDay(now),current=halfBoardMealSelection(state,stayId,now);
 if(halfBoardIncludedMealUsed(state,stayId,now)&&current!==meal)throw Error('Today’s included Half Board meal has already been used and the selection is locked.');
 stay.halfBoardMealSelections??={};
 stay.halfBoardMealSelections[date]=meal;
 stay.history??=[];
 if(current!==meal){const at=now instanceof Date?now:new Date(now);stay.history.unshift({date:at.toISOString(),by,detail:'Half Board included meal selected for '+date+': '+meal});}
 return meal as HalfBoardIncludedMeal;
}

export const mealItemCoveredByPackage=(meal:string|undefined,item:{fullBoard?:boolean})=>
 item.fullBoard===true&&(meal==='Full Board'||meal==='Half Board');

export const mealItemIncluded=(
 meal:string|undefined,
 item:{fullBoard?:boolean},
 halfBoardAvailable=true,
 halfBoardMeal:HalfBoardIncludedMeal|''='',
 period:RestaurantMealPeriod|''=restaurantMealPeriod()
)=>{
 if(item.fullBoard!==true)return false;
 if(meal==='Full Board')return true;
 if(meal!=='Half Board')return false;
 if(period==='Breakfast')return true;
 return halfBoardAvailable&&(period==='Lunch'||period==='Dinner')&&halfBoardMeal===period;
};
