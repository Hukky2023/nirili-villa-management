export function transferBillItems(order:any){
 if(Array.isArray(order?.billItems)&&order.billItems.length)return order.billItems.map((item:any)=>[String(item?.[0]||''),Number(item?.[1])||1,Number(item?.[2])||0,Number(item?.[3])||0]);
 return [[String(order?.name||'Transfer charge'),Math.max(1,Number(order?.quantity)||1),Math.max(0,Number(order?.cents)||0)/100,0]];
}

export function transferBillStatus(order:any){
 if(String(order?.status||'')==='Cancelled')return 'Cancelled';
 const status=String(order?.billStatus||'');
 return ['Posted','Pending','Paid','Unpaid','Cancelled'].includes(status)?status:'Unpaid';
}

export function applyTransferBillEdit(state:any,input:{id:string;date:string;status:string;items:any[]},actor:string){
 state.orders??=[];state.stays??=[];
 const order=state.orders.find((item:any)=>item.id===input.id&&item.kind==='transfer');
 if(!order)throw Error('Transfer bill source was not found.');
 if(!['Posted','Pending','Paid','Unpaid','Cancelled'].includes(String(input.status||'')))throw Error('Choose a valid transfer payment status.');
 if(!Array.isArray(input.items)||input.items.length>100)throw Error('Check transfer bill items.');
 const items=input.items.map((item:any)=>{
  if(!Array.isArray(item)||item.length!==4)throw Error('Check transfer bill items.');
  const name=String(item[0]||'').trim(),qty=Number(item[1]),amount=Number(item[2]),discount=Number(item[3]);
  if(!name||name.length>200||!Number.isInteger(qty)||qty<1||qty>10000||!Number.isFinite(amount)||amount<0||amount>1000000||!Number.isFinite(discount)||discount<0||discount>100)throw Error('Check transfer bill items, amounts and discounts.');
  return [name,qty,amount,discount];
 });
 const total=Math.round(items.reduce((sum:number,item:any)=>sum+Math.round(item[2]*100)*(1-item[3]/100),0));
 const now=new Date().toISOString();
 order.billItems=items;
 order.cents=total;
 order.billStatus=input.status;
 order.date=String(input.date||order.date||'');
 order.updatedAt=now;
 order.updatedBy=actor;
 if(input.status==='Cancelled')order.status='Cancelled';
 const stay=state.stays.find((item:any)=>item.id===order.stayId);
 if(stay){
  stay.history??=[];
  stay.history.unshift({date:now,by:actor,detail:'Transfer bill '+order.id+' edited · USD '+(total/100).toFixed(2)+' · '+input.status});
  if(order.transportPlanBilling&&order.transportPlanLeg&&stay.transportPlan?.[order.transportPlanLeg]){
   const plan=stay.transportPlan[order.transportPlanLeg];
   plan.billing={...plan.billing,priceCents:total,cents:total,free:total===0,updatedAt:now,updatedBy:actor};
  }
 }
 return {order,stay,totalCents:total,bill:{id:order.id,department:'Transfer',date:order.date,status:transferBillStatus(order),items,total:total/100,totalCents:total}};
}
