// Speedboat ledger. Departures (sailings) belong to independent speedboat operators, who publish
// their own times and fares. Every departure runs on one of the operator's boats (it can be
// swapped for a single day), and guests choose seats on that boat's seat map, so a ticket is
// confirmed the moment it is booked. Sailings without an operatorId are Nirili's own legacy
// departures, seated 1…capacity, and keep working as before.

// A boat's seat map as the operator draws it: a grid read from the bow (row 0) to the stern;
// each cell holds a seat number, or 0 for an aisle or empty space.
export type SeatLayout={rows:number;cols:number;cells:number[]};
export type Boat={id:string;operatorId:string;name:string;registration:string;capacity:number;active:boolean;layout?:SeatLayout;createdAt:string;updatedAt:string};
export type Sailing={id:string;boat:string;from:string;to:string;depart:string;arrive:string;capacity:number;fare:number;roomFare?:number;active:boolean;
 // Maldivians often pay less than tourists: `fare` is the tourist fare, `localFare` the optional
 // local fare, and `expatLocal` gives expats living in the Maldives the local fare too.
 localFare?:number;expatLocal?:boolean;
 operatorId?:string;operatorName?:string;
 // Days the departure runs, 0 = Sunday … 6 = Saturday. Missing or empty means every day.
 days?:number[];
 // The boat that normally runs this departure, and one-day swaps (date → boat id).
 boatId?:string;boatOverrides?:Record<string,string>;
 // The operator's crew who normally work this departure, and one-day changes (date → crew ids).
 crewIds?:string[];crewOverrides?:Record<string,string[]>};
export type TicketStatus='New'|'Accepted'|'Declined';
export type Journey={scheduleId:string;date:string;seats:number[];boat:string;from:string;to:string;depart:string;arrive:string;fare:number;roomFare?:number;
 operatorId?:string;operatorName?:string;operatorStatus?:TicketStatus;
 boatId?:string;boatName?:string;acceptedAt?:string;acceptedBy?:string;declinedAt?:string;declineReason?:string;
 boardedPax?:number;boardedAt?:string;noShow?:boolean;departedAt?:string;
 // Set when the operator cancels an accepted ticket (e.g. the guest asked them to) rather than declining a new one.
 cancelledByOperator?:boolean};
export type HistoryEntry={at:string;by:string;action:string;detail?:string};
export type TransferBooking={id:string;token:string;owner:string;name:string;phone:string;traveller:string;adults:number;children:number;infants:number;journeys:Journey[];total:number;status:'Confirmed'|'Cancelled'|'Requested';paid:boolean;checked:string[];created:string;notes:string;stayId?:string;room?:string;roomCents?:number;transportPlanLeg?:'arrival'|'departure';
 source?:string;agentId?:string;agentName?:string;agentReference?:string;pickup?:string;history?:HistoryEntry[]};
export type TransportState={sailings:Sailing[];bookings:TransferBooking[];boats?:Boat[]};

export const transportToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const transferMoney=(c:number)=>'MVR '+(c/100).toFixed(2);
export function initialTransport():TransportState{return {sailings:[['07:30','08:25','Nirili Express',20000],['13:30','14:20','Nirili Express',20000],['16:30','17:25','Coral Speed',22500],['22:15','23:10','Nirili Night',25000]].flatMap((s,i)=>[false,true].map(reverse=>({id:'nv-'+i+(reverse?'-return':''),boat:String(s[2]),from:reverse?'Velana Airport':'Dhiffushi',to:reverse?'Dhiffushi':'Velana Airport',depart:String(s[0]),arrive:String(s[1]),capacity:36,fare:Number(s[3]),active:false}))),bookings:[],boats:[]};}
export function normalizeTransport(state:any):TransportState{
 const s=state&&typeof state==='object'?state:initialTransport();
 s.sailings=Array.isArray(s.sailings)?s.sailings:[];s.bookings=Array.isArray(s.bookings)?s.bookings:[];s.boats=Array.isArray(s.boats)?s.boats:[];
 // Tickets booked before boats were assigned to trips confirm onto the trip's boat.
 for(const b of s.bookings as TransferBooking[])for(const j of b.journeys||[]){
  if(j.operatorId&&j.operatorStatus==='New'){
   const sailing=s.sailings.find((x:Sailing)=>x.id===j.scheduleId),boat=sailing?tripBoat(s,sailing,j.date):undefined;
   Object.assign(j,{operatorStatus:'Accepted'},boat?{boatId:boat.id,boatName:boat.name}:{});
  }
 }
 return s;
}

