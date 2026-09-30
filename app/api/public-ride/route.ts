import {limit,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {islandToday} from '../../../lib/guest-catalog';
import {emitAdminNotification} from '../../../lib/admin-notifications';
import {PUBLIC_RIDE,activeOnDemandRide} from '../../../lib/buggy-rides';

// Nirili Ride for everyone (ride.nirilihotels.com). Requests join the same buggy dispatch as
// in-house guest rides; there is no room bill, so the fare is paid to the driver.
const headers={'Cache-Control':'no-store'};
const phonePattern=/^\+[1-9]\d{7,14}$/;
const MAX_PASSENGERS=6;

const text=(value:any,max:number)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
function maldivesClock(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'00';
 return get('hour')+':'+get('minute');
}
const fareFor=(state:any)=>Math.max(0,Number(state.buggySettings?.guestRideFareCents)||0);

// What the rider may see: no other guests' details, no internal notes.
function publicView(state:any,ride:any){
 const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===ride.buggyId);
 return {id:ride.id,status:ride.cancelled?'Cancelled':String(ride.buggyStatus||'Requested'),location:ride.location,destination:ride.destination,quantity:ride.quantity,pickupTime:ride.pickupTime,date:ride.date,fareCents:Math.max(0,Number(ride.fareCents)||0),buggyName:buggy?.name||'',driver:ride.buggyDriver||'',canCancel:!ride.cancelled&&!['On trip','Completed','Cancelled'].includes(String(ride.buggyStatus||''))};
}
function findRide(state:any,id:string,key:string){
 if(!/^BUG-[A-F0-9]{8}$/.test(id)||!/^[a-f0-9]{32}$/.test(key))return null;
 return (state.buggyBookings||[]).find((x:any)=>x.id===id&&x.bookingType===PUBLIC_RIDE&&x.rideKey===key)||null;
}
function releaseBuggyIfIdle(state:any,ride:any){
 if(!ride?.buggyId)return;
 const busy=(state.buggyBookings||[]).some((x:any)=>x.id!==ride.id&&x.buggyId===ride.buggyId&&activeOnDemandRide(x));
 if(!busy){const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===ride.buggyId);if(buggy&&buggy.status==='Assigned'){buggy.status='Available';buggy.updatedAt=new Date().toISOString();}}
}

