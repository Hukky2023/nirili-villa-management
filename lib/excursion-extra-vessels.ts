import {islandToday} from './guest-catalog';
import {excursionResources} from './excursion-workflow';
import {clockMinutes,inferTripEndTime,timeRangesOverlap,validClockTime} from './excursion-operations';

const prefix='excursion-schedule:';
const stateKey='hotel-stays-v1';
const text=(value:any)=>String(value||'');
const approved=(order:any)=>order?.kind==='excursion'
 && !['Pending','Declined','Cancelled'].includes(order.approvalStatus)
 && !['Cancelled','Awaiting scheduling'].includes(order.status);

/** Legacy overflow bookings were notes on a parent trip, not seat inventory.
 * Completed/past bookings are deliberately left as historical snapshots.
 */
export function needsExtraVesselTrip(order:any,date?:string){
 const day=text(order?.date||order?.schedule?.date);
 return approved(order)&&order.separateVessel===true&&!!order.scheduleId
  && !['Departed','Completed'].includes(order.status)&&day>=islandToday()
  && (!date||day===date);
}

type ScheduleRead={key:string;revision:number};
export type ExtraVesselPlan={trips:any[];scheduleReads:ScheduleRead[];scheduleDays:{pattern:string;count:number}[];movedBookings:number};

/** Prepare, but never persist, new departures. The caller must save these rows
 * in the SAME guarded batch as the booking state. This makes approval atomic:
 * no orphan trip and no advertised seats without their original passengers.
 */
