import {validDate} from './guest-catalog';

export type BookingClosure={
 id:string;
 start:string;
 endExclusive:string;
 reason:string;
 rooms?:string[];
 createdAt:string;
 createdBy:string;
};

function addDays(date:string,days:number){
 return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}

function cleanRooms(value:any){
 if(!Array.isArray(value))return [];
 return Array.from(new Set(value.map((room:any)=>String(room||'').trim()).filter(Boolean))).slice(0,200);
}

function validClosure(row:any):row is BookingClosure{
 return !!row&&typeof row.id==='string'&&validDate(String(row.start||''))&&validDate(String(row.endExclusive||''))&&row.endExclusive>row.start;
}

export function bookingClosures(state:any):BookingClosure[]{
 return (Array.isArray(state?.bookingClosures)?state.bookingClosures:[]).filter(validClosure).map((closure:any)=>({...closure,rooms:cleanRooms(closure.rooms)}));
}

export function closureAppliesToRoom(closure:BookingClosure,roomNumber?:string){
 const rooms=cleanRooms(closure.rooms);
 return rooms.length===0||((!!roomNumber)&&rooms.includes(String(roomNumber)));
}

export function bookingClosureForStay(state:any,checkIn:string,checkOut:string,roomNumber?:string){
 if(!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn)return null;
 return bookingClosures(state).find(closure=>closure.start<checkOut&&closure.endExclusive>checkIn&&closureAppliesToRoom(closure,roomNumber))||null;
}

export function isBookingDateClosed(state:any,date:string,roomNumber?:string){
 return validDate(date)&&bookingClosures(state).some(closure=>closure.start<=date&&closure.endExclusive>date&&closureAppliesToRoom(closure,roomNumber));
}

export function assertBookingDatesOpen(state:any,checkIn:string,checkOut:string,roomNumber?:string){
 const closure=bookingClosureForStay(state,checkIn,checkOut,roomNumber);
 if(closure)throw Error(roomNumber?'Room '+roomNumber+' is closed for one or more selected dates. Choose another room or different dates.':'Bookings are closed for one or more selected dates. Choose different dates.');
 return true;
}

export function closeBookingDates(state:any,input:{from:string;through:string;reason?:string;by:string;rooms?:string[]}){
 const from=String(input.from||''),through=String(input.through||'');
 if(!validDate(from)||!validDate(through)||through<from)throw Error('Choose a valid closed date range.');
 const endExclusive=addDays(through,1);
 const nights=(Date.parse(endExclusive)-Date.parse(from))/86400000;
 if(!Number.isInteger(nights)||nights<1||nights>730)throw Error('Closed date ranges can be up to 730 nights.');
 state.bookingClosures??=[];
 const availableRoomNumbers=new Set((state.rooms||[]).map((room:any)=>String(room.number||'')));
 const requested=cleanRooms(input.rooms);
 if(requested.some(room=>!availableRoomNumbers.has(room)))throw Error('One or more selected rooms no longer exist. Refresh and try again.');
 const rooms=requested.length&&requested.length<availableRoomNumbers.size?requested:[];

 const overlaps=bookingClosures(state).some(closure=>{
  if(!(closure.start<endExclusive&&closure.endExclusive>from))return false;
  const existing=cleanRooms(closure.rooms);
  if(existing.length===0||rooms.length===0)return true;
  return existing.some(room=>rooms.includes(room));
 });
 if(overlaps)throw Error('One or more selected rooms are already closed for part of this date range. Reopen the existing closure first or choose different dates/rooms.');

 const closure:BookingClosure={
  id:'CLOSE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
  start:from,endExclusive,rooms,
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