export async function GET(request:Request){
 try{
  const url=new URL(request.url),{state}=await loadStays();
  const id=text(url.searchParams.get('id'),20),key=text(url.searchParams.get('key'),40);
  if(id||key){
   const ride=findRide(state,id,key);
   if(!ride)return Response.json({error:'We could not find this ride.'},{status:404,headers});
   return Response.json({ride:publicView(state,ride)},{headers});
  }
  return Response.json({fareCents:fareFor(state),maxPassengers:MAX_PASSENGERS},{headers});
 }catch{return Response.json({error:'Nirili Ride is temporarily unavailable. Please message us on WhatsApp.'},{status:503,headers});}
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await request.json(),action=String(body.action||'request');
  if(action==='cancel')return await cancel(body);
  const name=text(body.name,100),phone=cleanPhone(body.phone),location=text(body.location,150),destination=text(body.destination,150),notes=text(body.notes,500),quantity=Number(body.quantity),token=String(body.token||'');
  if(!name||!phonePattern.test(phone))throw Error('Enter your name and WhatsApp number with country code, e.g. +960 7XX XXXX.');
  if(!location||!destination||location.toLowerCase()===destination.toLowerCase())throw Error('Enter different pickup and drop-off points.');
  if(!Number.isInteger(quantity)||quantity<1||quantity>MAX_PASSENGERS)throw Error('Choose between 1 and '+MAX_PASSENGERS+' passengers.');
  if(!/^[a-f0-9-]{20,80}$/i.test(token))throw Error('Refresh the page and try again.');
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('public-ride-ip:'+ip,8,3600000)||!await limit('public-ride-phone:'+phone,5,3600000))throw Error('Too many ride requests. Please message us on WhatsApp.');

  for(let attempt=0;attempt<3;attempt++){
   const {state,revision}=await loadStays();
   state.buggyBookings??=[];state.buggyFleet??=[];state.buggyTripHistory??=[];
   const repeat=state.buggyBookings.find((x:any)=>x.bookingType===PUBLIC_RIDE&&x.token===token);
   if(repeat)return Response.json({ride:publicView(state,repeat),key:repeat.rideKey},{headers});
   if(state.buggyBookings.some((x:any)=>x.bookingType===PUBLIC_RIDE&&x.phone===phone&&activeOnDemandRide(x)))throw Error('This number already has an active ride. Follow it on this page or message us on WhatsApp.');

   const now=new Date().toISOString(),rideKey=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
   const ride:any={id:'BUG-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),token,rideKey,bookingType:PUBLIC_RIDE,guest:name,phone,room:'',date:islandToday(),pickupTime:maldivesClock(),location,destination,quantity,notes,chargeToRoom:false,fareCents:fareFor(state),buggyStatus:'Requested',createdAt:now,createdBy:'public:ride.nirilihotels.com'};
   // Same auto-dispatch as in-house guest rides.
   const buggy=state.buggyFleet.find((x:any)=>x.status==='Available'&&Math.max(1,Number(x.capacity)||4)>=quantity);
   if(buggy){
    Object.assign(ride,{buggyId:buggy.id,buggyDriver:buggy.driver||'',buggyAssignedAt:now,buggyAssignedBy:'auto-dispatch',buggyStatus:'Assigned'});
    Object.assign(buggy,{status:'Assigned',updatedAt:now,updatedBy:'auto-dispatch'});
    state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Auto assigned',buggyId:buggy.id,buggyName:buggy.name,bookingId:ride.id,guest:name,driver:ride.buggyDriver,by:'Nirili Ride request'});
   }
   state.buggyBookings.push(ride);
   state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Requested',buggyId:ride.buggyId||'',buggyName:buggy?.name||'',bookingId:ride.id,guest:name,driver:ride.buggyDriver||'',by:'Nirili Ride'});
   if(!await saveStayAccess(state,revision,'public-ride'))continue;
   try{await emitAdminNotification({id:'buggy:new:'+ride.id,type:'buggy',title:'New Nirili Ride request',detail:name+' · '+phone+' · '+location+' → '+destination+' · '+ride.pickupTime,ref:ride.id,url:'/home'});}catch{}
   return Response.json({ride:publicView(state,ride),key:rideKey},{headers});
  }
  return Response.json({error:'Dispatch is busy right now. Please try again.'},{status:409,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not request a ride.'},{status:400,headers});}
}

async function cancel(body:any){
 const id=text(body.id,20),key=text(body.key,40);
 for(let attempt=0;attempt<3;attempt++){
  const {state,revision}=await loadStays();
  const ride=findRide(state,id,key);
  if(!ride)return Response.json({error:'We could not find this ride.'},{status:404,headers});
  if(ride.cancelled||['Completed','Cancelled'].includes(String(ride.buggyStatus||'')))return Response.json({ride:publicView(state,ride)},{headers});
  if(ride.buggyStatus==='On trip')throw Error('Your ride has already started. Please speak to your driver.');
  const now=new Date().toISOString();
  Object.assign(ride,{cancelled:true,cancelledAt:now,cancelledBy:'public-rider',buggyStatus:'Cancelled'});
  releaseBuggyIfIdle(state,ride);
  state.buggyTripHistory??=[];
  state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Cancelled',buggyId:ride.buggyId||'',buggyName:'',bookingId:ride.id,guest:ride.guest,driver:ride.buggyDriver||'',by:'Rider'});
  if(!await saveStayAccess(state,revision,'public-ride'))continue;
  try{await emitAdminNotification({id:'buggy:cancel:'+ride.id+':'+now,type:'buggy',title:'Nirili Ride cancelled',detail:String(ride.guest)+' · '+ride.location+' → '+ride.destination,ref:ride.id,url:'/home'});}catch{}
  return Response.json({ride:publicView(state,ride)},{headers});
 }
 return Response.json({error:'Please try again in a moment.'},{status:409,headers});
}
