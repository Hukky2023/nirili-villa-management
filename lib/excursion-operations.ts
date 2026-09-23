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
 {code:'trip4',time:'11:00',endTime:'14:30',name:'Shark Snorkeling (Nurse Shark) + Turtle Snorkeling'},
 {code:'trip5',time:'13:00',endTime:'15:30',name:'Clown Fish Snorkeling + Manta Snorkeling'},
 {code:'trip6',time:'16:30',endTime:'19:30',name:'Dolphin Watching + Fishing with Dinner'}
];

const aliases:[RegExp,string][]=[
 [/fish\s*tank/i,'fish tank'],[/sand\s*bank|sandbank/i,'sandbank'],[/turtle/i,'turtle'],
 [/coral\s*garden/i,'coral garden'],[/nurse\s*shark|shark/i,'shark'],[/dolphin/i,'dolphin'],
 [/fishing/i,'fishing'],[/manta/i,'manta'],[/clown\s*fish|clone\s*fish/i,'clown fish']
];

export const normalizeExcursionName=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();

export function excursionComponents(value:any){
 const raw=normalizeExcursionName(value);
 if(raw==='special package')return ['turtle','shark','sandbank','coral garden','dolphin','fishing'];
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

const snorkelingComponents=new Set(['fish tank','turtle','coral garden','shark','manta','clown fish']);
export function isSnorkelingTrip(value:any){
 const source=normalizeExcursionName(value);
 if(/\bsnorkel/.test(source))return true;
 return excursionComponents(value).some(component=>snorkelingComponents.has(component));
}

export function isDroneRequiredTrip(value:any){
 const components=excursionComponents(value);
 return components.includes('shark')||components.includes('sandbank');
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


export const SPECIAL_PACKAGE_COMPONENTS=['turtle','shark','sandbank','coral garden','dolphin','fishing'] as const;
export type SpecialPackageComponent=typeof SPECIAL_PACKAGE_COMPONENTS[number];
export type SpecialPackageScheduleCandidate={
 id:string;date:string;time:string;endTime:string;name:string;remaining:number;[key:string]:any
};

export function specialPackageCoverage(name:any):SpecialPackageComponent[]{
 const offered=new Set(excursionComponents(name));
 return SPECIAL_PACKAGE_COMPONENTS.filter(component=>offered.has(component));
}

/**
 * Find the smallest set of non-overlapping departures that covers every Special Package component.
 * The caller supplies only open/future schedules and current remaining capacity.
 */
export function planSpecialPackageSchedules(candidates:SpecialPackageScheduleCandidate[],quantity:number){
 const pax=Math.max(1,Math.trunc(Number(quantity)||1));
 const bitFor=new Map(SPECIAL_PACKAGE_COMPONENTS.map((component,index)=>[component,1<<index]));
 const allMask=(1<<SPECIAL_PACKAGE_COMPONENTS.length)-1;
 const prepared=candidates.map(candidate=>{
  const coverage=specialPackageCoverage(candidate.name);
  const mask=coverage.reduce((value,component)=>value|(bitFor.get(component)||0),0);
  return {...candidate,coverage,mask};
 }).filter(candidate=>candidate.mask&&Number(candidate.remaining)>=pax&&validClockTime(candidate.time)&&validClockTime(candidate.endTime))
   .sort((a,b)=>{
    const ac=a.coverage.length,bc=b.coverage.length;
    return bc-ac||String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))||String(a.id).localeCompare(String(b.id));
   });
 if(!prepared.length)return null;

 const conflicts=(candidate:any,selected:any[])=>selected.some(other=>
  candidate.date===other.date&&timeRangesOverlap(candidate.time,candidate.endTime,other.time,other.endTime)
 );
 const finishKey=(selected:any[])=>selected.reduce((max,item)=>Math.max(max,Date.parse(item.date+'T'+item.endTime+':00Z')||0),0);
 const itineraryKey=(selected:any[])=>[...selected].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))).map(item=>String(item.date)+'T'+String(item.time)).join('|');
 let best:any[]|null=null;

 function better(next:any[]){
  if(!best)return true;
  if(next.length!==best.length)return next.length<best.length;
  const nk=itineraryKey(next),bk=itineraryKey(best);if(nk!==bk)return nk<bk;
  const nf=finishKey(next),bf=finishKey(best);if(nf!==bf)return nf<bf;
  return next.map(item=>item.id).sort().join('|')<best.map(item=>item.id).sort().join('|');
 }

 function search(mask:number,selected:any[]){
  if(mask===allMask){if(better(selected))best=[...selected];return;}
  if(best&&selected.length>=best.length)return;

  const uncovered=SPECIAL_PACKAGE_COMPONENTS.map((component,index)=>({component,index,bit:1<<index}))
   .filter(item=>(mask&item.bit)===0);
  let choice:any=null,options:any[]=[];
  for(const item of uncovered){
   const available=prepared.filter(candidate=>(candidate.mask&item.bit)!==0&&(candidate.mask&~mask)!==0&&!selected.some(value=>value.id===candidate.id)&&!conflicts(candidate,selected));
   if(!available.length)return;
   if(!choice||available.length<options.length){choice=item;options=available;if(available.length===1)break;}
  }
  options.sort((a,b)=>{
   const anew=a.coverage.filter((component:any)=>(mask&(bitFor.get(component)||0))===0).length;
   const bnew=b.coverage.filter((component:any)=>(mask&(bitFor.get(component)||0))===0).length;
   return String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))||bnew-anew;
  });
  for(const candidate of options)search(mask|candidate.mask,[...selected,candidate]);
 }
 search(0,[]);
 if(!best)return null;
 return [...best].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))).map(item=>({
  ...item,
  coverage:item.coverage as SpecialPackageComponent[]
 }));
}

