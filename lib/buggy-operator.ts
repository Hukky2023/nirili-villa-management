import {activeOnDemandRide,isOnDemandRide} from './buggy-rides';

// Independent buggy owners in Nirili Travels. Owners register their buggies, go online, and
// accept ride requests from ride.nirilihotels.com, the in-house guest portal and partner guest
// houses. The first online owner to accept gets the ride (the hotel state is saved with a
// compare-and-swap, so two owners cannot both win). After accepting, the owner drives the same
// live ride flow as Nirili's own drivers: on the way → arrived → on trip → completed.
// Guests pay the owner for public rides; in-house guests' rides go on the room bill and Nirili
// pays the owner, both less Nirili's commission.
type Owner={id:string;name:string};
const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const OWNER_STATUSES=['Available','Out of Service'];

export function ownerBuggies(state:any,ownerId:string){return (state.buggyFleet||[]).filter((b:any)=>b.ownerId===ownerId);}

export function saveOwnerBuggy(state:any,owner:Owner,input:any){
 state.buggyFleet??=[];
 const name=text(input?.name,80),capacity=Number(input?.capacity),driver=text(input?.driver,100),driverPhone=text(input?.driverPhone,30).replace(/[\s()-]/g,'');
 const status=OWNER_STATUSES.includes(input?.status)?input.status:'Available';
 if(!name)throw Error('Enter the buggy name or number plate.');
 if(!Number.isInteger(capacity)||capacity<1||capacity>20)throw Error('Enter the number of passenger seats (1–20).');
 if(driverPhone&&!/^\+[1-9]\d{7,14}$/.test(driverPhone))throw Error('Enter the driver WhatsApp number with country code.');
 const now=new Date().toISOString(),id=text(input?.id,100);
 if(id){
  const buggy=state.buggyFleet.find((b:any)=>b.id===id&&b.ownerId===owner.id);
  if(!buggy)throw Error('Buggy not found.');
  if(buggy.status==='Assigned'&&status!=='Available')throw Error('Finish the current ride before taking this buggy out of service.');
  Object.assign(buggy,{name,capacity,driver,driverPhone,...(buggy.status==='Assigned'?{}:{status}),updatedAt:now,updatedBy:'operator:'+owner.id});
  return buggy;
 }
 const buggy={id:'buggy-'+crypto.randomUUID(),name,capacity,driver,driverPhone,status,ownerId:owner.id,ownerName:owner.name,createdAt:now,updatedAt:now,updatedBy:'operator:'+owner.id};
 state.buggyFleet.push(buggy);
 return buggy;
}

// Waiting requests anyone online may take: today's on-demand rides with no buggy yet.
export function openRideRequests(state:any,today:string){
 return (state.buggyBookings||[]).filter((r:any)=>activeOnDemandRide(r)&&!r.buggyId&&String(r.date||today)===today)
  .sort((a:any,b:any)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
}
export function ownerRides(state:any,ownerId:string){
 return (state.buggyBookings||[]).filter((r:any)=>isOnDemandRide(r)&&r.operatorId===ownerId)
  .sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

function history(state:any,ride:any,type:string,by:string){
 state.buggyTripHistory??=[];
 const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===ride.buggyId);
 state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:new Date().toISOString(),type,buggyId:ride.buggyId||'',buggyName:buggy?.name||'',bookingId:ride.id,guest:ride.guest||'',driver:ride.buggyDriver||buggy?.driver||'',by});
}
function release(state:any,ride:any){
 if(!ride?.buggyId)return;
 const busy=(state.buggyBookings||[]).some((x:any)=>x.id!==ride.id&&x.buggyId===ride.buggyId&&activeOnDemandRide(x));
 const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===ride.buggyId);
 if(!busy&&buggy&&buggy.status==='Assigned'){buggy.status='Available';buggy.updatedAt=new Date().toISOString();}
}

export function acceptRide(state:any,owner:Owner&{buggyOnline?:boolean},rideId:string,buggyId:string){
 if(!owner.buggyOnline)throw Error('Go online to accept rides.');
 const ride=(state.buggyBookings||[]).find((r:any)=>r.id===rideId);
 if(!ride||!activeOnDemandRide(ride))throw Error('This ride is no longer waiting.');
 if(ride.buggyId)throw Error('Another driver has already taken this ride.');
 const buggy=(state.buggyFleet||[]).find((b:any)=>b.id===buggyId&&b.ownerId===owner.id);
 if(!buggy)throw Error('Choose one of your buggies.');
 if(buggy.status!=='Available')throw Error(buggy.name+' is not available right now.');
 if(Math.max(1,Number(ride.quantity)||1)>Math.max(1,Number(buggy.capacity)||4))throw Error(buggy.name+' does not have enough seats for this ride.');
 const now=new Date().toISOString(),by='operator:'+owner.id;
 Object.assign(ride,{buggyId:buggy.id,buggyDriver:buggy.driver||owner.name,buggyAssignedAt:now,buggyAssignedBy:owner.name,buggyStatus:'Assigned',operatorId:owner.id,operatorName:owner.name});
 Object.assign(buggy,{status:'Assigned',updatedAt:now,updatedBy:by});
 history(state,ride,'Accepted by owner',owner.name);
 return {ride,buggy};
}

