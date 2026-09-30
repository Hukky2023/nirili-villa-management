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
