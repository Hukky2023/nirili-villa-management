import {validDate} from './guest-catalog';

export type BookingClosure={
 id:string;
 start:string;
 endExclusive:string;
 reason:string;
 createdAt:string;
 createdBy:string;
};

function addDays(date:string,days:number){
 return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}

function validClosure(row:any):row is BookingClosure{
 return !!row&&typeof row.id==='string'&&validDate(String(row.start||''))&&validDate(String(row.endExclusive||''))&&row.endExclusive>row.start;
}

export function bookingClosures(state:any):BookingClosure[]{
 return (Array.isArray(state?.bookingClosures)?state.bookingClosures:[]).filter(validClosure);
}

export function bookingClosureForStay(state:any,checkIn:string,checkOut:string){
 if(!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn)return null;
 return bookingClosures(state).find(closure=>closure.start<checkOut&&closure.endExclusive>checkIn)||null;
}

export function isBookingDateClosed(state:any,date:string){
 return validDate(date)&&bookingClosures(state).some(closure=>closure.start<=date&&closure.endExclusive>date);
}

export function assertBookingDatesOpen(state:any,checkIn:string,checkOut:string){
 const closure=bookingClosureForStay(state,checkIn,checkOut);
 if(closure)throw Error('Bookings are closed for one or more selected dates. Choose different dates.');
 return true;
}

export function closeBookingDates(state:any,input:{from:string;through:string;reason?:string;by:string}){
 const from=String(input.from||''),through=String(input.through||'');
 if(!validDate(from)||!validDate(through)||through<from)throw Error('Choose a valid closed date range.');
 const endExclusive=addDays(through,1);
 const nights=(Date.parse(endExclusive)-Date.parse(from))/86400000;
 if(!Number.isInteger(nights)||nights<1||nights>730)throw Error('Closed date ranges can be up to 730 nights.');
 state.bookingClosures??=[];
 if(bookingClosures(state).some(closure=>closure.start<endExclusive&&closure.endExclusive>from))throw Error('Part of this date range is already closed. Reopen the existing range first or choose different dates.');
 const closure:BookingClosure={
  id:'CLOSE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
  start:from,
  endExclusive,
  reason:String(input.reason||'').trim().replace(/\s+/g,' ').slice(0,200),
  createdAt:new Date().toISOString(),
  createdBy:String(input.by||'Admin')
 };
 state.bookingClosures.push(closure);
 state.bookingClosures.sort((a:any,b:any)=>String(a.start||'').localeCompare(String(b.start||'')));
 return closure;
}

export function reopenBookingDates(state:any,id:string){
 state.bookingClosures??=[];
 const index=state.bookingClosures.findIndex((closure:any)=>closure?.id===id);
 if(index<0)throw Error('Closed date range not found or already reopened.');
 return state.bookingClosures.splice(index,1)[0];
}

export function bookingClosureThrough(closure:BookingClosure){
 return addDays(closure.endExclusive,-1);
}
