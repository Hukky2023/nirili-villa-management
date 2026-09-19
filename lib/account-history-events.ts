/** Account timelines are administrative records. Match immutable account/stay IDs,
 * never a room number, display name or a reused guest username. */
export type AccountHistoryEntry = {at:string;action:string;by?:string;detail?:string};
const list=(value:any):any[]=>Array.isArray(value)?value:[];
export function mergeAccountHistory(entries:AccountHistoryEntry[]):AccountHistoryEntry[]{
 const seen=new Set<string>();
 return entries.filter(event=>{
  if(!event||typeof event.at!=='string'||typeof event.action!=='string')return false;
  const key=JSON.stringify([event.at,event.action,event.detail||'',event.by||'']);
  if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>b.at.localeCompare(a.at));
}
export function accountStays(accountId:string,state:any):any[]{
 const stays=[...list(state.stays),...list(state.deletedBookings).map(row=>row.stay).filter(Boolean)];
 const seen=new Set<string>();
 return stays.filter(stay=>{
  if(stay.accountId!==accountId&&stay.loginTerminatedAccountId!==accountId)return false;
  if(seen.has(stay.id))return false;seen.add(stay.id);return true;
 });
}
export function historyFor(user:any,state:any,stays:any[]=accountStays(user.id,state),walkIn:any=list(state.walkinExcursionAccounts).find(row=>row.accountId===user.id),audit:AccountHistoryEntry[]=[],snapshotAt?:string):AccountHistoryEntry[]{
 const events:AccountHistoryEntry[]=[...audit];
 const add=(at:any,action:string,detail='',by='')=>{if(at)events.push({at:String(at),action,detail:String(detail||''),by:String(by||'')});};
 const money=(cents:any)=>Number.isFinite(Number(cents))?'$'+(Number(cents)/100).toFixed(2):'';
 if(walkIn){
  add(walkIn.createdAt,'Temporary walk-in login created',(walkIn.hotel||'')+(walkIn.room?' · Room '+walkIn.room:''));
  add(walkIn.endedAt,'Temporary walk-in login ended','Access expired or was terminated.');
 }
 for(const stay of stays){
  const label='Room '+stay.room+' · '+stay.id;
  add(stay.createdAt,'Booking created',label,stay.createdBy);
  add(stay.loginIssuedAt,'In-house login issued',label);
  add(stay.checkedInAt,'Checked in',label);
  add(stay.checkedOutAt,'Checked out',label);
  for(const h of list(stay.history))add(h.date,h.detail||'Stay updated',label,h.by);
  for(const payment of list(stay.payments))add(payment.date,'Stay payment recorded',label+' · '+money(payment.cents)+' · '+(payment.method||''),payment.by);
  // This is the time the record was preserved, not an invented booking date.
  if(snapshotAt)add(snapshotAt,'Stay record preserved',label+' · '+(stay.guest||'')+' · '+(stay.checkIn||'')+' to '+(stay.checkOut||'')+' · '+(stay.meal||'')+' · '+(stay.status||''));
 }
 const stayIds=new Set(stays.map(stay=>stay.id));
 const deleted=list(state.deletedBookings);
 for(const row of deleted)if(stayIds.has(row.stay?.id))add(row.deletedAt,'Booking deleted; history retained','Room '+row.stay.room+' · '+row.stay.id,row.deletedBy);
 const orders=[...list(state.orders),...deleted.flatMap(row=>list(row.orders))];
 for(const order of orders){
  const label=(order.name||order.id)+' · '+(order.status||'');
  if(user.role==='guest'&&(order.accountId===user.id||stayIds.has(order.stayId))){
   const kind=order.kind==='excursion'?'Excursion':order.kind==='transfer'?'Transfer':'Service';
   add(order.createdAt,kind+' created',label,order.createdBy);
   add(order.reviewedAt,kind+' reviewed',(order.name||order.id)+' · '+(order.approvalStatus||order.status||''),order.reviewedBy);
   add(order.cancelledAt,kind+' cancelled',(order.name||order.id)+(order.cancellationReason?' · '+order.cancellationReason:''),order.cancelledBy);
   for(const h of list(order.history))add(h.date||h.at,kind+' updated',h.detail||label,h.by);
   for(const payment of list(order.excursionPayments))add(payment.date||payment.at||payment.createdAt,'Excursion payment recorded',(order.name||order.id)+' · '+money(payment.cents)+' · '+(payment.method||''),payment.by);
   if(snapshotAt)add(snapshotAt,kind+' record preserved',order.id+' · '+label+' · '+money(order.cents));
  }else if(user.role==='staff'){
   const actors=[order.createdBy,order.updatedBy,order.reviewedBy,order.cancelledBy,order.by].filter(Boolean);
   if(actors.includes(user.username))add(order.reviewedAt||order.cancelledAt||order.updatedAt||order.createdAt,'Operational update',label,user.username);
  }
 }
 const posOrders=[...list(state.posOrders),...deleted.flatMap(row=>list(row.posOrders))];
 for(const order of posOrders){
  const owns=user.role==='guest'&&(order.guestKey==='guest:'+user.id||order.accountId===user.id||stayIds.has(order.stayId));
  const label=order.id+' · Table '+(order.table||'')+' · '+(order.kitchen||'');
  if(owns){
   add(order.createdAt,'Restaurant order created',label,order.createdBy);
   for(const h of list(order.history))add(h.date||h.at,'Restaurant update',h.detail||label,h.by);
   if(snapshotAt)add(snapshotAt,'Restaurant record preserved',label+' · '+money(order.cents)+' · '+(order.method||''));
  }
  for(const h of list(order.history))if(user.role==='staff'&&h.by===user.username)add(h.date||h.at,'Restaurant update',h.detail||order.id,user.username);
 }
 return mergeAccountHistory(events);
}
