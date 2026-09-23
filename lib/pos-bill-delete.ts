function mealPlanIncludedOrder(order:any){const items=Array.isArray(order?.items)?order.items:[];return Math.max(0,Number(order?.cents)||0)===0&&items.length>0&&items.every((item:any)=>item?.included===true);}
export function deletePOSBill(state:any,o:any,by:string){
 const stay=state.stays.find((s:any)=>s.id===o.stayId),key='Restaurant:'+o.id;
 if(o.stayId&&!stay)throw Error('Linked room is missing. Ask Admin to review this bill.');
 if(['Cash','Card'].includes(o.method)||stay?.paidBills?.[key]===o.cents||(stay?.payments||[]).some((p:any)=>p.reference===o.id&&p.cents>0&&!p.reversedAt))throw Error('Reverse the payment before deleting this paid bill.');
 if(stay?.status==='Checked Out')throw Error('Check the guest back in before deleting this room bill.');
 if(stay&&!mealPlanIncludedOrder(o)&&!stay.posBills?.some((b:any)=>b.id===o.id))throw Error('Linked room bill is missing. Please refresh.');
 const date=new Date().toISOString();
 state.deletedPOSOrders??=[];state.deletedPOSOrders.push({...o,deletedAt:date,deletedBy:by});
 state.posOrders=state.posOrders.filter((b:any)=>b.id!==o.id);
 if(stay){stay.posBills=stay.posBills.filter((b:any)=>b.id!==o.id);delete stay.paidBills?.[key];stay.history??=[];stay.history.unshift({date,by,detail:'Restaurant bill '+o.id+' deleted · $'+(o.cents/100).toFixed(2)});}
}
