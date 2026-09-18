export const PRIVATE_BOAT_SURCHARGE_CENTS=5000;

export type StandardExcursionTrip={
 code:string;
 time:string;
 endTime:string;
 name:string;
};

export const standardExcursionTrips:StandardExcursionTrip[]=[
 {code:'trip1',time:'07:00',endTime:'10:30',name:'Fish Tank Snorkeling + Sandbank Trip'},
 {code:'trip2',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling'},
 {code:'trip3',time:'10:30',endTime:'12:30',name:'Sandbank Trip + Turtle Snorkeling'},
 {code:'trip4',time:'11:00',endTime:'14:30',name:'Shark Snorkeling + Turtle Snorkeling'},
 {code:'trip5',time:'13:00',endTime:'15:30',name:'Clown Fish Snorkeling + Manta Snorkeling'},
 {code:'trip6',time:'16:30',endTime:'19:30',name:'Dolphin Watching + Fishing'}
];

const aliases:[RegExp,string][]=[
 [/fish\s*tank/i,'fish tank'],[/sand\s*bank|sandbank/i,'sandbank'],[/turtle/i,'turtle'],
 [/coral\s*garden/i,'coral garden'],[/nurse\s*shark|shark/i,'shark'],[/dolphin/i,'dolphin'],
 [/fishing/i,'fishing'],[/manta/i,'manta'],[/clown\s*fish|clone\s*fish/i,'clown fish']
];

export const normalizeExcursionName=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();

export function excursionComponents(value:any){
 const source=String(value||'').toLowerCase().replace(/\([^)]*\)/g,' ');
 const parts=source.split('+').map(part=>part.trim()).filter(Boolean);
 const found:string[]=[];
 for(const part of parts.length?parts:[source]){
  let hit=false;
  for(const [pattern,label] of aliases){
   if(pattern.test(part)){if(!found.includes(label))found.push(label);hit=true;break;}
  }
  if(!hit){
   const cleaned=part.replace(/\b(only|trip|watching|snorkeling)\b/g,' ').replace(/\s+/g,' ').trim();
   if(cleaned&&!found.includes(cleaned))found.push(cleaned);
  }
 }
 return found;
}

export function isDolphinOnly(value:any){
 const parts=excursionComponents(value);
 return parts.length===1&&parts[0]==='dolphin';
}

export function scheduleCanServeRequest(requestName:any,scheduleName:any){
 const wanted=excursionComponents(requestName),offered=excursionComponents(scheduleName);
 if(!wanted.length)return false;
 // Dolphin-only guests must travel on their own dedicated trip, never on Trip 6.
 if(isDolphinOnly(requestName))return isDolphinOnly(scheduleName);
 return wanted.every(component=>offered.includes(component));
}

export function scheduleMatchRank(requestName:any,scheduleName:any){
 const wanted=excursionComponents(requestName),offered=excursionComponents(scheduleName);
 return Math.max(0,offered.length-wanted.length);
}

export function validClockTime(value:any){
 return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function clockMinutes(value:any){
 if(!validClockTime(value))return -1;
 const [hour,minute]=String(value).split(':').map(Number);
 return hour*60+minute;
}

export function timeRangesOverlap(startA:string,endA:string,startB:string,endB:string){
 const a1=clockMinutes(startA),a2=clockMinutes(endA),b1=clockMinutes(startB),b2=clockMinutes(endB);
 if([a1,a2,b1,b2].some(value=>value<0))return false;
 return a1<b2&&b1<a2;
}

export function inferTripEndTime(name:any,startTime:any){
 const exact=standardExcursionTrips.find(trip=>trip.time===startTime&&scheduleCanServeRequest(name,trip.name)&&scheduleCanServeRequest(trip.name,name));
 if(exact)return exact.endTime;
 const compatible=standardExcursionTrips.find(trip=>trip.time===startTime&&scheduleCanServeRequest(name,trip.name));
 if(compatible)return compatible.endTime;
 if(isDolphinOnly(name)&&startTime==='16:30')return '18:00';
 const start=clockMinutes(startTime);
 if(start<0)return '';
 const end=Math.min(23*60+59,start+120);
 return String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
}

export function suggestedTripWindow(name:any){
 if(isDolphinOnly(name))return {time:'16:30',endTime:'18:00',dedicated:true};
 const candidates=standardExcursionTrips
  .filter(trip=>scheduleCanServeRequest(name,trip.name))
  .sort((a,b)=>scheduleMatchRank(name,a.name)-scheduleMatchRank(name,b.name)||a.time.localeCompare(b.time));
 const trip=candidates[0];
 return trip?{time:trip.time,endTime:trip.endTime,dedicated:false}:{time:'09:00',endTime:'11:00',dedicated:false};
}

export function vesselConflict(
 schedules:any[],
 input:{date:string;time:string;endTime:string;vesselId:string;excludeId?:string;sharedGroup?:string}
){
 if(!input.vesselId)return null;
 return schedules.find((other:any)=>{
  if(!other||other.id===input.excludeId||other.status==='Cancelled'||other.date!==input.date||other.vesselId!==input.vesselId)return false;
  const sameShared=!!input.sharedGroup&&input.sharedGroup===other.sharedGroup&&input.time===other.time&&input.endTime===(other.endTime||inferTripEndTime(other.name,other.time));
  if(sameShared)return false;
  const otherEnd=other.endTime||inferTripEndTime(other.name,other.time);
  return timeRangesOverlap(input.time,input.endTime,other.time,otherEnd);
 })||null;
}
