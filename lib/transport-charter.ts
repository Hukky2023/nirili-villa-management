import {addHistory,runsOn,TRAVELLERS,tripBoat,type Boat,type Charter,type CharterRate,type TransportState} from './transport';

// Private speedboat charters, as on ODI's "Private Charter" tab. An operator publishes a price
// per route for a whole boat and how long the boat is out. A guest searches a route, date, time
// and group size, sees the operators with a suitable boat free at that time, and sends a
// request. The operator confirms it with one of their boats (checked against scheduled trips
// and other charters) or declines it. Guests pay the operator; Nirili earns its commission.
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/,DATE=/^\d{4}-\d{2}-\d{2}$/;
const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const starts=(c:{date:string;time:string})=>Date.parse(c.date+'T'+c.time+':00+05:00');
export const MAX_CHARTER_PAX=60;
type OperatorRef={id:string;name:string};

// ---- When is a boat busy?
// A charter keeps its boat from its start time for blockMin minutes (capped at midnight).
const window=(time:string,blockMin:number)=>({start:minutes(time),end:Math.min(24*60,minutes(time)+blockMin)});
const overlaps=(a:{start:number;end:number},b:{start:number;end:number})=>a.start<b.end&&b.start<a.end;
export function charterOnBoat(state:TransportState,boatId:string,date:string,span:{start:number;end:number},ignoreId=''){
 return (state.charters||[]).find(c=>c.id!==ignoreId&&c.status==='Confirmed'&&c.boatId===boatId&&c.date===date&&overlaps(window(c.time,c.blockMin),span));
}
export function boatBusy(state:TransportState,boatId:string,date:string,time:string,blockMin:number,ignoreId=''){
 const span=window(time,blockMin);
 const trip=state.sailings.find(s=>s.active&&runsOn(s,date)&&tripBoat(state,s,date)?.id===boatId&&overlaps({start:minutes(s.depart),end:minutes(s.arrive)},span));
 if(trip)return 'the '+trip.depart+' '+trip.from+' → '+trip.to+' trip';
 const charter=charterOnBoat(state,boatId,date,span,ignoreId);
 return charter?'a '+charter.time+' charter':'';
}

// ---- Rates (operator)
export const operatorCharterRates=(state:TransportState,operatorId:string)=>(state.charterRates||[]).filter(r=>r.operatorId===operatorId);
export function saveCharterRate(state:TransportState,operator:OperatorRef,input:any):CharterRate{
 state.charterRates??=[];
 const from=text(input?.from,60),to=text(input?.to,60),price=Number(input?.price),blockMin=Number(input?.blockMin);
 if(!from||!to||same(from,to))throw Error('Choose where the charter starts and where it goes.');
 if(!Number.isInteger(price)||price<=0||price>100000000)throw Error('Enter the charter price for the whole boat in MVR.');
 if(!Number.isInteger(blockMin)||blockMin<15||blockMin>720)throw Error('Enter how long the boat is out, between 15 minutes and 12 hours.');
 const own=(state.boats||[]).filter(b=>b.operatorId===operator.id);
 const boatIds=[...new Set((Array.isArray(input?.boatIds)?input.boatIds:[]).map(String))] as string[];
 if(boatIds.some(id=>!own.some(b=>b.id===id)))throw Error('Choose boats from your own fleet.');
 if(!own.some(b=>b.active&&(!boatIds.length||boatIds.includes(b.id))))throw Error('Add a boat in service before offering charters.');
 const id=text(input?.id,60),now=new Date().toISOString(),previous=id?state.charterRates.find(r=>r.id===id&&r.operatorId===operator.id):undefined;
 if(id&&!previous)throw Error('Charter route not found.');
 const rate:CharterRate={id:previous?.id||'CR-'+crypto.randomUUID().slice(0,8).toUpperCase(),operatorId:operator.id,operatorName:operator.name,from,to,price,blockMin,boatIds,
  active:input?.active!==false,note:text(input?.note,300),createdAt:previous?.createdAt||now,updatedAt:now};
 state.charterRates=previous?state.charterRates.map(r=>r.id===rate.id?rate:r):[...state.charterRates,rate];
 return rate;
}

