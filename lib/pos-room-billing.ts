export function mealPlanIncludedOrder(order:any){
 const items=Array.isArray(order?.items)?order.items:[];
 return Math.max(0,Number(order?.cents)||0)===0&&items.length>0&&items.every((item:any)=>item?.included===true);
}

export function restaurantRoomBillItems(items:any[]){
 return (Array.isArray(items)?items:[])
  .filter((item:any)=>Math.max(0,Number(item?.cents)||0)>0)
  .map((item:any)=>[
   String(item?.name||'Restaurant item'),
   Math.max(1,Number(item?.quantity)||1),
   Math.max(0,Number(item?.unitCents)||0)/100,
   Math.max(0,Math.min(100,Number(item?.discount)||0))
  ]);
}

export function syncRestaurantRoomBill(stay:any,order:any){
 if(!stay||!order?.id)return false;
 stay.posBills=Array.isArray(stay.posBills)?stay.posBills:[];
 stay.posBills=stay.posBills.filter((bill:any)=>String(bill?.id||'')!==String(order.id));
 if(mealPlanIncludedOrder(order))return false;

 const paidAtPOS=['Cash','Card','Bank transfer'].includes(String(order.method||''));
 const items=restaurantRoomBillItems(order.items);
 stay.posBills.push({
  department:'Restaurant',
  id:String(order.id),
  items,
  status:order.complimentary?'Complimentary':paidAtPOS?'Paid':'Posted',
  totalCents:Math.max(0,Number(order.cents)||0),
  complimentary:order.complimentary===true,
  settledAtPOS:paidAtPOS
 });
 return true;
}

export function restaurantPaymentStatus(order:any,stay:any){
 if(mealPlanIncludedOrder(order))return 'Meal plan included';
 if(order?.complimentary)return 'Complimentary';
 if(['Cash','Card','Bank transfer'].includes(String(order?.method||'')))return 'Paid';
 if(stay?.paidBills?.['Restaurant:'+order?.id]===order?.cents)return 'Paid';
 if(order?.method==='Room')return 'Charged to room';
 return 'Unpaid';
}
