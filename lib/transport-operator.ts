import {addHistory,journeyLive,runsOn,weekday,type Boat,type Journey,type Sailing,type TransferBooking,type TransportState} from './transport';

// What a speedboat operator can do in its portal. Every function checks that the boat,
// departure or ticket belongs to the calling operator, so one operator can never see or change
// another's work. All functions change the state in place; the caller saves it with a
// compare-and-swap so two devices cannot overwrite each other.
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const dateOk=(d:any)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d);
const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const pax=(b:TransferBooking)=>b.adults+b.children+b.infants;
export const ticketPax=pax;

type OperatorRef={id:string;name:string};

// ---- Fleet
export function operatorBoats(state:TransportState,operatorId:string){return (state.boats||[]).filter(b=>b.operatorId===operatorId);}
export function saveBoat(state:TransportState,operator:OperatorRef,input:any):Boat{
 state.boats??=[];
 const name=text(input?.name,80),registration=text(input?.registration,40),capacity=Number(input?.capacity);
 if(!name)throw Error('Enter the boat name.');
 if(!Number.isInteger(capacity)||capacity<1||capacity>100)throw Error('Enter the number of passenger seats (1–100).');
 const now=new Date().toISOString(),id=text(input?.id,60);
 if(id){
  const boat=state.boats.find(b=>b.id===id&&b.operatorId===operator.id);
  if(!boat)throw Error('Boat not found.');
  // A smaller boat cannot strand tickets already assigned to it.
  const assigned=Math.max(0,...assignedLoads(state,boat.id).map(l=>l.pax));
  if(capacity<assigned)throw Error('This boat already has '+assigned+' passengers assigned on one departure. Move them before reducing its seats.');
  Object.assign(boat,{name,registration,capacity,active:input?.active!==false,updatedAt:now});
  return boat;
 }
 const boat:Boat={id:'BOAT-'+crypto.randomUUID().slice(0,8).toUpperCase(),operatorId:operator.id,name,registration,capacity,active:input?.active!==false,createdAt:now,updatedAt:now};
 state.boats.push(boat);
 return boat;
}

// ---- Departures
export function operatorSailings(state:TransportState,operatorId:string){return state.sailings.filter(s=>s.operatorId===operatorId);}
const hasFutureTickets=(state:TransportState,sailingId:string)=>state.bookings.some(b=>b.journeys.some(j=>journeyLive(b,j)&&j.scheduleId===sailingId&&Date.parse(j.date+'T'+j.depart+':00+05:00')>Date.now()));
export function saveOperatorSailing(state:TransportState,operator:OperatorRef,input:any):Sailing{
 const from=text(input?.from,60),to=text(input?.to,60),depart=String(input?.depart||''),arrive=String(input?.arrive||'');
 const capacity=Number(input?.capacity),fare=Number(input?.fare),roomFare=input?.roomFare===''||input?.roomFare==null?undefined:Number(input.roomFare);
 const days=Array.isArray(input?.days)?[...new Set(input.days.map(Number))].filter((d:any)=>Number.isInteger(d)&&d>=0&&d<=6).sort() as number[]:[];
 if(!from||!to||from===to)throw Error('Choose where the boat leaves from and where it goes.');
 if(!TIME.test(depart)||!TIME.test(arrive)||arrive<=depart)throw Error('Enter same-day departure and arrival times (24-hour), arrival after departure.');
 if(!Number.isInteger(capacity)||capacity<1||capacity>100)throw Error('Enter how many seats you sell on this departure (1–100).');
 if(!Number.isInteger(fare)||fare<0||fare>10000000)throw Error('Enter the adult fare in MVR.');
 if(roomFare!==undefined&&(!Number.isInteger(roomFare)||roomFare<0||roomFare>10000000))throw Error('Enter a valid USD fare for Nirili Villa guests, or leave it empty.');
 const id=text(input?.id,80),previous=id?state.sailings.find(s=>s.id===id&&s.operatorId===operator.id):undefined;
 if(id&&!previous)throw Error('Departure not found.');
 const next:Sailing={id:previous?.id||'OPS-'+crypto.randomUUID().slice(0,8).toUpperCase(),boat:operator.name,operatorId:operator.id,operatorName:operator.name,from,to,depart,arrive,capacity,fare,...(roomFare!==undefined?{roomFare}:{}),days:days.length===7?[]:days,active:input?.active!==false};
 if(previous&&hasFutureTickets(state,previous.id)){
  const changed=(['from','to','depart','arrive','fare','roomFare'] as const).some(k=>previous[k]!==next[k])||JSON.stringify(previous.days||[])!==JSON.stringify(next.days||[]);
  if(changed)throw Error('This departure has upcoming tickets. Create a new departure for a new time, route, fare or days, and take this one off sale when its tickets have travelled.');
  const sold=Math.max(0,...futureDates(state,previous.id).map(d=>bookedOn(state,previous.id,d)));
  if(next.capacity<sold)throw Error('You have already sold '+sold+' seats on one of these departures. Seats cannot go below that.');
 }
 state.sailings=previous?state.sailings.map(s=>s.id===previous.id?next:s):[...state.sailings,next];
 return next;
}
function futureDates(state:TransportState,sailingId:string){return [...new Set(state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===sailingId&&Date.parse(j.date+'T'+j.depart+':00+05:00')>Date.now()).map(j=>j.date)))];}
function bookedOn(state:TransportState,sailingId:string,date:string){return state.bookings.filter(b=>b.journeys.some(j=>journeyLive(b,j)&&j.scheduleId===sailingId&&j.date===date)).reduce((n,b)=>n+pax(b),0);}

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

