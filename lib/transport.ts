export type Sailing={id:string;boat:string;from:string;to:string;depart:string;arrive:string;capacity:number;fare:number;roomFare?:number;active:boolean};
export type Journey={scheduleId:string;date:string;seats:number[];boat:string;from:string;to:string;depart:string;arrive:string;fare:number};
export type TransferBooking={id:string;token:string;owner:string;name:string;phone:string;traveller:string;adults:number;children:number;infants:number;journeys:Journey[];total:number;status:'Confirmed'|'Cancelled'|'Requested';paid:boolean;checked:string[];created:string;notes:string;stayId?:string;room?:string;roomCents?:number};
export type TransportState={sailings:Sailing[];bookings:TransferBooking[]};
export const transportToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const transferMoney=(c:number)=>'MVR '+(c/100).toFixed(2);
export function initialTransport():TransportState{return {sailings:[['07:30','08:25','Nirili Express',20000],['13:30','14:20','Nirili Express',20000],['16:30','17:25','Coral Speed',22500],['22:15','23:10','Nirili Night',25000]].flatMap((s,i)=>[false,true].map(reverse=>({id:'nv-'+i+(reverse?'-return':''),boat:String(s[2]),from:reverse?'Velana Airport':'Dhiffushi',to:reverse?'Dhiffushi':'Velana Airport',depart:String(s[0]),arrive:String(s[1]),capacity:36,fare:Number(s[3]),active:false}))),bookings:[]};}
export function occupied(state:TransportState,scheduleId:string,date:string){return state.bookings.filter(b=>b.status!=='Cancelled').flatMap(b=>b.journeys.filter(j=>j.scheduleId===scheduleId&&j.date===date).flatMap(j=>j.seats));}
const dateValid=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const short=(x:any,n:number)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
export function createTransfer(state:TransportState,b:any,owner:string):TransferBooking{
 if(!short(b.token,100)||!short(b.name,120)||!short(b.phone,80)||!['Local','Expat','Tourist'].includes(b.traveller)||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Enter your name, contact number and passenger type.');
 if(![b.adults,b.children,b.infants].every(n=>Number.isInteger(n)&&n>=0&&n<=20)||b.adults<1||b.adults+b.children+b.infants>20)throw Error('Choose between 1 and 20 passengers, including at least one adult.');
 if(!Array.isArray(b.journeys)||b.journeys.length<1||b.journeys.length>2)throw Error('Choose your journeys.');
 const journeys:Journey[]=b.journeys.map((j:any)=>{
 const s=state.sailings.find(s=>s.id===j.scheduleId&&s.active);if(!s)throw Error('This departure is unavailable. Search again.');
 if(!dateValid(j.date)||Date.parse(j.date+'T'+s.depart+':00+05:00')<=Date.now())throw Error('Select a future departure.');
 if(!Array.isArray(j.seats)||j.seats.length!==b.adults+b.children||new Set(j.seats).size!==j.seats.length||j.seats.some((n:any)=>!Number.isInteger(n)||n<1||n>s.capacity))throw Error('Select one seat per adult and child.');
 const taken=occupied(state,s.id,j.date);if(j.seats.some((n:number)=>taken.includes(n)))throw Error('A selected seat was just booked. Search again and choose another seat.');
 const already=state.bookings.filter(x=>x.status!=='Cancelled'&&x.journeys.some(z=>z.scheduleId===s.id&&z.date===j.date)).reduce((n,x)=>n+x.adults+x.children+x.infants,0);
 if(already+b.adults+b.children+b.infants>s.capacity)throw Error('This departure does not have enough passenger capacity.');
 return {scheduleId:s.id,date:j.date,seats:j.seats,boat:s.boat,from:s.from,to:s.to,depart:s.depart,arrive:s.arrive,fare:s.fare};});
 if(journeys.length===2){const [a,z]=journeys;if(a.from!==z.to||a.to!==z.from||z.date+'T'+z.depart<=a.date+'T'+a.arrive)throw Error('The return journey must depart after arrival and reverse your route.');}
 const total=journeys.reduce((n,j)=>n+j.fare*b.adults+Math.round(j.fare/2)*b.children,0);
 if(b.expectedTotal!==total)throw Error('The fare changed. Review the current total and try again.');
 return {id:'NT-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,owner,name:b.name.trim(),phone:b.phone.trim(),traveller:b.traveller,adults:b.adults,children:b.children,infants:b.infants,journeys,total,status:'Confirmed',paid:false,checked:[],created:new Date().toISOString(),notes:b.notes};
}
