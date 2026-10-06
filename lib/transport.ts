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
 // Like ODI and RTL, fares depend on the passenger: `fare` is the tourist fare, `localFare` the
 // optional fare for Maldivians and `expatFare` the optional fare for expats living in the
 // Maldives. `expatLocal` (older departures) gives expats the local fare.
 localFare?:number;expatFare?:number;expatLocal?:boolean;
 // A route with stops, e.g. Dhiffushi 08:00 → Airport 08:40/08:45 → Malé 08:55. Guests book from
 // any stop to any later stop that has a fare; a seat is only taken on the part of the route
 // they travel. Without stops the departure is a single hop from → to. from/to/depart/arrive
 // and the fares above always describe the whole route (first to last stop).
 stops?:Stop[];fares?:LegFare[];
 operatorId?:string;operatorName?:string;
 // Days the departure runs, 0 = Sunday … 6 = Saturday. Missing or empty means every day.
 days?:number[];
 // The boat that normally runs this departure, and one-day swaps (date → boat id).
 boatId?:string;boatOverrides?:Record<string,string>;
 // The operator's crew who normally work this departure, and one-day changes (date → crew ids).
 crewIds?:string[];crewOverrides?:Record<string,string[]>};
export type TicketStatus='New'|'Accepted'|'Declined';
export type Stop={port:string;arrive?:string;depart?:string};
export type LegFare={from:number;to:number;fare:number;localFare?:number;expatFare?:number;roomFare?:number};
// A bookable part of a route (stop i to stop j), shaped like a one-hop departure.
export type Leg=Sailing&{fromStop:number;toStop:number;key:string};
// fromStop/toStop: where on a route with stops the guest gets on and off (missing = whole route).
export type Journey={scheduleId:string;date:string;seats:number[];boat:string;from:string;to:string;depart:string;arrive:string;fare:number;roomFare?:number;fromStop?:number;toStop?:number;
 operatorId?:string;operatorName?:string;operatorStatus?:TicketStatus;
 boatId?:string;boatName?:string;acceptedAt?:string;acceptedBy?:string;declinedAt?:string;declineReason?:string;
 boardedPax?:number;boardedAt?:string;noShow?:boolean;departedAt?:string;
 // Set when the operator cancels an accepted ticket (e.g. the guest asked them to) rather than declining a new one.
 cancelledByOperator?:boolean};
export type HistoryEntry={at:string;by:string;action:string;detail?:string};
export type TransferBooking={id:string;token:string;owner:string;name:string;phone:string;traveller:string;adults:number;children:number;infants:number;journeys:Journey[];total:number;status:'Confirmed'|'Cancelled'|'Requested';paid:boolean;checked:string[];created:string;notes:string;stayId?:string;room?:string;roomCents?:number;transportPlanLeg?:'arrival'|'departure';
 source?:string;agentId?:string;agentName?:string;agentReference?:string;pickup?:string;history?:HistoryEntry[]};
// Private charters: operators publish a price per route for a whole boat; guests request a
// charter and the operator confirms it with a boat (lib/transport-charter.ts).
export type CharterRate={id:string;operatorId:string;operatorName:string;from:string;to:string;price:number;blockMin:number;boatIds:string[];active:boolean;note?:string;createdAt:string;updatedAt:string};
export type CharterStatus='Requested'|'Confirmed'|'Declined'|'Cancelled'|'Completed';
export type Charter={id:string;token:string;owner:string;rateId:string;operatorId:string;operatorName:string;from:string;to:string;date:string;time:string;blockMin:number;
 pax:number;name:string;phone:string;traveller:string;notes:string;price:number;status:CharterStatus;boatId?:string;boatName?:string;crewIds?:string[];reason?:string;
 source:string;agentId?:string;agentName?:string;created:string;completedAt?:string;history?:HistoryEntry[]};
export type TransportState={sailings:Sailing[];bookings:TransferBooking[];boats?:Boat[];charterRates?:CharterRate[];charters?:Charter[]};

