export type WalkInExcursionProfile={
 accountId:string;
 username:string;
 name:string;
 phone:string;
 hotel:string;
 room:string;
 active:boolean;
 createdAt:string;
 departureDate:string;
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
 const excursionOrders=(state.orders||[]).filter((order:any)=>order.kind==='excursion'&&order.accountId===accountId&&order.status!=='Cancelled'&&order.approvalStatus!=='Cancelled'&&order.approvalStatus!=='Declined');
 const restaurantOrders=(state.posOrders||[]).filter((order:any)=>order.guestKey==='guest:'+accountId);
 const excursionRows=excursionOrders.map((order:any)=>({
  id:order.id,department:'Excursion',name:order.name,quantity:Number(order.quantity)||0,cents:Math.max(0,Number(order.cents)||0),
  date:order.date||'',time:order.time||order.schedule?.time||'',
  status:order.approvalStatus==='Pending'?'Pending':order.approvalStatus==='Approved'&&order.status==='Scheduled'?'Confirmed':order.status||'Booked',
  paymentStatus:walkInExcursionOrderPaid(order)?'Paid':'Unpaid',createdAt:order.createdAt||''
 }));
 const restaurantRows=restaurantOrders.map((order:any)=>({
  id:order.id,department:'Restaurant',name:'Restaurant · Table '+String(order.table||''),quantity:1,cents:Math.max(0,Number(order.cents)||0),
  date:String(order.createdAt||'').slice(0,10),time:String(order.createdAt||'').slice(11,16),status:order.kitchen||'Ordered',
  paymentStatus:['Cash','Card'].includes(order.method)?'Paid':'Pay at cashier',createdAt:order.createdAt||''
 }));
 const orders=[...excursionRows,...restaurantRows].sort((a:any,b:any)=>String(a.createdAt).localeCompare(String(b.createdAt)));
 const totalCents=orders.reduce((sum:number,order:any)=>sum+order.cents,0);
 const paidCents=orders.reduce((sum:number,order:any)=>sum+(order.paymentStatus==='Paid'?order.cents:0),0);
 return {totalCents,paidCents,balanceCents:Math.max(0,totalCents-paidCents),orders};
}

function maldivesToday(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
export function syncWalkInExcursionAccess(state:any):string[]{
 const revoke:string[]=[],today=maldivesToday();
 for(const profile of walkInExcursionProfiles(state)){
  if(!profile.active)continue;
  if(profile.departureDate&&today>profile.departureDate){
   profile.active=false;profile.endedAt=new Date().toISOString();revoke.push(profile.accountId);
  }
 }
 return revoke;
}