export async function prepareExtraVesselTrips(db:any,state:any):Promise<ExtraVesselPlan>{
 const orders=Array.isArray(state.orders)?state.orders:[];
 const candidates=orders.filter((order:any)=>needsExtraVesselTrip(order));
 const plan:ExtraVesselPlan={trips:[],scheduleReads:[],scheduleDays:[],movedBookings:0};
 if(!candidates.length)return plan;
 const previous=await db.prepare('SELECT payload FROM operation_records WHERE key=?').bind(stateKey).first();
 const previousOrders=previous?JSON.parse(previous.payload).orders||[]:[];
 const previousById=new Map<string,any>(previousOrders.map((order:any)=>[text(order.id),order]));
 const resources=excursionResources(state);
 const days=new Map<string,any[]>();
 for(const date of new Set<string>(candidates.map((order:any)=>text(order.date||order.schedule?.date)))){
  const result=await db.prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all();
  days.set(date,(result.results||[]).map((row:any)=>({...JSON.parse(row.payload),_key:row.key,_revision:Number(row.revision)})));
 }
 const groups=new Map<string,any>();
 for(const order of candidates){
  const date=text(order.date||order.schedule?.date),schedules=days.get(date)||[];
  const parent=schedules.find((row:any)=>row.id===order.scheduleId);
  const vesselId=text(order.overflowVesselId||order.schedule?.vesselId);
  const vessel=resources.vessels.find((row:any)=>row.id===vesselId);
  const old=previousById.get(text(order.id));
  const fresh=!old||!approved(old)||old.separateVessel!==true
   ||text(old.overflowVesselId||old.schedule?.vesselId)!==vesselId||old.scheduleId!==order.scheduleId;
  // Do not let an incomplete old record block an unrelated hotel/POS save.
  // A NEW approval, however, must have a real recorded vessel capacity.
  if(!parent||!vessel){
   if(fresh)throw Error('Choose a scheduled trip and a valid extra vessel.');
   continue;
  }
  const capacity=Number(vessel.capacity);
  if(!Number.isSafeInteger(capacity)||capacity<1){
   if(fresh)throw Error('Set the passenger capacity for '+vessel.name+' in Vessels before scheduling it.');
   continue;
  }
  const time=text(order.schedule?.time||order.time||parent.time);
  const endTime=text(order.schedule?.endTime||order.endTime||parent.endTime||inferTripEndTime(parent.name,time));
  if(!validClockTime(time)||!validClockTime(endTime)||clockMinutes(endTime)<=clockMinutes(time)){
   if(fresh)throw Error('Choose a valid departure and end time for the extra vessel.');
   continue;
  }
  const privateTrip=order.privateBoatRequested===true||order.schedule?.privateBoat===true||parent.privateTrip===true;
  // One physical extra vessel at one departure is one inventory pool. Private
  // hires stay exclusive, even when legacy records contain unused capacity.
  const identity=JSON.stringify([date,parent.id,vessel.id,time,endTime,privateTrip?order.id:'shared']);
  const group=groups.get(identity)||{date,parent,vessel,capacity,time,endTime,privateTrip,orders:[],fresh:false};
  group.orders.push(order);group.fresh||=fresh;groups.set(identity,group);
 }
 const readKeys=new Set<string>(),readDays=new Set<string>();
 for(const [identity,group] of groups){
  const {date,parent,vessel,capacity,time,endTime,privateTrip}=group;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  const id='extra-'+Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,32);
  const schedules=days.get(date)||[];
  let trip=schedules.find((row:any)=>row.id===id);
  if(trip&&(!trip.extraVesselTrip||trip.parentScheduleId!==parent.id))throw Error('Extra-vessel schedule conflict. Reload and try again.');
  const assignedPax=orders.filter((order:any)=>approved(order)&&!order.separateVessel&&order.scheduleId===id&&(order.date||order.schedule?.date)===date)
   .reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quantity)||0),0);
  const addedPax=group.orders.reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quantity)||0),0);
  const tripCapacity=trip?Number(trip.capacity):capacity;
  if(group.fresh&&addedPax+assignedPax>tripCapacity)throw Error(vessel.name+' has capacity for '+tripCapacity+' guests, but this booking needs '+addedPax+'. Choose a larger vessel.');
  const conflict=schedules.find((row:any)=>row.id!==id&&row.status!=='Cancelled'&&row.vesselId===vessel.id
   &&timeRangesOverlap(time,endTime,row.time,row.endTime||inferTripEndTime(row.name,row.time)));
  if(group.fresh&&(conflict||vessel.condition!=='Available'))throw Error(vessel.name+' is not available for this departure. Choose another vessel.');
  // These cases can only be old bad data. Preserve it for staff review without
  // exposing imaginary capacity or a conflicting vessel to new bookings.
  const needsReview=!!conflict||vessel.condition!=='Available'||addedPax+assignedPax>tripCapacity;
  if(trip&&needsReview&&trip.status==='Open')continue;
  const now=new Date().toISOString();
  if(!trip){
   trip={
    id,date,time,endTime,name:parent.name,capacity,priceCents:Math.max(0,Number(parent.priceCents)||0),
    vesselId:vessel.id,crewIds:[],guideIds:[],sharedGroup:'',
    status:privateTrip||needsReview||parent.status==='Cancelled'?'Closed':'Open',
    privateTrip,extraVesselTrip:true,parentScheduleId:parent.id,origin:'extra-vessel',
    createdFromRequest:group.orders[0].id,crewReplacementNeeded:true,
    ...(parent.returnTime?{returnTime:parent.returnTime}:{}),
    ...(parent.tripCode?{tripCode:parent.tripCode}:{}),
    notes:'Extra-vessel departure. Assign this vessel its own crew before departure.'+(needsReview?' Review vessel availability or passenger capacity before reopening.':''),
    createdAt:now,updatedAt:now
   };
   plan.trips.push(trip);schedules.push(trip);
  }
  // Lock the date snapshot as well as each existing row: a vessel assigned
  // by another request between preparation and commit must force a retry.
  if(!readDays.has(date)){
   plan.scheduleDays.push({pattern:prefix+date+':%',count:schedules.filter((row:any)=>row._key).length});readDays.add(date);
  }
  for(const row of schedules.filter((row:any)=>row._key)){
   if(row._key&&!readKeys.has(row._key)){
    plan.scheduleReads.push({key:row._key,revision:row._revision});readKeys.add(row._key);
   }
  }
  for(const order of group.orders){
   // Booking ID, guest identity, room, prices, payments and notification history
   // are unchanged. Only the operational departure and seat ownership move.
   plan.movedBookings++;
   order.originalScheduleId??=parent.id;
   order.extraVesselScheduleId=trip.id;order.extraVesselTrip=true;
   order.scheduleId=trip.id;order.date=trip.date;order.time=trip.time;order.endTime=trip.endTime;
   order.separateVessel=false;order.seatRequest=false;order.unscheduledRequest=false;
   const oldSchedule=order.schedule||{};
   order.scheduleHistory=[...(order.scheduleHistory||[]),{...oldSchedule,scheduleId:parent.id,migratedAt:now}];
   const crew=resources.crew.filter((member:any)=>(trip.crewIds||[]).includes(member.id));
   const {goproId:_oldGoProId,gopro:_oldGoPro,...oldWithoutGoPro}=oldSchedule;
   order.schedule={...oldWithoutGoPro,date:trip.date,time:trip.time,endTime:trip.endTime,
    vesselId:trip.vesselId,vessel:resources.vessels.find((row:any)=>row.id===trip.vesselId)?.name||vessel.name,
    ...(trip.goproId?{goproId:trip.goproId,gopro:resources.gopros.find((row:any)=>row.id===trip.goproId)?.name||trip.goproId}:{}),
    crewIds:trip.crewIds||[],guideIds:trip.guideIds||[],crew:crew.map((member:any)=>member.name),
    extraVessel:false,extraVesselTrip:true,privateBoat:!!trip.privateTrip};
  }
 }
 return plan;
}
