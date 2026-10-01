// Speedboat ledger. Departures (sailings) belong to independent speedboat operators, who
// publish their own times, fares and seats, then accept each ticket onto one of their boats and
// board the passengers at departure. Sailings without an operatorId are Nirili's own legacy
// departures and keep working as before.
export type Boat={id:string;operatorId:string;name:string;registration:string;capacity:number;active:boolean;createdAt:string;updatedAt:string};
export type Sailing={id:string;boat:string;from:string;to:string;depart:string;arrive:string;capacity:number;fare:number;roomFare?:number;active:boolean;
 operatorId?:string;operatorName?:string;
 // Days the departure runs, 0 = Sunday … 6 = Saturday. Missing or empty means every day.
 days?:number[]};
export type TicketStatus='New'|'Accepted'|'Declined';
export type Journey={scheduleId:string;date:string;seats:number[];boat:string;from:string;to:string;depart:string;arrive:string;fare:number;roomFare?:number;
 operatorId?:string;operatorName?:string;operatorStatus?:TicketStatus;
 boatId?:string;boatName?:string;acceptedAt?:string;acceptedBy?:string;declinedAt?:string;declineReason?:string;
 boardedPax?:number;boardedAt?:string;noShow?:boolean;departedAt?:string};
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
 return s;
}

// A ticket holds seats unless the booking is cancelled or the operator declined that journey.
export const journeyLive=(booking:TransferBooking,journey:Journey)=>booking.status!=='Cancelled'&&journey.operatorStatus!=='Declined';
export function occupied(state:TransportState,scheduleId:string,date:string){return state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===scheduleId&&j.date===date).flatMap(j=>j.seats));}
export function bookedPassengers(state:TransportState,scheduleId:string,date:string,excludeId=''){
 return state.bookings.filter(b=>b.id!==excludeId&&b.journeys.some(j=>journeyLive(b,j)&&j.scheduleId===scheduleId&&j.date===date)).reduce((n,b)=>n+b.adults+b.children+b.infants,0);
}
export const weekday=(date:string)=>new Date(date+'T00:00:00Z').getUTCDay();
export const runsOn=(sailing:Sailing,date:string)=>!Array.isArray(sailing.days)||sailing.days.length===0||sailing.days.includes(weekday(date));

// Every way of booking a seat builds the journey here, so operator tickets always start as New.
export function journeyFor(sailing:Sailing,date:string,seats:number[]):Journey{
 return {scheduleId:sailing.id,date,seats,boat:sailing.boat,from:sailing.from,to:sailing.to,depart:sailing.depart,arrive:sailing.arrive,fare:sailing.fare,
  ...(Number.isInteger(sailing.roomFare)?{roomFare:sailing.roomFare}:{}),
  ...(sailing.operatorId?{operatorId:sailing.operatorId,operatorName:sailing.operatorName||sailing.boat,operatorStatus:'New' as TicketStatus}:{})};
}
export function addHistory(booking:TransferBooking,by:string,action:string,detail=''){
 booking.history??=[];booking.history.push({at:new Date().toISOString(),by,action,...(detail?{detail}:{})});
}

const dateValid=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const short=(x:any,n:number)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export function createTransfer(state:TransportState,b:any,owner:string):TransferBooking{
 if(!short(b.token,100)||!short(b.name,120)||!short(b.phone,80)||!['Local','Expat','Tourist'].includes(b.traveller)||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Enter your name, contact number and passenger type.');
 if(![b.adults,b.children,b.infants].every(n=>Number.isInteger(n)&&n>=0&&n<=20)||b.adults<1||b.adults+b.children+b.infants>20)throw Error('Choose between 1 and 20 passengers, including at least one adult.');
 if(!Array.isArray(b.journeys)||b.journeys.length<1||b.journeys.length>2)throw Error('Choose your journeys.');
 const journeys:Journey[]=b.journeys.map((j:any)=>{
 const s=state.sailings.find(s=>s.id===j.scheduleId&&s.active);if(!s)throw Error('This departure is unavailable. Search again.');
 if(!dateValid(j.date)||Date.parse(j.date+'T'+s.depart+':00+05:00')<=Date.now())throw Error('Select a future departure.');
 if(!runsOn(s,j.date))throw Error('This departure does not run on the selected day. Choose another date or time.');
 if(!Array.isArray(j.seats)||j.seats.length!==b.adults+b.children||new Set(j.seats).size!==j.seats.length||j.seats.some((n:any)=>!Number.isInteger(n)||n<1||n>s.capacity))throw Error('Select one seat per adult and child.');
 const taken=occupied(state,s.id,j.date);if(j.seats.some((n:number)=>taken.includes(n)))throw Error('A selected seat was just booked. Search again and choose another seat.');
 if(bookedPassengers(state,s.id,j.date)+b.adults+b.children+b.infants>s.capacity)throw Error('This departure does not have enough passenger capacity.');
 return journeyFor(s,j.date,j.seats);});
 if(journeys.length===2){const [a,z]=journeys;if(a.from!==z.to||a.to!==z.from||z.date+'T'+z.depart<=a.date+'T'+a.arrive)throw Error('The return journey must depart after arrival and reverse your route.');}
 const total=journeys.reduce((n,j)=>n+j.fare*b.adults+Math.round(j.fare/2)*b.children,0);
 if(b.expectedTotal!==total)throw Error('The fare changed. Review the current total and try again.');
 return {id:'NT-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,owner,name:b.name.trim(),phone:b.phone.trim(),traveller:b.traveller,adults:b.adults,children:b.children,infants:b.infants,journeys,total,status:'Confirmed',paid:false,checked:[],created:new Date().toISOString(),notes:b.notes};
}

// Next free seat numbers for a party (seat numbers are ticket slots; the operator picks the boat).
export function freeSeats(state:TransportState,sailing:Sailing,date:string,count:number,excludeId=''){
 const used=new Set(state.bookings.filter(b=>b.id!==excludeId).flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.scheduleId===sailing.id&&j.date===date).flatMap(j=>j.seats)));
 const out:number[]=[];
 for(let n=1;n<=sailing.capacity&&out.length<count;n++)if(!used.has(n))out.push(n);
 return out.length===count?out:null;
}
