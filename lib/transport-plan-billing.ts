export function transportPlanBaseCents(sailing:any,stay:any){
 const fare=Number(sailing?.roomFare);
 if(!Number.isInteger(fare)||fare<0)throw Error('Set the USD room fare for this launch before assigning it to a room transport plan.');
 const adults=Math.max(1,Number(stay?.adults??stay?.pax??1)),children=Math.max(0,Number(stay?.children??0));
 return fare*adults+Math.round(fare/2)*children;
}

export function transportPlanChargeCents(baseCents:number,billing:any){
 const safeBase=Math.max(0,Math.round(Number(baseCents)||0));
 if(billing?.free===true)return 0;
 if(Number.isInteger(billing?.priceCents)&&billing.priceCents>=0)return Math.max(0,Number(billing.priceCents));
 const discount=Math.max(0,Math.min(100,Number(billing?.discountPercent)||0));
 return Math.max(0,Math.round(safeBase*(1-discount/100)));
}

export function syncTransportPlanBill(hotelState:any,stay:any,booking:any,sailing:any,leg:'arrival'|'departure',actor:string){
 hotelState.orders??=[];
 const plan=stay?.transportPlan?.[leg];if(!plan)throw Error('Guest transport plan not found.');
 const baseCents=transportPlanBaseCents(sailing,stay),cents=stay.packageIncludeTransfer===true?0:transportPlanChargeCents(baseCents,plan.billing);
 const journey=booking?.journeys?.[0];if(!journey)throw Error('Transport journey not found.');
 const now=new Date().toISOString();
 const name=(leg==='arrival'?'Arrival':'Departure')+' transfer · '+journey.from+' → '+journey.to+' · '+journey.date+' '+journey.depart+' · '+journey.boat;
 const next:any={
  id:booking.id,
  token:booking.token,
  stayId:stay.id,
  guest:stay.guest,
  room:stay.room,
  kind:'transfer',
  name:name+(stay.packageIncludeTransfer?' · Included in package':''),
  includedInStayPackage:stay.packageIncludeTransfer===true,
  quantity:1,
  cents,
  baseCents,
  discountPercent:Math.max(0,Math.min(100,Number(plan.billing?.discountPercent)||0)),
  free:plan.billing?.free===true,
  manualPrice:Number.isInteger(plan.billing?.priceCents),
  notes:'Linked room transport plan · '+leg,
  date:journey.date,
  time:journey.depart,
  status:'Confirmed',
  transportBooking:true,
  transportPlanBilling:true,
  transportPlanLeg:leg,
  createdAt:booking.created||now,
  updatedAt:now,
  updatedBy:actor
 };
 const existing=hotelState.orders.find((item:any)=>item.id===booking.id&&item.kind==='transfer');
 if(existing)Object.assign(existing,next);else hotelState.orders.push(next);
 booking.roomCents=cents;if(stay.packageIncludeTransfer)booking.total=0;
 booking.roomBaseCents=baseCents;
 booking.roomDiscountPercent=next.discountPercent;
 booking.roomFree=next.free;
 plan.billing={...plan.billing,baseCents,cents,updatedAt:now,updatedBy:actor};
 return {order:existing||next,baseCents,cents};
}

export function cancelTransportPlanBills(hotelState:any,ids:string[],actor:string){
 const wanted=new Set(ids.map(String).filter(Boolean));if(!wanted.size)return 0;
 let changed=0;
 for(const order of hotelState.orders||[]){
  if(order.kind!=='transfer'||!wanted.has(String(order.id||''))||order.status==='Cancelled')continue;
  order.status='Cancelled';order.cents=0;order.cancelledAt=new Date().toISOString();order.cancelledBy=actor;changed++;
 }
 return changed;
}

