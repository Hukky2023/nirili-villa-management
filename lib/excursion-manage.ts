export const excursionManageHost='https://booking.nirilihotels.com';

export function createExcursionManageToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export function validExcursionManageToken(value:unknown):value is string{
 return typeof value==='string'&&/^[a-f0-9]{48}$/i.test(value);
}

export function excursionManageUrl(token:string){
 return excursionManageHost+'/book/excursions/manage#'+encodeURIComponent(token);
}

export function ensureExcursionManageState(state:any){
 state.orders??=[];
 state.excursionChanges??=[];
 return state;
}

export function externalExcursionForToken(state:any,token:string){
 ensureExcursionManageState(state);
 return state.orders.find((order:any)=>order?.kind==='excursion'&&order?.source==='External guest website'&&order?.manageToken===token)||null;
}

export function pendingExcursionChange(state:any,bookingId:string){
 ensureExcursionManageState(state);
 return state.excursionChanges
  .filter((change:any)=>change.bookingId===bookingId&&change.status==='Pending')
  .sort((a:any,b:any)=>String(b.requestedAt||'').localeCompare(String(a.requestedAt||'')))[0]||null;
}

export function externalExcursionPaymentCents(order:any){
 return Math.max(0,(order?.excursionPayments||[]).reduce((sum:number,payment:any)=>sum+(Number(payment?.cents)||0),0));
}

function text(value:any){return String(value??'').trim();}

export function excursionManageSnapshot(state:any,order:any,liveSchedule:any=null){
 const pending=pendingExcursionChange(state,order.id);
 const schedule=liveSchedule||order.schedule||{};
 const paidCents=externalExcursionPaymentCents(order);
 const dueCents=Math.max(0,Number(order.cents||order.quotedCents||0)-paidCents);
 const closed=['Completed','Departed','Cancelled'].includes(String(order.status||''));
 const cancelled=String(order.status||'')==='Cancelled'||String(order.approvalStatus||'')==='Cancelled'||String(order.approvalStatus||'')==='Declined';
 const awaiting=String(order.approvalStatus||'')==='Pending'||String(order.status||'').toLowerCase().includes('awaiting');
 const status=cancelled?'Cancelled':String(order.status||'')==='Completed'?'Completed':String(order.status||'')==='Departed'?'Departed':awaiting?'Pending':(order.scheduleId||order.schedule||order.time)?'Confirmed':'Pending';
 return {
  reference:text(order.id),
  excursion:text(order.name),
  menuItemId:text(order.menuItemId),
  guest:text(order.guest),
  email:text(order.email),
  phone:text(order.phone),
  hotel:text(order.hotel||order.pickupLocation),
  room:text(order.externalRoom||order.room),
  groupName:text(order.groupName),
  date:text(order.date||schedule.date),
  time:text(order.time||schedule.time),
  endTime:text(order.endTime||schedule.endTime),
  returnTime:text(order.returnTime||schedule.returnTime),
  status,
  paymentStatus:cancelled?'Cancelled':paidCents>0&&dueCents===0?'Paid':paidCents>0?'Partially paid':'Unpaid',
  paidCents,
  balanceCents:dueCents,
  quotedCents:Math.max(0,Number(order.quotedCents)||Number(order.cents)||0),
  adults:Math.max(0,Number(order.adults)||0),
  children:Math.max(0,Number(order.children)||0),
  infants:Math.max(0,Number(order.infants)||0),
  quantity:Math.max(0,Number(order.quantity)||0),
  guestNames:Array.isArray(order.guestNames)?order.guestNames:[],
  guestCategories:Array.isArray(order.guestCategories)?order.guestCategories:[],
  footSizes:Array.isArray(order.footSizes)?order.footSizes:[],
  buggyRequested:order.buggyRequested===true,
  privateBoatRequested:order.privateBoatRequested===true,
  vessel:text(schedule.vessel),
  crew:Array.isArray(schedule.crew)?schedule.crew.map(text).filter(Boolean):[],
  notes:text(order.notes),
  refundRequiredCents:Math.max(0,Number(order.refundRequiredCents)||0),
  pendingAction:pending?{id:pending.id,type:pending.type,status:pending.status,requestedAt:pending.requestedAt,proposed:pending.proposed||null}:null,
  canEdit:!closed&&!cancelled&&!pending,
  canCancel:!closed&&!cancelled&&!pending
 };
}

export function excursionLogisticsChanged(order:any,proposed:any){
 return String(order.menuItemId||'')!==String(proposed.menuItemId||'')
  ||String(order.date||'')!==String(proposed.date||'')
  ||Number(order.quantity||0)!==Number(proposed.quantity||0)
  ||!!order.privateBoatRequested!==!!proposed.privateBoatRequested;
}


export function approveExternalExcursionChange(order:any,change:any,by:string){
 if(!order||!change||change.type!=='change'||change.status!=='Pending')throw Error('This excursion change request is not available.');
 const proposed=change.proposed||{};
 const logisticsChanged=excursionLogisticsChanged(order,proposed);
 Object.assign(order,proposed,{updatedAt:new Date().toISOString(),updatedBy:by});
 if(logisticsChanged){
  order.cents=0;
  order.status='Awaiting scheduling';
  order.approvalStatus='Pending';
  order.unscheduledRequest=true;
  order.seatRequest=false;
  order.autoConfirmed=false;
  order.guestNotified=false;
  delete order.scheduleId;delete order.schedule;delete order.time;delete order.endTime;delete order.returnTime;
  delete order.separateVessel;delete order.overflowVesselId;delete order.originalScheduleId;delete order.extraVesselTrip;
  delete order.preferredTime;delete order.preferredEndTime;delete order.preferredScheduleId;delete order.matchedScheduleName;
  delete order.serviceType;delete order.serviceRequest;delete order.dinnerTime;delete order.buggyRoundTrip;
 }else{
  order.cents=Math.max(0,Number(order.quotedCents)||0);
 }
 change.status='Approved';change.decidedAt=new Date().toISOString();change.decidedBy=by;change.logisticsChanged=logisticsChanged;
 return {order,change,logisticsChanged};
}

export function approveExternalExcursionCancellation(order:any,change:any,by:string){
 if(!order||!change||change.type!=='cancel'||change.status!=='Pending')throw Error('This excursion cancellation request is not available.');
 const refundRequiredCents=externalExcursionPaymentCents(order);
 change.status='Approved';change.decidedAt=new Date().toISOString();change.decidedBy=by;change.refundRequiredCents=refundRequiredCents;
 order.refundRequiredCents=refundRequiredCents;order.status='Cancelled';order.approvalStatus='Cancelled';order.cents=0;order.cancelledAt=new Date().toISOString();order.cancelledBy=by;order.unscheduledRequest=false;order.seatRequest=false;order.guestNotified=false;
 return {order,change,refundRequiredCents};
}

export function rejectExternalExcursionAction(change:any,by:string,note=''){
 if(!change||change.status!=='Pending')throw Error('This excursion request is not available.');
 change.status='Rejected';change.decidedAt=new Date().toISOString();change.decidedBy=by;change.decisionNote=String(note||'').trim().slice(0,500);
 return change;
}
