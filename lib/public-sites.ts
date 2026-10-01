// Single source of truth for the public Nirili hostnames. Every guest-facing link and the
// host routing in proxy.ts read from here, so a service only ever has one address.
export const HOSTS={
 main:'nirilihotels.com',
 www:'www.nirilihotels.com',
 stay:'stay.nirilihotels.com',
 tours:'tours.nirilihotels.com',
 dine:'dine.nirilihotels.com',
 transfers:'transfers.nirilihotels.com',
 ride:'ride.nirilihotels.com',
 watersports:'watersports.nirilihotels.com',
 // Partner guest houses send excursion bookings through the Agent Portal.
 agents:'agents.nirilihotels.com',
 // Speedboat operators and buggy owners run Nirili Travels trips from the operator portal.
 operators:'operators.nirilihotels.com',
 my:'my.nirilihotels.com',
 // Retired public address. Old links, emails and printed QR codes are forwarded from here.
 booking:'booking.nirilihotels.com',
} as const;

// Friendly alternative names that forward to a service's real address.
export const ALIAS_HOSTS:Record<string,string>={
 'excursions.nirilihotels.com':'tours',
 'restaurant.nirilihotels.com':'dine',
 'travels.nirilihotels.com':'main',
};

const origin=(host:string)=>'https://'+host;

export const SITES={
 main:origin(HOSTS.main),
 stay:origin(HOSTS.stay),
 tours:origin(HOSTS.tours),
 dine:origin(HOSTS.dine),
 transfers:origin(HOSTS.transfers),
 ride:origin(HOSTS.ride),
 watersports:origin(HOSTS.watersports),
 agents:origin(HOSTS.agents),
 operators:origin(HOSTS.operators),
 my:origin(HOSTS.my),
} as const;

// The in-house guest portal accepts sign-ins on its own host and, for guests who are already
// signed in or have push notifications set up there, on the retired booking host.
export function guestPortalHost(host:string){
 const h=host.split(':')[0].toLowerCase();
 return h===HOSTS.my||h===HOSTS.booking||h==='localhost'||h==='127.0.0.1';
}