// Passengers already on a boat for each departure it is assigned to.
function assignedLoads(state:TransportState,boatId:string){
 const loads=new Map<string,{date:string;depart:string;arrive:string;scheduleId:string;pax:number}>();
 for(const b of state.bookings)for(const j of b.journeys){
  if(!journeyLive(b,j)||j.boatId!==boatId||j.operatorStatus!=='Accepted'||j.departedAt)continue;
  const key=j.scheduleId+'|'+j.date,cur=loads.get(key)||{date:j.date,depart:j.depart,arrive:j.arrive,scheduleId:j.scheduleId,pax:0};
  cur.pax+=pax(b);loads.set(key,cur);
 }
 return [...loads.values()];
}

// Accept a ticket onto one of the operator's boats (or move it to another boat).
export function acceptTicket(state:TransportState,operatorId:string,bookingId:string,index:number,boatId:string,by:string){
 const {booking,journey}=ticketFor(state,operatorId,bookingId,index);
 if(journey.operatorStatus==='Declined')throw Error('This ticket was declined.');
 if(journey.departedAt)throw Error('This departure has already left.');
 if(journey.boardedPax)throw Error('Passengers on this ticket have boarded. Unboard them before moving the ticket.');
 const boat=(state.boats||[]).find(b=>b.id===boatId&&b.operatorId===operatorId);
 if(!boat)throw Error('Choose one of your boats.');
 if(!boat.active)throw Error(boat.name+' is marked out of service.');
 const loads=assignedLoads(state,boat.id);
 const here=loads.find(l=>l.scheduleId===journey.scheduleId&&l.date===journey.date);
 const alreadyHere=journey.boatId===boat.id&&journey.operatorStatus==='Accepted'?pax(booking):0;
 if((here?.pax||0)-alreadyHere+pax(booking)>boat.capacity)throw Error(boat.name+' has '+(boat.capacity-((here?.pax||0)-alreadyHere))+' seats left on this departure; this ticket needs '+pax(booking)+'.');
 const clash=loads.find(l=>l.date===journey.date&&l.scheduleId!==journey.scheduleId&&minutes(l.depart)<minutes(journey.arrive)&&minutes(journey.depart)<minutes(l.arrive));
 if(clash)throw Error(boat.name+' is already on the '+clash.depart+' departure at that time.');
 const moved=journey.operatorStatus==='Accepted'&&journey.boatId&&journey.boatId!==boat.id;
 Object.assign(journey,{operatorStatus:'Accepted',boatId:boat.id,boatName:boat.name,acceptedAt:journey.acceptedAt||new Date().toISOString(),acceptedBy:by});
 addHistory(booking,by,moved?'Moved to boat':'Accepted by operator',boat.name+' · '+journey.date+' '+journey.depart);
 return {booking,journey,boat};
}

