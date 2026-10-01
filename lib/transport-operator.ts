import {addHistory,boatSeats,journeyLive,layoutSeats,runsOn,tripBoat,tripSeats,weekday,type Boat,type Journey,type Sailing,type SeatLayout,type TransferBooking,type TransportState} from './transport';

// What a speedboat operator can do in its portal. Every function checks that the boat,
// departure or ticket belongs to the calling operator, so one operator can never see or change
// another's work. All functions change the state in place; the caller saves it with a
// compare-and-swap so two devices cannot overwrite each other.
//
// As on ODI and RTL, a boat is assigned to a trip, not to a ticket: each departure runs on one of
// the operator's boats (swappable for a single day), guests pick seats on that boat's seat map,
// and tickets are confirmed at booking. The operator boards guests and closes the trip.
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const pax=(b:TransferBooking)=>b.adults+b.children+b.infants;
export const ticketPax=pax;
const departs=(j:{date:string;depart:string})=>Date.parse(j.date+'T'+j.depart+':00+05:00');

type OperatorRef={id:string;name:string};
export const MAX_ROWS=30,MAX_COLS=12;

// ---- Seat maps
export function cleanLayout(input:any):SeatLayout{
 const rows=Number(input?.rows),cols=Number(input?.cols),cells=Array.isArray(input?.cells)?input.cells.map((n:any)=>Number(n)||0):[];
 if(!Number.isInteger(rows)||rows<1||rows>MAX_ROWS||!Number.isInteger(cols)||cols<1||cols>MAX_COLS)throw Error('A seat map can have 1–'+MAX_ROWS+' rows and 1–'+MAX_COLS+' columns.');
 if(cells.length!==rows*cols)throw Error('The seat map is incomplete. Please redraw it.');
 if(cells.some((n:number)=>!Number.isInteger(n)||n<0||n>999))throw Error('Seat numbers must be between 1 and 999.');
 const seats=cells.filter((n:number)=>n>0);
 if(!seats.length)throw Error('Add at least one seat to the seat map.');
 const dup=seats.find((n:number,i:number)=>seats.indexOf(n)!==i);
 if(dup)throw Error('Seat '+dup+' appears twice. Every seat needs its own number.');
 return {rows,cols,cells};
}

// Seats already sold on future trips that run on this boat (normally or as a one-day swap).
function soldOnBoat(state:TransportState,boatId:string){
 const sold:{sailing:Sailing;date:string;seats:number[]}[]=[];
 for(const sailing of state.sailings){
  const dates=new Set(state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===sailing.id&&departs(j)>Date.now()).map(j=>j.date)));
  for(const date of dates){
   if(tripBoat(state,sailing,date)?.id!==boatId)continue;
   sold.push({sailing,date,seats:soldSeats(state,sailing.id,date)});
  }
 }
 return sold;
}
const soldSeats=(state:TransportState,scheduleId:string,date:string)=>state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===scheduleId&&j.date===date).flatMap(j=>j.seats));
function missingSeats(seats:number[],available:number[]){const set=new Set(available);return seats.filter(n=>!set.has(n)).sort((a,b)=>a-b);}

// ---- Fleet
export function operatorBoats(state:TransportState,operatorId:string){return (state.boats||[]).filter(b=>b.operatorId===operatorId);}
export function saveBoat(state:TransportState,operator:OperatorRef,input:any):Boat{
 state.boats??=[];
 const name=text(input?.name,80),registration=text(input?.registration,40),layout=cleanLayout(input?.layout);
 if(!name)throw Error('Enter the boat name.');
 const now=new Date().toISOString(),id=text(input?.id,60),capacity=layoutSeats(layout).length;
 if(id){
  const boat=state.boats.find(b=>b.id===id&&b.operatorId===operator.id);
  if(!boat)throw Error('Boat not found.');
  // Redrawing the map cannot remove a seat someone has already booked.
  for(const trip of soldOnBoat(state,boat.id)){
   const lost=missingSeats(trip.seats,layoutSeats(layout));
   if(lost.length)throw Error('Seat '+lost.join(', ')+' is booked on the '+trip.sailing.depart+' trip on '+trip.date+'. Keep those seats in the map.');
  }
  if(input?.active===false&&soldOnBoat(state,boat.id).length)throw Error(boat.name+' has upcoming bookings. Move its trips to another boat before taking it out of service.');
  Object.assign(boat,{name,registration,layout,capacity,active:input?.active!==false,updatedAt:now});
  for(const s of state.sailings)if(s.boatId===boat.id)s.capacity=capacity;
  return boat;
 }
 const boat:Boat={id:'BOAT-'+crypto.randomUUID().slice(0,8).toUpperCase(),operatorId:operator.id,name,registration,capacity,layout,active:input?.active!==false,createdAt:now,updatedAt:now};
 state.boats.push(boat);
 return boat;
}