export function fridayExcursionBlackout(date:any,time:any,endTime:any){
 if(typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return false;
 const day=new Date(date+'T00:00:00Z');
 if(Number.isNaN(day.getTime())||day.getUTCDay()!==5)return false;
 if(!validClockTime(time)||!validClockTime(endTime))return false;
 const start=clockMinutes(time),end=clockMinutes(endTime);
 const blackoutStart=11*60,blackoutEnd=13*60+30;
 return start<blackoutEnd&&end>blackoutStart;
}

export const fridayExcursionBlackoutMessage='Friday 11:00 AM–1:30 PM is blocked for excursion operations. Choose a trip that finishes by 11:00 AM or starts at/after 1:30 PM.';

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
  .sort((a,b)=>a.time.localeCompare(b.time)||scheduleMatchRank(name,a.name)-scheduleMatchRank(name,b.name));
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


export function goproConflict(
 schedules:any[],
 input:{date:string;time:string;endTime:string;goproId:string;vesselId?:string;excludeId?:string;sharedGroup?:string}
){
 if(!input.goproId)return null;
 return schedules.find((other:any)=>{
  if(!other||other.id===input.excludeId||other.status==='Cancelled'||other.date!==input.date||other.goproId!==input.goproId)return false;
  const otherEnd=other.endTime||inferTripEndTime(other.name,other.time);
  const sameShared=!!input.sharedGroup&&input.sharedGroup===other.sharedGroup&&input.time===other.time&&input.endTime===otherEnd;
  const sameVesselDeparture=!!input.vesselId&&other.vesselId===input.vesselId&&input.time===other.time&&input.endTime===otherEnd;
  if(sameShared||sameVesselDeparture)return false;
  return timeRangesOverlap(input.time,input.endTime,other.time,otherEnd);
 })||null;
}


export function droneConflict(
 schedules:any[],
 input:{date:string;time:string;endTime:string;droneId:string;vesselId?:string;excludeId?:string;sharedGroup?:string}
){
 if(!input.droneId)return null;
 return schedules.find((other:any)=>{
  if(!other||other.id===input.excludeId||other.status==='Cancelled'||other.date!==input.date||other.droneId!==input.droneId)return false;
  const otherEnd=other.endTime||inferTripEndTime(other.name,other.time);
  const sameShared=!!input.sharedGroup&&input.sharedGroup===other.sharedGroup&&input.time===other.time&&input.endTime===otherEnd;
  const sameVesselDeparture=!!input.vesselId&&other.vesselId===input.vesselId&&input.time===other.time&&input.endTime===otherEnd;
  if(sameShared||sameVesselDeparture)return false;
  return timeRangesOverlap(input.time,input.endTime,other.time,otherEnd);
 })||null;
}


function autoAssignmentNormal(value:any){return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();}
function autoAssignmentMatches(order:any,schedule:any){
 if(order.kind!=='excursion'||order.status==='Cancelled'||order.approvalStatus==='Declined'||order.approvalStatus==='Cancelled')return false;
 if(order.scheduleId)return order.scheduleId===schedule.id&&(order.date||order.schedule?.date)===schedule.date;
 const stored=order.schedule||{};
 return (stored.date||order.date)===schedule.date&&stored.time===schedule.time&&(!schedule.vesselId||stored.vesselId===schedule.vesselId)&&autoAssignmentNormal(order.name)===autoAssignmentNormal(schedule.name);
}
function autoAssignmentSharedKey(schedule:any){
 return schedule.sharedGroup?schedule.date+'|'+schedule.time+'|group:'+schedule.sharedGroup:schedule.vesselId?schedule.date+'|'+schedule.time+'|vessel:'+schedule.vesselId:'';
}
export function excursionScheduleLoadForOrder(schedule:any,allSchedules:any[],orders:any[],excludeOrderId=''){
 const key=autoAssignmentSharedKey(schedule);
 const groupSchedules=key?allSchedules.filter((item:any)=>autoAssignmentSharedKey(item)===key):[schedule];
 const groupIds=new Set(groupSchedules.map((item:any)=>item.id));
 const capacity=Math.min(...groupSchedules.map((item:any)=>Math.max(1,Number(item.capacity)||1)));
 const confirmedPax=orders
  .filter((order:any)=>order.id!==excludeOrderId&&order.kind==='excursion'&&!order.separateVessel&&order.status!=='Cancelled'&&order.approvalStatus!=='Pending'&&order.approvalStatus!=='Declined'&&order.approvalStatus!=='Cancelled'&&(groupIds.has(order.scheduleId)||groupSchedules.some((item:any)=>autoAssignmentMatches(order,item))))
  .reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quantity)||0),0);
 return {capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax)};
}
export function chooseAutoAssignmentCandidate(order:any,allSchedules:any[],orders:any[]){
 if(!order||order.kind!=='excursion'||!order.date||order.privateBoatRequested===true||order.specialPackage===true||order.packageGroupId)return null;
 const quantity=Math.max(1,Number(order.quantity)||1);
 const candidates=allSchedules
  .filter((schedule:any)=>schedule.status==='Open'&&scheduleCanServeRequest(order.name,schedule.name))
  .map((schedule:any)=>({schedule,...excursionScheduleLoadForOrder(schedule,allSchedules,orders||[],order.id),rank:scheduleMatchRank(order.name,schedule.name)}))
  .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||String(a.schedule.time).localeCompare(String(b.schedule.time))||a.rank-b.rank||b.remaining-a.remaining);
 return candidates.find((candidate:any)=>candidate.remaining>=quantity)||null;
}