// ---- Seat maps
export function layoutSeats(layout?:SeatLayout){return layout?layout.cells.filter(n=>n>0).sort((a,b)=>a-b):[];}
// A plain layout for a boat without a drawn map: rows of `perRow` seats with an aisle in the middle.
export function defaultLayout(capacity:number,perRow=4):SeatLayout{
 const left=Math.ceil(perRow/2),cols=perRow+1,rows=Math.ceil(capacity/perRow),cells:number[]=[];
 let n=capacity;
 for(let i=0;i<rows*cols;i++)cells.push(0);
 // Number from the stern upwards, right to left, like the operators' own seat plans.
 for(let r=rows-1;r>=0&&n>0;r--)for(let c=cols-1;c>=0&&n>0;c--){if(c===left)continue;cells[r*cols+c]=capacity-n+1;n--;}
 return {rows,cols,cells};
}
export function boatSeats(boat:Boat){return boat.layout?layoutSeats(boat.layout):Array.from({length:boat.capacity},(_,i)=>i+1);}
export function tripBoat(state:TransportState,sailing:Sailing,date:string):Boat|undefined{
 const id=sailing.boatOverrides?.[date]||sailing.boatId;
 return id?(state.boats||[]).find(b=>b.id===id):undefined;
}
// The seat numbers sold on a trip: the trip boat's seat map, or 1…capacity for legacy departures.
export function tripSeats(state:TransportState,sailing:Sailing,date:string){
 const boat=tripBoat(state,sailing,date);
 return boat?boatSeats(boat):Array.from({length:sailing.capacity},(_,i)=>i+1);
}
export const tripCapacity=(state:TransportState,sailing:Sailing,date:string)=>tripSeats(state,sailing,date).length;

// A ticket holds seats unless the booking is cancelled or the operator declined that journey.
export const journeyLive=(booking:TransferBooking,journey:Journey)=>booking.status!=='Cancelled'&&journey.operatorStatus!=='Declined';
export function occupied(state:TransportState,scheduleId:string,date:string){return state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===scheduleId&&j.date===date).flatMap(j=>j.seats));}
export function bookedPassengers(state:TransportState,scheduleId:string,date:string,excludeId=''){
 return state.bookings.filter(b=>b.id!==excludeId&&b.journeys.some(j=>journeyLive(b,j)&&j.scheduleId===scheduleId&&j.date===date)).reduce((n,b)=>n+b.adults+b.children+b.infants,0);
}
export const weekday=(date:string)=>new Date(date+'T00:00:00Z').getUTCDay();
export const runsOn=(sailing:Sailing,date:string)=>!Array.isArray(sailing.days)||sailing.days.length===0||sailing.days.includes(weekday(date));

// Every way of booking a seat builds the journey here. Operator tickets are confirmed on the
// trip's boat straight away: the guest chose a real seat on it.
export const TRAVELLERS=['Tourist','Local','Expat'] as const;
export type Traveller=typeof TRAVELLERS[number];
// The adult fare a passenger pays on a departure (children pay half; infants travel free).
export function fareFor(sailing:Pick<Sailing,'fare'|'localFare'|'expatLocal'>,traveller:string){
 const local=traveller==='Local'||traveller==='Expat'&&!!sailing.expatLocal;
 return local&&Number.isInteger(sailing.localFare)?Number(sailing.localFare):sailing.fare;
}
export const hasLocalFare=(sailing:Pick<Sailing,'fare'|'localFare'>)=>Number.isInteger(sailing.localFare)&&sailing.localFare!==sailing.fare;

export function journeyFor(sailing:Sailing,date:string,seats:number[],boat?:Boat,traveller='Tourist'):Journey{
 return {scheduleId:sailing.id,date,seats,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,fare:fareFor(sailing,traveller),
  ...(Number.isInteger(sailing.roomFare)?{roomFare:sailing.roomFare}:{}),
  ...(sailing.operatorId?{operatorId:sailing.operatorId,operatorName:sailing.operatorName||sailing.boat,operatorStatus:'Accepted' as TicketStatus,...(boat?{boatId:boat.id,boatName:boat.name}:{})}:{})};
}
export function addHistory(booking:TransferBooking,by:string,action:string,detail=''){
 booking.history??=[];booking.history.push({at:new Date().toISOString(),by,action,...(detail?{detail}:{})});
}