// ---- Departures
export function operatorSailings(state:TransportState,operatorId:string){return state.sailings.filter(s=>s.operatorId===operatorId);}
const sameDays=(a?:number[],b?:number[])=>JSON.stringify(a||[])===JSON.stringify(b||[]);
const daysOverlap=(a?:number[],b?:number[])=>!a?.length||!b?.length||a.some(d=>b.includes(d));
const timesOverlap=(a:{depart:string;arrive:string},b:{depart:string;arrive:string})=>minutes(a.depart)<minutes(b.arrive)&&minutes(b.depart)<minutes(a.arrive);
function ownBoat(state:TransportState,operatorId:string,boatId:string){
 const boat=(state.boats||[]).find(b=>b.id===boatId&&b.operatorId===operatorId);
 if(!boat)throw Error('Choose one of your boats.');
 if(!boat.active)throw Error(boat.name+' is out of service.');
 return boat;
}

export function saveOperatorSailing(state:TransportState,operator:OperatorRef,input:any):Sailing{
 const from=text(input?.from,60),to=text(input?.to,60),depart=String(input?.depart||''),arrive=String(input?.arrive||'');
 const fare=Number(input?.fare),roomFare=input?.roomFare===''||input?.roomFare==null?undefined:Number(input.roomFare);
 const days=Array.isArray(input?.days)?[...new Set(input.days.map(Number))].filter((d:any)=>Number.isInteger(d)&&d>=0&&d<=6).sort() as number[]:[];
 if(!from||!to||from===to)throw Error('Choose where the boat leaves from and where it goes.');
 if(!TIME.test(depart)||!TIME.test(arrive)||arrive<=depart)throw Error('Enter same-day departure and arrival times (24-hour), arrival after departure.');
 if(!Number.isInteger(fare)||fare<0||fare>10000000)throw Error('Enter the adult fare in MVR.');
 if(roomFare!==undefined&&(!Number.isInteger(roomFare)||roomFare<0||roomFare>10000000))throw Error('Enter a valid USD fare for Nirili Villa guests, or leave it empty.');
 const id=text(input?.id,80),previous=id?state.sailings.find(s=>s.id===id&&s.operatorId===operator.id):undefined;
 if(id&&!previous)throw Error('Departure not found.');
 const boat=ownBoat(state,operator.id,text(input?.boatId,60));
 const next:Sailing={id:previous?.id||'OPS-'+crypto.randomUUID().slice(0,8).toUpperCase(),boat:operator.name,operatorId:operator.id,operatorName:operator.name,from,to,depart,arrive,
  capacity:boatSeats(boat).length,fare,...(roomFare!==undefined?{roomFare}:{}),days:days.length===7?[]:days,active:input?.active!==false,boatId:boat.id,
  ...(previous?.boatOverrides?{boatOverrides:previous.boatOverrides}:{})};
 // A boat cannot run two departures at the same time on the same day.
 const clash=state.sailings.find(s=>s.id!==next.id&&s.active&&next.active&&s.boatId===boat.id&&daysOverlap(s.days,next.days)&&timesOverlap(s,next));
 if(clash)throw Error(boat.name+' already runs the '+clash.depart+' '+clash.from+' → '+clash.to+' departure at that time.');
 if(previous){
  const futureDates=[...new Set(state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===previous.id&&departs(j)>Date.now()).map(j=>j.date)))];
  if(futureDates.length){
   const changed=(['from','to','depart','arrive','fare','roomFare'] as const).some(k=>previous[k]!==next[k])||!sameDays(previous.days,next.days);
   if(changed)throw Error('This departure has upcoming bookings. Create a new departure for a new time, route, fare or days, and take this one off sale once its passengers have travelled.');
   // A new regular boat must have every seat already sold on trips that don't have a one-day swap.
   for(const date of futureDates){
    if(previous.boatOverrides?.[date])continue;
    const lost=missingSeats(soldSeats(state,previous.id,date),boatSeats(boat));
    if(lost.length)throw Error(boat.name+' has no seat '+lost.join(', ')+', which is booked on '+date+'. Choose a boat with those seats or swap the boat for other days only.');
   }
  }
 }
 state.sailings=previous?state.sailings.map(s=>s.id===previous.id?next:s):[...state.sailings,next];
 return next;
}

