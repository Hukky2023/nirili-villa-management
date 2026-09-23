export type TransportNeed='yes'|'no'|'later';
export type TransportLeg='arrival'|'departure';

const needValues=new Set<TransportNeed>(['yes','no','later']);
const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const clean=(value:any,max=120)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);

export function defaultTransportPlan(checkIn:string,checkOut:string){
 return {
  arrival:{
   needTransfer:'later' as TransportNeed,
   from:'Velana International Airport',
   date:checkIn,
   flightNumber:'',
   flightTime:'',
   ownTransport:'',
   dhiffushiArrivalTime:'',
   buggyRequired:true,
   status:'Details required'
  },
  departure:{
   needTransfer:'later' as TransportNeed,
   destination:'Velana International Airport',
   date:checkOut,
   flightNumber:'',
   flightTime:'',
   ownDepartureTime:'',
   buggyRequired:true,
   status:'Details required'
  }
 };
}

function need(value:any):TransportNeed{return needValues.has(value)?value:'later';}
function date(value:any,fallback:string){const text=String(value||'');return datePattern.test(text)?text:fallback;}
function time(value:any){const text=String(value||'');return timePattern.test(text)?text:'';}

export function normalizeTransportPlan(value:any,checkIn:string,checkOut:string){
 const fallback=defaultTransportPlan(checkIn,checkOut),input=value&&typeof value==='object'?value:{};
 const arrivalInput=input.arrival&&typeof input.arrival==='object'?input.arrival:{};
 const departureInput=input.departure&&typeof input.departure==='object'?input.departure:{};
 const arrivalNeed=need(arrivalInput.needTransfer),departureNeed=need(departureInput.needTransfer);
 const arrival={
  needTransfer:arrivalNeed,
  from:clean(arrivalInput.from||fallback.arrival.from,120),
  date:date(arrivalInput.date,checkIn),
  flightNumber:clean(arrivalInput.flightNumber,40),
  flightTime:time(arrivalInput.flightTime),
  ownTransport:clean(arrivalInput.ownTransport,100),
  dhiffushiArrivalTime:time(arrivalInput.dhiffushiArrivalTime),
  buggyRequired:arrivalInput.buggyRequired!==false,
  status:arrivalNeed==='later'?'Details required':arrivalNeed==='yes'?'Awaiting launch scheduling':'Own transport'
 };
 const departure={
  needTransfer:departureNeed,
  destination:clean(departureInput.destination||fallback.departure.destination,120),
  date:date(departureInput.date,checkOut),
  flightNumber:clean(departureInput.flightNumber,40),
  flightTime:time(departureInput.flightTime),
  ownDepartureTime:time(departureInput.ownDepartureTime),
  buggyRequired:departureInput.buggyRequired!==false,
  status:departureNeed==='later'?'Details required':departureNeed==='yes'?'Awaiting launch scheduling':'Own transport'
 };
 return {arrival,departure};
}

export function mergeTransportPlanInternal(current:any,next:any){
 const result={arrival:{...(next?.arrival||{})},departure:{...(next?.departure||{})}};
 for(const leg of ['arrival','departure'] as TransportLeg[]){
  const before=current?.[leg]||{},after=result[leg]||{};
  if(before.billing&&!after.billing)after.billing={...before.billing};
  const sameNeed=before.needTransfer===after.needTransfer;
  const sameDate=before.date===after.date;
  const sameRoute=leg==='arrival'
   ?String(before.from||'')===String(after.from||'')
   :String(before.destination||'')===String(after.destination||'');
  const sameTiming=String(before.flightTime||'')===String(after.flightTime||'')&&String(leg==='arrival'?before.dhiffushiArrivalTime||'':before.ownDepartureTime||'')===String(leg==='arrival'?after.dhiffushiArrivalTime||'':after.ownDepartureTime||'');
  if(sameNeed&&sameDate&&sameRoute&&sameTiming&&before.launch&&before.transportBookingId){
   after.launch=before.launch;
   after.transportBookingId=before.transportBookingId;
   after.status=before.status||'Scheduled';
  }else if(before.transportBookingId||before.launch){
   if(after.needTransfer==='yes'){
    after.needsReview=true;
    after.previousTransportBookingId=before.transportBookingId||'';
    after.status='Needs transport review';
   }else{
    after.cancelTransportBookingId=before.transportBookingId||'';
    after.status=after.needTransfer==='no'?'Own transport':'Details required';
   }
  }
 }
 return result;
}

