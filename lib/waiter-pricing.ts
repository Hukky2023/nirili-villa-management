import {mealItemIncluded} from './meal-access';
export function waiterLine(item:any,quantity:number,meal?:string,expectedIncluded?:boolean,halfBoardAvailable=true){
 const included=mealItemIncluded(meal,item,halfBoardAvailable);
 if(expectedIncluded!==undefined&&expectedIncluded!==included)throw Error('The room meal plan or included menu changed. Refresh and review the order.');
 return {id:item.id,name:item.category+' · '+item.name+(included?' (meal plan included)':''),quantity,unitCents:included?0:item.cents,cents:included?0:item.cents*quantity,included,menuCents:item.cents};
}
