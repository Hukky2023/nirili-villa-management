import {nextBookingReference} from './booking-reference';
import {plans,validDate} from './guest-catalog';
import {normalizeTransportPlan} from './transport-plan';
import {assertBookingDatesOpen} from './booking-closures';

export function createDirectBooking(state:any,b:any,by:string,options:{allowClosedDates?:boolean}={}){
 if(typeof b.requestId!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.requestId))throw Error('Invalid booking request. Reopen the form.');
 const existing=state.stays.find((s:any)=>s.creationRequest===b.requestId&&s.createdBy===by);
 if(existing)return existing;
 if(typeof b.guest!=='string'||!b.guest.trim()||b.guest.trim().length>100)throw Error('Enter a guest name of up to 100 characters.');
 if(!validDate(b.checkIn)||!validDate(b.checkOut)||b.checkOut<=b.checkIn)throw Error('Choose a checkout date after check-in.');
 if(!options.allowClosedDates)assertBookingDatesOpen(state,b.checkIn,b.checkOut,b.room);
 const nights=(Date.parse(b.checkOut)-Date.parse(b.checkIn))/86400000;
 if(nights>365)throw Error('Bookings can be up to 365 nights.');
 if(!Number.isInteger(b.pax)||b.pax<1||b.pax>3||!plans.includes(b.meal))throw Error('Choose a valid guest count and meal plan.');
 if(!['Direct','Walk-in','Booking.com','Agoda','Travel agent','Guest portal','Guest booking website'].includes(b.source))throw Error('Choose a valid booking source.');
 if(!Number.isInteger(b.rateCents)||b.rateCents<0||b.rateCents>1000000)throw Error('Enter a nightly rate between $0 and $10,000.');
 const room=state.rooms.find((r:any)=>r.number===b.room);
 if(!room||room.status==='Maintenance'||b.pax>room.capacity||state.stays.some((s:any)=>s.room===b.room&&s.status!=='Checked Out'&&s.checkIn<b.checkOut&&s.checkOut>b.checkIn))throw Error('That room is unavailable for these dates or guest count. Choose another room.');
 const id=nextBookingReference(state);
 const transportPlan=normalizeTransportPlan(b.transportPlan,b.checkIn,b.checkOut);
 const stay={id,creationRequest:b.requestId,createdBy:by,guest:b.guest.trim(),room:b.room,billRoom:id,checkIn:b.checkIn,checkOut:b.checkOut,pax:b.pax,adults:b.adults??b.pax,children:b.children??0,meal:b.meal,source:b.source,transportPlan,rateCents:b.rateCents,status:'Confirmed',legacyFolio:false,base:nights*b.rateCents,initialPaid:0,payments:[],extensions:[],history:[{date:new Date().toISOString(),by,detail:'Booking confirmed · Room '+b.room+' assigned · '+nights+(nights===1?' night':' nights')}]};
 state.stays.push(stay);
 return stay;
}