const dateValid=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const short=(x:any,n:number)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export function createTransfer(state:TransportState,b:any,owner:string):TransferBooking{
 if(!short(b.token,100)||!short(b.name,120)||!short(b.phone,80)||!TRAVELLERS.includes(b.traveller)||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Enter your name, contact number and passenger type.');
 if(![b.adults,b.children,b.infants].every(n=>Number.isInteger(n)&&n>=0&&n<=20)||b.adults<1||b.adults+b.children+b.infants>20)throw Error('Choose between 1 and 20 passengers, including at least one adult.');
 if(!Array.isArray(b.journeys)||b.journeys.length<1||b.journeys.length>2)throw Error('Choose your journeys.');
 const journeys:Journey[]=b.journeys.map((j:any)=>{
 const s=state.sailings.find(s=>s.id===j.scheduleId&&s.active);if(!s)throw Error('This departure is unavailable. Search again.');
 if(!dateValid(j.date)||Date.parse(j.date+'T'+s.depart+':00+05:00')<=Date.now())throw Error('Select a future departure.');
 if(!runsOn(s,j.date))throw Error('This departure does not run on the selected day. Choose another date or time.');
 const seatsOnTrip=new Set(tripSeats(state,s,j.date));
 if(!Array.isArray(j.seats)||j.seats.length!==b.adults+b.children||new Set(j.seats).size!==j.seats.length||j.seats.some((n:any)=>!Number.isInteger(n)||!seatsOnTrip.has(n)))throw Error('Select one seat per adult and child.');
 const taken=occupied(state,s.id,j.date),clash=j.seats.filter((n:number)=>taken.includes(n));
 if(clash.length)throw Error('Seat '+clash.join(', ')+' was just booked by someone else. Choose another seat.');
 if(taken.length+j.seats.length>seatsOnTrip.size)throw Error('This departure does not have enough seats.');
 return journeyFor(s,j.date,j.seats,tripBoat(state,s,j.date),b.traveller);});
 if(journeys.length===2){const [a,z]=journeys;if(a.from!==z.to||a.to!==z.from||z.date+'T'+z.depart<=a.date+'T'+a.arrive)throw Error('The return journey must depart after arrival and reverse your route.');}
 const total=journeys.reduce((n,j)=>n+j.fare*b.adults+Math.round(j.fare/2)*b.children,0);
 if(b.expectedTotal!==total)throw Error('The fare changed. Review the current total and try again.');
 return {id:'NT-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,owner,name:b.name.trim(),phone:b.phone.trim(),traveller:b.traveller,adults:b.adults,children:b.children,infants:b.infants,journeys,total,status:'Confirmed',paid:false,checked:[],created:new Date().toISOString(),notes:b.notes};
}

// The first free seats on the trip boat, for bookings where nobody chose seats on the map.
export function freeSeats(state:TransportState,sailing:Sailing,date:string,count:number,excludeId=''){
 const used=new Set(state.bookings.filter(b=>b.id!==excludeId).flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===sailing.id&&j.date===date).flatMap(j=>j.seats)));
 const out:number[]=[];
 for(const n of tripSeats(state,sailing,date)){if(out.length>=count)break;if(!used.has(n))out.push(n);}
 return out.length===count?out:null;
}

// Seats for a website or partner booking: the seats the guest tapped on the seat map, or the
// first free seats when they let us choose. createTransfer then checks the seats are still free.
export function seatsForBooking(state:TransportState,journeys:any[],count:number){
 return (Array.isArray(journeys)?journeys:[]).map((j:any)=>{
  const sailing=state.sailings.find(s=>s.id===j?.scheduleId&&s.active);
  if(!sailing)return j;
  const picked=Array.isArray(j?.seats)&&j.seats.length>0?j.seats.map(Number):null;
  if(picked)return {...j,seats:picked};
  const seats=freeSeats(state,sailing,String(j.date||''),count);
  if(!seats)throw Error('Not enough seats left on this boat for your group. Try another time or date.');
  return {...j,seats};
 });
}
// The seat maps guests see: every boat that runs a departure on sale. Legacy boats without a
// drawn map show plain rows.
export function publicBoats(state:TransportState){
 const used=new Set(state.sailings.filter(s=>s.active).flatMap(s=>[s.boatId,...Object.values(s.boatOverrides||{})]).filter(Boolean));
 return (state.boats||[]).filter(b=>used.has(b.id)).map(b=>({id:b.id,name:b.name,layout:b.layout||defaultLayout(b.capacity)}));
}
// Taken seats are seat numbers only: guests never see who holds them.
export function seatAvailability(state:TransportState){
 return state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)).map(j=>({scheduleId:j.scheduleId,date:j.date,seats:j.seats,pax:b.adults+b.children+b.infants})));
}
export const seatTaken=(e:unknown)=>e instanceof Error&&/was just booked by someone else/.test(e.message);