export function minutes(value:string){
 if(!timePattern.test(value))return null;
 const [hours,mins]=value.split(':').map(Number);
 return hours*60+mins;
}

export function minusMinutes(value:string,amount:number){
 const total=minutes(value);
 if(total==null)return '';
 const adjusted=(total-amount+1440)%1440;
 return String(Math.floor(adjusted/60)).padStart(2,'0')+':'+String(adjusted%60).padStart(2,'0');
}

function buggyId(stayId:string,leg:TransportLeg){return 'TPBUG-'+stayId+'-'+leg;}

export function syncTransportBuggy(state:any,stay:any,leg:TransportLeg,journey?:any){
 state.buggyBookings??=[];
 const plan=stay?.transportPlan?.[leg];
 if(!plan)return null;
 const id=buggyId(String(stay.id),leg);
 const existing=state.buggyBookings.find((item:any)=>item.id===id);
 const knownOwnTime=leg==='arrival'?String(plan.dhiffushiArrivalTime||''):String(plan.ownDepartureTime||'');
 const pickupTime=journey
  ?leg==='arrival'?String(journey.arrive||''):minusMinutes(String(journey.depart||''),15)
  :plan.needTransfer==='no'
   ?leg==='arrival'?knownOwnTime:minusMinutes(knownOwnTime,15)
   :'';
 const rideDate=String(journey?.date||plan.date||(leg==='arrival'?stay.checkIn:stay.checkOut)||'');
 const wanted=plan.buggyRequired!==false&&!!pickupTime&&!!rideDate;
 if(!wanted){
  if(existing&&!['Completed','Cancelled'].includes(String(existing.buggyStatus||''))){
   existing.cancelled=true;existing.cancelledAt=new Date().toISOString();existing.cancelledBy='transport-plan-sync';existing.buggyStatus='Cancelled';
  }
  return null;
 }
 const now=new Date().toISOString();
 const item={
  id,
  token:id,
  bookingType:'stay-transfer',
  transportLeg:leg,
  stayId:stay.id,
  guest:stay.guest||'Guest',
  phone:stay.whatsapp||'',
  room:stay.room||'',
  date:rideDate,
  pickupTime,
  location:leg==='arrival'?'Dhiffushi Harbour':'Nirili Villa',
  destination:leg==='arrival'?'Nirili Villa':'Dhiffushi Harbour',
  quantity:Math.max(1,Number(stay.pax)||1),
  excursion:leg==='arrival'?'Arrival buggy · linked guest transport':'Departure buggy · linked guest transport',
  notes:leg==='arrival'?'Created from room arrival transport plan':'Created from room departure transport plan',
  buggyStatus:'Scheduled',
  chargeToRoom:false,
  fareCents:0,
  cancelled:false,
  updatedAt:now,
  updatedBy:'transport-plan-sync'
 };
 if(existing){
  const assignment={buggyId:existing.buggyId,buggyDriver:existing.buggyDriver,buggyAssignedAt:existing.buggyAssignedAt,buggyAssignedBy:existing.buggyAssignedBy};
  Object.assign(existing,item,assignment);
  delete existing.cancelledAt;delete existing.cancelledBy;
  return existing;
 }
 const created={...item,createdAt:now,createdBy:'transport-plan-sync'};
 state.buggyBookings.push(created);
 return created;
}

export function transportPlanNeedsAttention(plan:any){
 return !plan||['later'].includes(String(plan.arrival?.needTransfer||''))||['later'].includes(String(plan.departure?.needTransfer||''))||!!plan.arrival?.needsReview||!!plan.departure?.needsReview;
}
