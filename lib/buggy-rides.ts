// On-demand buggy rides share one live dispatch flow (Requested → Assigned → Driver on the way →
// Arrived → On trip → Completed):
// - 'guest-ride': an in-house guest from the guest portal; the fare goes on their room bill.
// - 'public-ride': anyone on ride.nirilihotels.com; no room, the fare is paid to the driver.
export const PUBLIC_RIDE='public-ride';

export function isOnDemandRide(item:any){
 const type=String(item?.bookingType||'');
 return type==='guest-ride'||type===PUBLIC_RIDE;
}

export function isPublicRide(item:any){
 return String(item?.bookingType||'')===PUBLIC_RIDE;
}

export function activeOnDemandRide(item:any){
 return isOnDemandRide(item)&&item.cancelled!==true&&!['Completed','Cancelled'].includes(String(item.buggyStatus||''));
}

// Automatic dispatch only uses Nirili's own buggies. Buggies registered by independent owners
// (ownerId) take a ride only when their owner accepts it in the operator portal.
export function houseBuggyFor(state:any,quantity:number){
 return (state?.buggyFleet||[]).find((x:any)=>!x.ownerId&&x.status==='Available'&&Math.max(1,Number(x.capacity)||4)>=quantity);
}

// A pay-the-driver ride request (public site or partner guest house). It joins the shared ride
// queue: Nirili's own free buggy takes it automatically, otherwise it waits for an owner to accept.
export function addPublicRide(state:any,input:{token:string;name:string;phone:string;location:string;destination:string;quantity:number;notes:string;date:string;pickupTime:string;fareCents:number;createdBy:string;extra?:Record<string,any>}){
 state.buggyBookings??=[];state.buggyFleet??=[];state.buggyTripHistory??=[];
 const now=new Date().toISOString(),rideKey=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 const ride:any={id:'BUG-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),token:input.token,rideKey,bookingType:PUBLIC_RIDE,guest:input.name,phone:input.phone,room:'',date:input.date,pickupTime:input.pickupTime,location:input.location,destination:input.destination,quantity:input.quantity,notes:input.notes,chargeToRoom:false,fareCents:input.fareCents,buggyStatus:'Requested',createdAt:now,createdBy:input.createdBy,...(input.extra||{})};
 const buggy=houseBuggyFor(state,input.quantity);
 if(buggy){
  Object.assign(ride,{buggyId:buggy.id,buggyDriver:buggy.driver||'',buggyAssignedAt:now,buggyAssignedBy:'auto-dispatch',buggyStatus:'Assigned'});
  Object.assign(buggy,{status:'Assigned',updatedAt:now,updatedBy:'auto-dispatch'});
  state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Auto assigned',buggyId:buggy.id,buggyName:buggy.name,bookingId:ride.id,guest:input.name,driver:ride.buggyDriver,by:input.createdBy});
 }
 state.buggyBookings.push(ride);
 state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Requested',buggyId:ride.buggyId||'',buggyName:buggy?.name||'',bookingId:ride.id,guest:input.name,driver:ride.buggyDriver||'',by:input.createdBy});
 return ride;
}
