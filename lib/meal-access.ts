export const hasMealPlan=(meal?:string)=>meal==='Full Board'||meal==='Half Board';
export const mealItemIncluded=(meal:string|undefined,item:{fullBoard?:boolean})=>hasMealPlan(meal)&&item.fullBoard===true;