// Decline a new ticket, or cancel one already accepted (for example when the guest asks the
// operator to cancel). Either way the seats are freed and Nirili is told; it is only possible
// before anyone on the ticket has boarded.
export function declineTicket(state:TransportState,operatorId:string,bookingId:string,index:number,reason:string,by:string,kind:'decline'|'cancel'='decline'){
 const {booking,journey}=ticketFor(state,operatorId,bookingId,index);
 if(journey.departedAt||journey.boardedPax)throw Error('Passengers on this ticket have already boarded.');
 if(journey.operatorStatus==='Declined')throw Error(journey.cancelledByOperator?'This ticket is already cancelled.':'This ticket is already declined.');
 const note=text(reason,300);
 if(!note)throw Error(kind==='cancel'?'Tell Nirili why the ticket is cancelled, e.g. the guest asked to cancel.':'Tell the guest and Nirili why you cannot take this ticket.');
 Object.assign(journey,{operatorStatus:'Declined',declinedAt:new Date().toISOString(),declineReason:note,...(kind==='cancel'?{cancelledByOperator:true}:{})});
 delete journey.boatId;delete journey.boatName;
 addHistory(booking,by,kind==='cancel'?'Cancelled by operator':'Declined by operator',note);
 // A walk-in booking with nothing left to travel is closed; room transfers stay open so
 // reception can move the guest to another departure.
 if(!booking.stayId&&booking.journeys.every(j=>j.operatorStatus==='Declined'))booking.status='Cancelled';
 return {booking,journey};
}

// Boarding: the operator taps each party as it boards. Partial parties are allowed.
export function setBoarded(state:TransportState,operatorId:string,bookingId:string,index:number,boarded:number,by:string,today:string){
 const {booking,journey}=ticketFor(state,operatorId,bookingId,index);
 if(journey.operatorStatus!=='Accepted')throw Error('Accept the ticket onto a boat before boarding.');
 if(journey.departedAt)throw Error('This departure is closed.');
 if(journey.date>today)throw Error('Boarding opens on the day of departure.');
 const total=pax(booking),count=Number(boarded);
 if(!Number.isInteger(count)||count<0||count>total)throw Error('Choose between 0 and '+total+' passengers.');
 journey.boardedPax=count;
 if(count)journey.boardedAt=new Date().toISOString();else delete journey.boardedAt;
 addHistory(booking,by,'Boarding',count+' of '+total+' on board');
 return {booking,journey};
}

// Close a departure on one boat once it leaves: unboarded parties become no-shows.
export function closeDeparture(state:TransportState,operatorId:string,scheduleId:string,date:string,boatId:string,by:string){
 const tickets=operatorTickets(state,operatorId,t=>t.journey.scheduleId===scheduleId&&t.journey.date===date);
 if(!tickets.length)throw Error('No tickets on this departure.');
 if(tickets.some(t=>t.journey.operatorStatus==='New'))throw Error('Accept or decline every new ticket on this departure first.');
 const onBoat=tickets.filter(t=>t.journey.operatorStatus==='Accepted'&&t.journey.boatId===boatId&&!t.journey.departedAt);
 if(!onBoat.length)throw Error('This boat has no open tickets on this departure.');
 const now=new Date().toISOString();
 for(const {booking,journey} of onBoat){
  journey.departedAt=now;journey.noShow=!journey.boardedPax;
  addHistory(booking,by,journey.noShow?'No-show':'Departed',journey.boatName||'');
  if(!booking.checked.includes(journey.scheduleId)&&journey.boardedPax)booking.checked.push(journey.scheduleId);
 }
 return onBoat.length;
}

// ---- Day view: every departure the operator runs on a date, with its tickets grouped by boat.
export function operatorDay(state:TransportState,operatorId:string,date:string){
 const sailings=operatorSailings(state,operatorId);
 const tickets=operatorTickets(state,operatorId,t=>t.journey.date===date);
 const ids=new Set([...sailings.filter(s=>s.active&&runsOn(s,date)).map(s=>s.id),...tickets.map(t=>t.journey.scheduleId)]);
 return [...ids].map(id=>{
  const sailing=sailings.find(s=>s.id===id),mine=tickets.filter(t=>t.journey.scheduleId===id),sample=mine[0]?.journey;
  const live=mine.filter(t=>t.journey.operatorStatus!=='Declined');
  return {scheduleId:id,date,from:sailing?.from||sample?.from||'',to:sailing?.to||sample?.to||'',depart:sailing?.depart||sample?.depart||'',arrive:sailing?.arrive||sample?.arrive||'',
   seats:sailing?.capacity||0,sold:live.reduce((n,t)=>n+pax(t.booking),0),boarded:live.reduce((n,t)=>n+(t.journey.boardedPax||0),0),
   tickets:mine};
 }).sort((a,b)=>a.depart.localeCompare(b.depart));
}

// ---- Monthly statement and commission.
// Guest-paid tickets: the operator collects the fare in MVR and owes Nirili its commission.
// Room-billed tickets (Nirili Villa guests): Nirili collects in USD and owes the operator the
// fare less commission. No-shows on guest-paid tickets earn no commission (nothing collected).
// Only trips that have happened count: the departure was closed, or its date has passed.
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