// Run one trip (a departure on one date) on another boat, e.g. when the usual boat breaks down.
export function setTripBoat(state:TransportState,operator:OperatorRef,scheduleId:string,date:string,boatId:string,by:string){
 const sailing=state.sailings.find(s=>s.id===scheduleId&&s.operatorId===operator.id);
 if(!sailing)throw Error('Departure not found.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||departs({date,depart:sailing.depart})<=Date.now())throw Error('Choose a trip that has not left yet.');
 const boat=ownBoat(state,operator.id,boatId);
 const lost=missingSeats(soldSeats(state,sailing.id,date),boatSeats(boat));
 if(lost.length)throw Error(boat.name+' has no seat '+lost.join(', ')+', which is already booked on this trip.');
 const busy=state.sailings.find(s=>s.id!==sailing.id&&s.active&&(s.boatOverrides?.[date]||s.boatId)===boat.id&&runsOn(s,date)&&timesOverlap(s,sailing));
 if(busy)throw Error(boat.name+' is already on the '+busy.depart+' trip that day.');
 const overrides={...(sailing.boatOverrides||{})};
 if(boat.id===sailing.boatId)delete overrides[date];else overrides[date]=boat.id;
 // Drop swaps for trips that have gone.
 for(const d of Object.keys(overrides))if(departs({date:d,depart:sailing.depart})<Date.now())delete overrides[d];
 sailing.boatOverrides=overrides;
 for(const b of state.bookings)for(const j of b.journeys)if(j.scheduleId===sailing.id&&j.date===date&&journeyLive(b,j)){j.boatId=boat.id;j.boatName=boat.name;addHistory(b,by,'Boat changed',boat.name);}
 return boat;
}

// ---- Tickets
export type Ticket={bookingId:string;index:number;booking:TransferBooking;journey:Journey};
export function operatorTickets(state:TransportState,operatorId:string,filter:(t:Ticket)=>boolean=()=>true):Ticket[]{
 const out:Ticket[]=[];
 for(const booking of state.bookings)booking.journeys.forEach((journey,index)=>{
  if(journey.operatorId===operatorId&&booking.status!=='Cancelled'){const t={bookingId:booking.id,index,booking,journey};if(filter(t))out.push(t);}
 });
 return out.sort((a,b)=>(a.journey.date+a.journey.depart).localeCompare(b.journey.date+b.journey.depart)||a.booking.created.localeCompare(b.booking.created));
}
function ticketFor(state:TransportState,operatorId:string,bookingId:string,index:number):Ticket{
 const booking=state.bookings.find(b=>b.id===bookingId),journey=booking?.journeys[Number(index)];
 if(!booking||!journey||journey.operatorId!==operatorId||booking.status==='Cancelled')throw Error('Ticket not found.');
 return {bookingId,index:Number(index),booking,journey};
}

// Cancel a ticket (for example when the guest asks the operator to cancel, or the trip cannot
// run). The seats go back on sale and Nirili is told; only before anyone on it has boarded.
export function declineTicket(state:TransportState,operatorId:string,bookingId:string,index:number,reason:string,by:string,kind:'decline'|'cancel'='cancel'){
 const {booking,journey}=ticketFor(state,operatorId,bookingId,index);
 if(journey.departedAt||journey.boardedPax)throw Error('Passengers on this ticket have already boarded.');
 if(journey.operatorStatus==='Declined')throw Error('This ticket is already cancelled.');
 const note=text(reason,300);
 if(!note)throw Error('Tell Nirili why the ticket is cancelled, e.g. the guest asked to cancel.');
 Object.assign(journey,{operatorStatus:'Declined',declinedAt:new Date().toISOString(),declineReason:note,...(kind==='cancel'?{cancelledByOperator:true}:{})});
 addHistory(booking,by,kind==='cancel'?'Cancelled by operator':'Declined by operator',note);
 // A website booking with nothing left to travel is closed; room transfers stay open so
 // reception can move the guest to another departure.
 if(!booking.stayId&&booking.journeys.every(j=>j.operatorStatus==='Declined'))booking.status='Cancelled';
 return {booking,journey};
}

// Boarding: the operator taps each party as it boards. Partial parties are allowed.
export function setBoarded(state:TransportState,operatorId:string,bookingId:string,index:number,boarded:number,by:string,today:string){
 const {booking,journey}=ticketFor(state,operatorId,bookingId,index);
 if(journey.operatorStatus==='Declined')throw Error('This ticket is cancelled.');
 if(journey.departedAt)throw Error('This trip is closed.');
 if(journey.date>today)throw Error('Boarding opens on the day of departure.');
 const total=pax(booking),count=Number(boarded);
 if(!Number.isInteger(count)||count<0||count>total)throw Error('Choose between 0 and '+total+' passengers.');
 journey.boardedPax=count;
 if(count)journey.boardedAt=new Date().toISOString();else delete journey.boardedAt;
 addHistory(booking,by,'Boarding',count+' of '+total+' on board');
 return {booking,journey};
}

// Close a trip once it leaves: anyone not on board becomes a no-show.
export function closeDeparture(state:TransportState,operatorId:string,scheduleId:string,date:string,by:string){
 const open=operatorTickets(state,operatorId,t=>t.journey.scheduleId===scheduleId&&t.journey.date===date&&t.journey.operatorStatus!=='Declined'&&!t.journey.departedAt);
 if(!open.length)throw Error('This trip has no open tickets.');
 const now=new Date().toISOString();
 for(const {booking,journey} of open){
  journey.departedAt=now;journey.noShow=!journey.boardedPax;
  addHistory(booking,by,journey.noShow?'No-show':'Departed',journey.boatName||'');
  if(!booking.checked.includes(journey.scheduleId)&&journey.boardedPax)booking.checked.push(journey.scheduleId);
 }
 return open.length;
}

// ---- Day view: every trip the operator runs on a date with its boat, seat map and tickets.
export function operatorDay(state:TransportState,operatorId:string,date:string){
 const sailings=operatorSailings(state,operatorId);
 const tickets=operatorTickets(state,operatorId,t=>t.journey.date===date);
 const ids=new Set([...sailings.filter(s=>s.active&&runsOn(s,date)).map(s=>s.id),...tickets.map(t=>t.journey.scheduleId)]);
 return [...ids].map(id=>{
  const sailing=sailings.find(s=>s.id===id),mine=tickets.filter(t=>t.journey.scheduleId===id),sample=mine[0]?.journey;
  const live=mine.filter(t=>t.journey.operatorStatus!=='Declined'),boat=sailing?tripBoat(state,sailing,date):undefined;
  return {scheduleId:id,date,from:sailing?.from||sample?.from||'',to:sailing?.to||sample?.to||'',depart:sailing?.depart||sample?.depart||'',arrive:sailing?.arrive||sample?.arrive||'',
   boatId:boat?.id||'',boatName:boat?.name||sample?.boatName||'',swapped:!!(sailing&&sailing.boatOverrides?.[date]),layout:boat?.layout||null,
   seats:sailing?tripSeats(state,sailing,date).length:0,sold:live.reduce((n,t)=>n+t.journey.seats.length,0),boarded:live.reduce((n,t)=>n+(t.journey.boardedPax||0),0),
   closed:live.length>0&&live.every(t=>t.journey.departedAt),tickets:mine};
 }).sort((a,b)=>a.depart.localeCompare(b.depart));
}

// ---- Monthly statement and commission.
// Guest-paid tickets: the operator collects the fare in MVR and owes Nirili its commission.
// Room-billed tickets (Nirili Villa guests): Nirili collects in USD and owes the operator the
// fare less commission.
export function operatorStatement(state:TransportState,operator:{id:string;commissionPercent:number},month:string,today='9999-12-31'){
 const rate=Math.max(0,Number(operator.commissionPercent)||0)/100;
 const accepted=operatorTickets(state,operator.id,t=>t.journey.date.startsWith(month)&&t.journey.operatorStatus==='Accepted');
 const travelled=accepted.filter(t=>t.journey.departedAt||t.journey.date<today);
 const rows=travelled.map(({booking,journey})=>{
  const roomBilled=!!booking.stayId&&Number.isInteger(booking.roomCents);
  const fareMvr=journey.fare*booking.adults+Math.round(journey.fare/2)*booking.children;
  const roomUsd=roomBilled?(Number(journey.roomFare)||0)*booking.adults+Math.round((Number(journey.roomFare)||0)/2)*booking.children:0;
  // A guest-paid no-show paid nothing, so there is nothing to collect and no commission.
  const collectedMvr=!roomBilled&&!journey.noShow?fareMvr:0;
  return {bookingId:booking.id,date:journey.date,depart:journey.depart,route:journey.from+' → '+journey.to,boat:journey.boatName||'',guest:booking.name,pax:pax(booking),boarded:journey.boardedPax||0,noShow:!!journey.noShow,departed:!!journey.departedAt,roomBilled,
   fareMvr:roomBilled?0:fareMvr,collectedMvr,roomUsd,commissionMvr:Math.round(collectedMvr*rate),commissionUsd:roomBilled?Math.round(roomUsd*rate):0};
 });
 const sum=(k:keyof typeof rows[number])=>rows.reduce((n,r)=>n+(Number(r[k])||0),0);
 const roomUsd=sum('roomUsd'),commissionUsd=sum('commissionUsd');
 return {month,rate:rate*100,rows,tickets:rows.length,passengers:sum('pax'),noShows:rows.filter(r=>r.noShow).length,upcoming:accepted.length-travelled.length,
  fareMvr:sum('collectedMvr'),commissionMvr:sum('commissionMvr'),
  roomUsd,commissionUsd,payableToOperatorUsd:roomUsd-commissionUsd};
}

export const dayName=(date:string)=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][weekday(date)];
