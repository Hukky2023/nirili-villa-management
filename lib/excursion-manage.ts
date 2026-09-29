export const excursionManageHost='https://excursions.nirilihotels.com';

export function createExcursionManageToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export function validExcursionManageToken(value:unknown):value is string{
 return typeof value==='string'&&/^[a-f0-9]{48}$/i.test(value);
}

export function excursionManageUrl(token:string){
 return excursionManageHost+'/manage#'+encodeURIComponent(token);
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

export function externalPackageOrders(state:any,order:any){
 ensureExcursionManageState(state);
 if(!order?.packageGroupId)return order?[order]:[];
 return state.orders.filter((item:any)=>item?.kind==='excursion'&&item?.source==='External guest website'&&item.packageGroupId===order.packageGroupId)
  .sort((a:any,b:any)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.time||a.schedule?.time||'').localeCompare(String(b.time||b.schedule?.time||''))||String(a.id||'').localeCompare(String(b.id||'')));
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

function currentExcursionChargeCents(order:any){
 const edited=Number(order?.billingRevision)>0||!!order?.billingEditedAt;
 return Math.max(0,Number(edited?order?.cents:(order?.quotedCents??order?.cents))||0);
}
function clearCustomExcursionBilling(order:any){
 delete order.billingItems;delete order.billingStatus;delete order.billingDate;
 delete order.billingEditedAt;delete order.billingEditedBy;delete order.billingAdjustment;
 order.billingRevision=0;
}

export function excursionManageSnapshot(state:any,order:any,liveSchedule:any=null){
 const packageOrders=externalPackageOrders(state,order);
 if(packageOrders.length>1){
  const first=packageOrders[0],ids=new Set(packageOrders.map((item:any)=>item.id));
  const pending=state.excursionChanges
   .filter((change:any)=>change.status==='Pending'&&(change.packageGroupId===first.packageGroupId||ids.has(change.bookingId)))
   .sort((a:any,b:any)=>String(b.requestedAt||'').localeCompare(String(a.requestedAt||'')))[0]||null;
  const paidCents=packageOrders.reduce((sum:number,item:any)=>sum+externalExcursionPaymentCents(item),0);
  const originalQuotedCents=Math.max(0,Number(first.packageTotalCents)||packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.quotedCents)||0),0));
  const activeCents=packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.cents)||0),0);
  const hasEditedBill=packageOrders.some((item:any)=>Number(item.billingRevision)>0||!!item.billingEditedAt);
  const quotedCents=hasEditedBill?activeCents:originalQuotedCents;
  const balanceCents=Math.max(0,activeCents-paidCents);
  const cancelled=packageOrders.every((item:any)=>String(item.status||'')==='Cancelled'||['Cancelled','Declined'].includes(String(item.approvalStatus||'')));
  const completed=packageOrders.every((item:any)=>['Completed','Cancelled'].includes(String(item.status||'')));
  const hasPending=packageOrders.some((item:any)=>String(item.approvalStatus||'')==='Pending'||String(item.status||'').toLowerCase().includes('awaiting'));
  const allConfirmed=packageOrders.every((item:any)=>item.approvalStatus==='Approved'&&!['Cancelled'].includes(String(item.status||'')));
  const status=cancelled?'Cancelled':completed?'Completed':hasPending?'Pending':allConfirmed?'Confirmed':'Pending';
  const segments=packageOrders.map((item:any)=>{
   const schedule=item.schedule||{};
   const segmentPaid=externalExcursionPaymentCents(item),segmentDue=Math.max(0,Math.max(0,Number(item.cents)||0)-segmentPaid);
   return {
    id:text(item.id),name:text(item.packageSegmentName||item.name),date:text(item.date||schedule.date),time:text(item.time||schedule.time),endTime:text(item.endTime||schedule.endTime),
    status:String(item.status||''),approvalStatus:String(item.approvalStatus||''),matchedScheduleName:text(item.matchedScheduleName||schedule.name),
    vessel:text(schedule.vessel),crew:Array.isArray(schedule.crew)?schedule.crew.map(text).filter(Boolean):[],
    quotedCents:currentExcursionChargeCents(item),originalQuotedCents:Math.max(0,Number(item.quotedCents)||0),paymentStatus:segmentPaid>0&&segmentDue===0?'Paid':segmentPaid>0?'Partially paid':'Unpaid'
   };
  });
  return {
   reference:text(first.packageGroupId),excursion:text(first.packageName||'Special Package'),menuItemId:'special-package',
   guest:text(first.guest),email:text(first.email),phone:text(first.phone),hotel:text(first.hotel||first.pickupLocation),room:text(first.externalRoom||first.room),groupName:text(first.groupName),
   date:text(first.date),time:text(first.time||first.schedule?.time),endTime:text(packageOrders[packageOrders.length-1]?.endTime||packageOrders[packageOrders.length-1]?.schedule?.endTime),
   returnTime:'',status,paymentStatus:cancelled?'Cancelled':quotedCents===0?'No payment due':paidCents>0&&balanceCents===0?'Paid':paidCents>0?'Partially paid':'Unpaid',
   paidCents,balanceCents,quotedCents,originalQuotedCents,adults:Math.max(0,Number(first.adults)||0),children:Math.max(0,Number(first.children)||0),infants:Math.max(0,Number(first.infants)||0),quantity:Math.max(0,Number(first.quantity)||0),
   guestNames:Array.isArray(first.guestNames)?first.guestNames:[],guestCategories:Array.isArray(first.guestCategories)?first.guestCategories:[],footSizes:Array.isArray(first.footSizes)?first.footSizes:[],
   buggyRequested:packageOrders.some((item:any)=>item.buggyRequested===true),privateBoatRequested:false,vessel:'Multiple trips',crew:[],notes:text(first.notes),
   refundRequiredCents:packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.refundRequiredCents)||0),0),packageSegments:segments,
   pendingAction:pending?{id:pending.id,type:pending.type,status:pending.status,requestedAt:pending.requestedAt,proposed:pending.proposed||null}:null,
   canEdit:false,canCancel:!cancelled&&!completed&&!pending&&!packageOrders.some((item:any)=>['Departed','Completed'].includes(String(item.status||'')))
  };
 }
 const pending=pendingExcursionChange(state,order.id);
 const schedule=['Departed','Completed'].includes(String(order.status||''))?(order.schedule||{}):{...(order.schedule||{}),...(liveSchedule||{})};
 const paidCents=externalExcursionPaymentCents(order);
 const originalQuotedCents=Math.max(0,Number(order.quotedCents)||Number(order.cents)||0);
 const quotedCents=currentExcursionChargeCents(order);
 const dueCents=Math.max(0,Math.max(0,Number(order.cents)||0)-paidCents);
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
  time:text(schedule.time||order.time),
  endTime:text(schedule.endTime||order.endTime),
  returnTime:text(schedule.returnTime||order.returnTime),
  status,
  paymentStatus:cancelled?'Cancelled':quotedCents===0?'No payment due':paidCents>0&&dueCents===0?'Paid':paidCents>0?'Partially paid':'Unpaid',
  paidCents,
  balanceCents:dueCents,
  quotedCents,
  originalQuotedCents,
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
  clearCustomExcursionBilling(order);
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
 }else if(!(Number(order.billingRevision)>0||order.billingEditedAt)){
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


export function approveExternalExcursionPackageCancellation(state:any,order:any,change:any,by:string){
 const packageOrders=externalPackageOrders(state,order);
 if(packageOrders.length<2||!change||change.type!=='cancel'||change.status!=='Pending')throw Error('This package cancellation request is not available.');
 const refundRequiredCents=packageOrders.reduce((sum:number,item:any)=>sum+externalExcursionPaymentCents(item),0);
 const now=new Date().toISOString();
 change.status='Approved';change.decidedAt=now;change.decidedBy=by;change.refundRequiredCents=refundRequiredCents;
 for(const item of packageOrders){
  item.refundRequiredCents=externalExcursionPaymentCents(item);item.status='Cancelled';item.approvalStatus='Cancelled';item.cents=0;item.cancelledAt=now;item.cancelledBy=by;item.unscheduledRequest=false;item.seatRequest=false;item.guestNotified=false;
 }
 return {orders:packageOrders,change,refundRequiredCents};
}