export const RIDE_ACTIONS=['on-the-way','arrived','boarded','complete','release'] as const;
export type RideAction=typeof RIDE_ACTIONS[number];

export function advanceRide(state:any,owner:Owner,rideId:string,action:RideAction){
 const ride=(state.buggyBookings||[]).find((r:any)=>r.id===rideId&&r.operatorId===owner.id);
 if(!ride||!isOnDemandRide(ride))throw Error('Ride not found.');
 if(!activeOnDemandRide(ride))throw Error('This ride is already finished.');
 const now=new Date().toISOString(),status=String(ride.buggyStatus||'');
 if(action==='release'){
  // Hand the ride back to the queue before pickup, e.g. a breakdown.
  if(!['Assigned','Driver on the way'].includes(status))throw Error('You can only hand back a ride before the guest is picked up.');
  history(state,ride,'Handed back by owner',owner.name);
  release(state,ride);
  for(const k of ['buggyId','buggyDriver','buggyAssignedAt','buggyAssignedBy','operatorId','operatorName','buggyPickupStartedAt'])delete ride[k];
  ride.buggyStatus='Requested';
  return {ride,event:''};
 }
 if(action==='on-the-way'){
  if(!['Assigned','Driver on the way'].includes(status))throw Error('This ride is not ready to start pickup.');
  ride.buggyPickupStartedAt=ride.buggyPickupStartedAt||now;ride.buggyStatus='Driver on the way';
  history(state,ride,'Driver on the way',owner.name);return {ride,event:'on-the-way'};
 }
 if(action==='arrived'){
  if(status!=='Driver on the way')throw Error('Start the pickup before marking that you arrived.');
  ride.buggyArrivedAt=now;ride.buggyArrivedBy=owner.name;ride.buggyStatus='Arrived';ride.buggyGuestNotifiedAt=now;
  history(state,ride,'Arrived',owner.name);return {ride,event:'arrived'};
 }
 if(action==='boarded'){
  if(status!=='Arrived')throw Error('Mark that you arrived before the guest boards.');
  ride.buggyBoardedAt=now;ride.buggyBoardedBy=owner.name;ride.buggyStatus='On trip';
  history(state,ride,'On trip',owner.name);return {ride,event:'started'};
 }
 if(status!=='On trip')throw Error('Mark the guest on board before completing the ride.');
 ride.buggyCompletedAt=now;ride.buggyCompletedBy=owner.name;ride.buggyStatus='Completed';
 release(state,ride);history(state,ride,'Completed',owner.name);
 return {ride,event:'completed'};
}

// Monthly statement for a buggy owner. Public rides: the owner collects the fare and owes
// commission. In-house guest rides: Nirili collects on the room bill and owes the owner.
export function buggyStatement(state:any,owner:{id:string;commissionPercent:number},month:string){
 const rate=Math.max(0,Number(owner.commissionPercent)||0)/100;
 const rows=ownerRides(state,owner.id).filter((r:any)=>r.buggyStatus==='Completed'&&String(r.date||'').startsWith(month)).map((r:any)=>{
  const fare=Math.max(0,Number(r.fareCents)||0),roomBilled=r.bookingType==='guest-ride';
  return {id:r.id,date:r.date,time:r.pickupTime||'',route:String(r.location||'')+' → '+String(r.destination||''),guest:r.guest||'',fareCents:fare,roomBilled,commissionCents:Math.round(fare*rate)};
 });
 const total=(f:(r:any)=>number)=>rows.reduce((n:number,r:any)=>n+f(r),0);
 const collectedByOwner=total(r=>r.roomBilled?0:r.fareCents),collectedByNirili=total(r=>r.roomBilled?r.fareCents:0);
 const commissionOwed=total(r=>r.roomBilled?0:r.commissionCents),commissionOnRoom=total(r=>r.roomBilled?r.commissionCents:0);
 return {month,rate:rate*100,rows,rides:rows.length,collectedByOwner,commissionOwed,collectedByNirili,payableToOwner:collectedByNirili-commissionOnRoom};
}
