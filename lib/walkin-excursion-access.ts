export type WalkInExcursionProfile={
 accountId:string;
 username:string;
 name:string;
 phone:string;
 hotel:string;
 room:string;
 active:boolean;
 createdAt:string;
 expiresAt:string;
 endedAt?:string;
};

export function walkInExcursionProfiles(state:any):WalkInExcursionProfile[]{
 state.walkinExcursionAccounts??=[];
 return state.walkinExcursionAccounts;
}

export function walkInExcursionProfile(state:any,accountId:string):WalkInExcursionProfile|undefined{
 return walkInExcursionProfiles(state).find((item:any)=>item.accountId===accountId);
}

export function walkInExcursionPaidCents(order:any):number{
 const total=Math.max(0,Number(order?.cents)||0);
 const paid=(order?.excursionPayments||[]).reduce((sum:number,p:any)=>sum+Math.max(0,Number(p?.cents)||0),0);
 return Math.min(total,paid);
}

export function walkInExcursionOrderPaid(order:any):boolean{
 const total=Math.max(0,Number(order?.cents)||0);
 return total===0||walkInExcursionPaidCents(order)>=total;
}

export function walkInExcursionBill(state:any,accountId:string){
 const orders=(state.orders||[]).filter((order:any)=>order.kind==='excursion'&&order.accountId===accountId&&order.status!=='Cancelled'&&order.approvalStatus!=='Cancelled'&&order.approvalStatus!=='Declined');
 const totalCents=orders.reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.cents)||0),0);
 const paidCents=orders.reduce((sum:number,order:any)=>sum+walkInExcursionPaidCents(order),0);
 return {
  totalCents,
  paidCents,
  balanceCents:Math.max(0,totalCents-paidCents),
  orders:orders.map((order:any)=>({
   id:order.id,
   name:order.name,
   quantity:Number(order.quantity)||0,
   cents:Math.max(0,Number(order.cents)||0),
   date:order.date||'',
   time:order.time||order.schedule?.time||'',
   status:order.approvalStatus==='Pending'?'Pending':order.approvalStatus==='Approved'&&order.status==='Scheduled'?'Confirmed':order.status||'Booked',
   paymentStatus:walkInExcursionOrderPaid(order)?'Paid':'Unpaid',
   createdAt:order.createdAt||''
  }))
 };
}

export function syncWalkInExcursionAccess(state:any):string[]{
 const revoke:string[]=[];
 const profiles=walkInExcursionProfiles(state);
 for(const profile of profiles){
  if(!profile.active)continue;
  const orders=(state.orders||[]).filter((order:any)=>order.kind==='excursion'&&order.accountId===profile.accountId&&order.status!=='Cancelled'&&order.approvalStatus!=='Cancelled'&&order.approvalStatus!=='Declined');
  if(!orders.length)continue;
  const finished=orders.every((order:any)=>order.status==='Completed'&&walkInExcursionOrderPaid(order));
  if(!finished)continue;
  profile.active=false;
  profile.endedAt=new Date().toISOString();
  revoke.push(profile.accountId);
 }
 return revoke;
}