// ---- Search and request (guests, partners)
const eligibleBoats=(state:TransportState,rate:CharterRate,pax:number)=>(state.boats||[]).filter(b=>b.operatorId===rate.operatorId&&b.active&&(!rate.boatIds.length||rate.boatIds.includes(b.id))&&b.capacity>=pax);
const freeBoat=(state:TransportState,rate:CharterRate,date:string,time:string,pax:number,ignoreId='')=>eligibleBoats(state,rate,pax).find(b=>!boatBusy(state,b.id,date,time,rate.blockMin,ignoreId));
export function publicCharterRates(state:TransportState){
 return (state.charterRates||[]).filter(r=>r.active).map(r=>({id:r.id,operatorName:r.operatorName,from:r.from,to:r.to,price:r.price,blockMin:r.blockMin,note:r.note||'',
  maxPax:Math.max(0,...eligibleBoats(state,r,1).map(b=>b.capacity))})).filter(r=>r.maxPax>0);
}
function checkTrip(date:string,time:string,pax:number){
 if(!DATE.test(date)||!TIME.test(time))throw Error('Choose the charter date and start time.');
 if(starts({date,time})<Date.now()+60*60*1000)throw Error('Charters must start at least one hour from now.');
 if(!Number.isInteger(pax)||pax<1||pax>MAX_CHARTER_PAX)throw Error('Enter how many people are travelling (1–'+MAX_CHARTER_PAX+').');
}
export function searchCharters(state:TransportState,input:any){
 const from=text(input?.from,60),to=text(input?.to,60),date=String(input?.date||''),time=String(input?.time||''),pax=Number(input?.pax);
 checkTrip(date,time,pax);
 return (state.charterRates||[]).filter(r=>r.active&&same(r.from,from)&&same(r.to,to)).map(r=>{
  const boat=freeBoat(state,r,date,time,pax);
  return boat?{rateId:r.id,operatorName:r.operatorName,from:r.from,to:r.to,price:r.price,blockMin:r.blockMin,note:r.note||'',maxPax:Math.max(...eligibleBoats(state,r,pax).map(b=>b.capacity))}:null;
 }).filter(Boolean).sort((a,b)=>a!.price-b!.price);
}
export function requestCharter(state:TransportState,input:any,owner:string,source='Website'):Charter{
 const rate=(state.charterRates||[]).find(r=>r.id===String(input?.rateId||'')&&r.active);
 if(!rate)throw Error('This charter is no longer offered. Search again.');
 const date=String(input?.date||''),time=String(input?.time||''),pax=Number(input?.pax);
 checkTrip(date,time,pax);
 const name=text(input?.name,120),phone=String(input?.phone||'').replace(/[\s()-]/g,'').slice(0,30),notes=text(input?.notes,1000);
 const traveller=TRAVELLERS.includes(input?.traveller)?input.traveller:'Tourist';
 if(!name||!/^\+?\d{7,15}$/.test(phone))throw Error('Enter your name and WhatsApp number so the operator can confirm.');
 if(input?.expectedPrice!==rate.price)throw Error('The charter price changed. Review it and try again.');
 if(!freeBoat(state,rate,date,time,pax))throw Error('No boat is free for your group at that time any more. Choose another time.');
 const charter:Charter={id:'CH-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:text(input?.token,100),owner,rateId:rate.id,operatorId:rate.operatorId,operatorName:rate.operatorName,
  from:rate.from,to:rate.to,date,time,blockMin:rate.blockMin,pax,name,phone,traveller,notes,price:rate.price,status:'Requested',source,created:new Date().toISOString()};
 addHistory(charter as any,source==='Partner'?'partner':'guest','Requested',source);
 state.charters??=[];state.charters.push(charter);
 return charter;
}

// ---- Operator handling
function own(state:TransportState,operatorId:string,id:string){
 const charter=(state.charters||[]).find(c=>c.id===id&&c.operatorId===operatorId);
 if(!charter)throw Error('Charter not found.');
 return charter;
}
export const operatorCharters=(state:TransportState,operatorId:string)=>(state.charters||[]).filter(c=>c.operatorId===operatorId)
 .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
export function confirmCharter(state:TransportState,operatorId:string,id:string,boatId:string,by:string){
 const charter=own(state,operatorId,id);
 if(!['Requested','Confirmed'].includes(charter.status))throw Error('This charter is '+charter.status.toLowerCase()+'.');
 if(starts(charter)<=Date.now())throw Error('This charter time has passed.');
 const boat=(state.boats||[]).find(b=>b.id===boatId&&b.operatorId===operatorId) as Boat|undefined;
 if(!boat||!boat.active)throw Error('Choose one of your boats in service.');
 if(boat.capacity<charter.pax)throw Error(boat.name+' has '+boat.capacity+' seats; this group is '+charter.pax+'.');
 const busy=boatBusy(state,boat.id,charter.date,charter.time,charter.blockMin,charter.id);
 if(busy)throw Error(boat.name+' is already on '+busy+' at that time.');
 const moved=charter.status==='Confirmed';
 Object.assign(charter,{status:'Confirmed',boatId:boat.id,boatName:boat.name});
 addHistory(charter as any,by,moved?'Boat changed':'Confirmed',boat.name);
 return charter;
}
export function declineCharter(state:TransportState,operatorId:string,id:string,reason:string,by:string){
 const charter=own(state,operatorId,id);
 if(!['Requested','Confirmed'].includes(charter.status))throw Error('This charter is '+charter.status.toLowerCase()+'.');
 const note=text(reason,300);
 if(!note)throw Error('Tell the guest and Nirili why, e.g. weather or no boat free.');
 const was=charter.status;
 Object.assign(charter,{status:was==='Requested'?'Declined':'Cancelled',reason:note});
 addHistory(charter as any,by,was==='Requested'?'Declined':'Cancelled by operator',note);
 return charter;
}
export function setCharterCrew(state:TransportState,operatorId:string,id:string,crewIds:any,valid:Set<string>){
 const charter=own(state,operatorId,id);
 const ids=[...new Set((Array.isArray(crewIds)?crewIds:[]).map(String))] as string[];
 if(ids.some(x=>!valid.has(x)))throw Error('Choose crew members from your own active crew.');
 charter.crewIds=ids;
 return charter;
}
export function completeCharter(state:TransportState,operatorId:string,id:string,by:string,today:string){
 const charter=own(state,operatorId,id);
 if(charter.status!=='Confirmed')throw Error('Only a confirmed charter can be completed.');
 if(charter.date>today)throw Error('You can complete a charter on the day it runs.');
 Object.assign(charter,{status:'Completed',completedAt:new Date().toISOString()});
 addHistory(charter as any,by,'Completed',charter.boatName||'');
 return charter;
}

// Charters in a month that count for commission: completed ones.
export function charterStatement(state:TransportState,operatorId:string,month:string,rate:number){
 return operatorCharters(state,operatorId).filter(c=>c.status==='Completed'&&c.date.startsWith(month)).map(c=>({id:c.id,date:c.date,time:c.time,route:c.from+' → '+c.to,boat:c.boatName||'',guest:c.name,pax:c.pax,
  priceMvr:c.price,commissionMvr:Math.round(c.price*rate)}));
}