export const transportToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const transferMoney=(c:number)=>'MVR '+(c/100).toFixed(2);
export function initialTransport():TransportState{return {sailings:[['07:30','08:25','Nirili Express',20000],['13:30','14:20','Nirili Express',20000],['16:30','17:25','Coral Speed',22500],['22:15','23:10','Nirili Night',25000]].flatMap((s,i)=>[false,true].map(reverse=>({id:'nv-'+i+(reverse?'-return':''),boat:String(s[2]),from:reverse?'Velana Airport':'Dhiffushi',to:reverse?'Dhiffushi':'Velana Airport',depart:String(s[0]),arrive:String(s[1]),capacity:36,fare:Number(s[3]),active:false}))),bookings:[],boats:[]};}
export function normalizeTransport(state:any):TransportState{
 const s=state&&typeof state==='object'?state:initialTransport();
 s.sailings=Array.isArray(s.sailings)?s.sailings:[];s.bookings=Array.isArray(s.bookings)?s.bookings:[];s.boats=Array.isArray(s.boats)?s.boats:[];
 s.charterRates=Array.isArray(s.charterRates)?s.charterRates:[];s.charters=Array.isArray(s.charters)?s.charters:[];
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
// ---- Routes with stops
export function stopsOf(sailing:Sailing):Stop[]{
 return sailing.stops&&sailing.stops.length>=2?sailing.stops:[{port:sailing.from,depart:sailing.depart},{port:sailing.to,arrive:sailing.arrive}];
}
export function faresOf(sailing:Sailing):LegFare[]{
 return sailing.fares?.length?sailing.fares:[{from:0,to:1,fare:sailing.fare,localFare:sailing.localFare,expatFare:sailing.expatFare,roomFare:sailing.roomFare}];
}
export function legOf(sailing:Sailing,i:number,j:number):Leg|null{
 const stops=stopsOf(sailing),f=faresOf(sailing).find(x=>x.from===i&&x.to===j);
 if(!f||!Number.isInteger(i)||!Number.isInteger(j)||i<0||j>=stops.length||i>=j)return null;
 const legacy=!sailing.fares?.length;
 return {...sailing,from:stops[i].port,to:stops[j].port,depart:stops[i].depart||sailing.depart,arrive:stops[j].arrive||sailing.arrive,
  fare:f.fare,localFare:f.localFare,expatFare:f.expatFare,roomFare:f.roomFare,expatLocal:legacy?sailing.expatLocal:undefined,fromStop:i,toStop:j,key:sailing.id+'@'+i+'-'+j};
}
// Every part of a route that is on sale (has a fare).
export const legsOf=(sailing:Sailing)=>faresOf(sailing).map(f=>legOf(sailing,f.from,f.to)).filter((l):l is Leg=>!!l);
export function findLeg(sailing:Sailing,from:string,to:string,same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase()){
 return legsOf(sailing).find(l=>same(l.from,from)&&same(l.to,to))||null;
}
// The stretch of the route a journey or leg covers; journeys without stops cover it all.
export const span=(x:{fromStop?:number;toStop?:number})=>({from:x.fromStop??0,to:x.toStop??99});
const shares=(a:{from:number;to:number},b:{from:number;to:number})=>a.from<b.to&&b.from<a.to;
// Seats taken on a trip, only by passengers who are on board for part of the given stretch.
export function occupied(state:TransportState,scheduleId:string,date:string,stretch={from:0,to:99},excludeId=''){
 return state.bookings.filter(b=>b.id!==excludeId).flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===scheduleId&&j.date===date&&shares(span(j),stretch)).flatMap(j=>j.seats));
}
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
type Fares=Pick<Sailing,'fare'|'localFare'|'expatFare'|'expatLocal'>;
export function fareFor(sailing:Fares,traveller:string){
 const set=(n?:number)=>Number.isInteger(n);
 if(traveller==='Local'&&set(sailing.localFare))return Number(sailing.localFare);
 if(traveller==='Expat'){
  if(set(sailing.expatFare))return Number(sailing.expatFare);
  if(sailing.expatLocal&&set(sailing.localFare))return Number(sailing.localFare);
 }
 return sailing.fare;
}
// True when the passenger type changes the price, so the guest must say which they are.
export const hasLocalFare=(sailing:Fares)=>TRAVELLERS.some(t=>fareFor(sailing,t)!==sailing.fare);
// Every port a guest can travel between: scheduled departures and charter routes on sale.
export function ports(state:TransportState){
 const list=[...state.sailings.filter(s=>s.active).flatMap(s=>stopsOf(s).map(x=>x.port)),...(state.charterRates||[]).filter(r=>r.active).flatMap(r=>[r.from,r.to])];
 return [...new Set(list.map(p=>p.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

// Pass a Leg to book part of a route with stops; a plain departure books the whole of it.
export function journeyFor(sailing:Sailing|Leg,date:string,seats:number[],boat?:Boat,traveller='Tourist'):Journey{
 const leg='fromStop' in sailing&&sailing.stops?.length?{fromStop:sailing.fromStop,toStop:sailing.toStop}:{};
 return {scheduleId:sailing.id,date,seats,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,fare:fareFor(sailing,traveller),...leg,
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
 const route=state.sailings.find(s=>s.id===j.scheduleId&&s.active);if(!route)throw Error('This departure is unavailable. Search again.');
 const s=legFor(route,j);if(!s)throw Error('Choose where you get on and off this boat.');
 if(!dateValid(j.date)||Date.parse(j.date+'T'+s.depart+':00+05:00')<=Date.now())throw Error('Select a future departure.');
 if(!runsOn(route,j.date))throw Error('This departure does not run on the selected day. Choose another date or time.');
 const seatsOnTrip=new Set(tripSeats(state,s,j.date));
 if(!Array.isArray(j.seats)||j.seats.length!==b.adults+b.children||new Set(j.seats).size!==j.seats.length||j.seats.some((n:any)=>!Number.isInteger(n)||!seatsOnTrip.has(n)))throw Error('Select one seat per adult and child.');
 const taken=occupied(state,s.id,j.date,span(s)),clash=j.seats.filter((n:number)=>taken.includes(n));
 if(clash.length)throw Error('Seat '+clash.join(', ')+' was just booked by someone else. Choose another seat.');
 return journeyFor(s,j.date,j.seats,tripBoat(state,s,j.date),b.traveller);});
 if(journeys.length===2){const [a,z]=journeys;if(a.from!==z.to||a.to!==z.from||z.date+'T'+z.depart<=a.date+'T'+a.arrive)throw Error('The return journey must depart after arrival and reverse your route.');}
 const total=journeys.reduce((n,j)=>n+j.fare*b.adults+Math.round(j.fare/2)*b.children,0);
 if(b.expectedTotal!==total)throw Error('The fare changed. Review the current total and try again.');
 return {id:'NT-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,owner,name:b.name.trim(),phone:b.phone.trim(),traveller:b.traveller,adults:b.adults,children:b.children,infants:b.infants,journeys,total,status:'Confirmed',paid:false,checked:[],created:new Date().toISOString(),notes:b.notes};
}

// The part of a route a booking asks for: its stops, or the whole route (legacy departures and
// one-hop routes). Null when that part is not on sale.
export function legFor(route:Sailing,j:{fromStop?:any;toStop?:any}){
 if(j.fromStop!=null||j.toStop!=null)return legOf(route,Number(j.fromStop),Number(j.toStop));
 return legOf(route,0,stopsOf(route).length-1);
}
// The first free seats on the trip boat, for bookings where nobody chose seats on the map. Pass a
// Leg to look only at the stretch it covers.
export function freeSeats(state:TransportState,sailing:Sailing|Leg,date:string,count:number,excludeId=''){
 const used=new Set(occupied(state,sailing.id,date,'fromStop' in sailing?span(sailing):{from:0,to:99},excludeId));
 const out:number[]=[];
 for(const n of tripSeats(state,sailing,date)){if(out.length>=count)break;if(!used.has(n))out.push(n);}
 return out.length===count?out:null;
}

// Seats for a website or partner booking: the seats the guest tapped on the seat map, or the
// first free seats when they let us choose. createTransfer then checks the seats are still free.
export function seatsForBooking(state:TransportState,journeys:any[],count:number){
 return (Array.isArray(journeys)?journeys:[]).map((j:any)=>{
  const route=state.sailings.find(s=>s.id===j?.scheduleId&&s.active),sailing=route&&legFor(route,j||{});
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
 return state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)).map(j=>({scheduleId:j.scheduleId,date:j.date,seats:j.seats,pax:b.adults+b.children+b.infants,...span(j)})));
}
export const seatTaken=(e:unknown)=>e instanceof Error&&/was just booked by someone else/.test(e.message);

// What guests and partners may book: Nirili's own departures and those of operators whose
// partner account is active and allowed to run speedboats. A paused or deleted operator's
// departures, boats and charter routes disappear from sale; their sold tickets stay.
export function bookableState(state:TransportState,liveOperators:Set<string>):TransportState{
 const live=(id?:string)=>!id||liveOperators.has(id);
 return {...state,sailings:state.sailings.filter(s=>live(s.operatorId)),charterRates:(state.charterRates||[]).filter(r=>live(r.operatorId)),boats:(state.boats||[]).filter(b=>live(b.operatorId))};
}
export function assertBookable(state:TransportState,journeys:any[],liveOperators:Set<string>){
 for(const j of Array.isArray(journeys)?journeys:[]){
  const s=state.sailings.find(x=>x.id===j?.scheduleId);
  if(s?.operatorId&&!liveOperators.has(s.operatorId))throw Error('This departure is unavailable. Search again.');
 }
}
