import {limit,sameOrigin} from '../../../../lib/auth';
import {islandToday} from '../../../../lib/guest-catalog';
import {loadStays} from '../../../../lib/stays';
import {saveStayAccess} from '../../../../lib/stay-login';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {activeOnDemandRide,addPublicRide} from '../../../../lib/buggy-rides';
import {activePartnerIds} from '../../../../lib/partners';
import {TRAVELLERS,addHistory,assertBookable,bookableState,createTransfer,ports,publicBoats,seatAvailability,seatsForBooking,seatTaken,type TransportState} from '../../../../lib/transport';
import {loadTransport,saveTransport} from '../../../../lib/transport-store';
import {agentFromRequest,text,type Agent} from '../../../../lib/excursion-agents';

// Partner guest houses book Nirili Travels for their guests: speedboat seats with independent
// operators, and buggy rides. Guests pay the operator or driver directly.
const headers={'Cache-Control':'private, no-store'};
const signedOut=()=>Response.json({error:'Your session has ended. Please sign in again.'},{status:401,headers});
const PHONE=/^\+[1-9]\d{7,14}$/;
const cleanPhone=(v:any)=>String(v||'').replace(/[\s()-]/g,'');
function maldivesClock(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const get=(type:string)=>parts.find(p=>p.type===type)?.value||'00';
 return get('hour')+':'+get('minute');
}

function transferView(all:TransportState,agent:Agent,live:Set<string>){
 const state=bookableState(all,live);
 return {
  sailings:state.sailings.filter(s=>s.active).map(({roomFare,...s})=>s),
  boats:publicBoats(state),
  ports:ports(state),
  availability:seatAvailability(state),
  transfers:all.bookings.filter(b=>b.agentId===agent.id).map(b=>({id:b.id,name:b.name,traveller:b.traveller,phone:b.phone,adults:b.adults,children:b.children,infants:b.infants,total:b.total,status:b.status,agentReference:b.agentReference||'',created:b.created,
   journeys:b.journeys.map(j=>({seats:j.seats,date:j.date,depart:j.depart,arrive:j.arrive,from:j.from,to:j.to,operatorName:j.operatorName||j.boat,status:j.operatorStatus||'Accepted',boatName:j.boatName||'',declineReason:j.declineReason||'',cancelledByOperator:!!j.cancelledByOperator,departed:!!j.departedAt,noShow:!!j.noShow,boardedPax:j.boardedPax||0}))}))
   .sort((a,b)=>b.created.localeCompare(a.created)),
 };
}
function rideView(state:any,agent:Agent){
 return {
  rideFareCents:Math.max(0,Number(state.buggySettings?.guestRideFareCents)||0),
  rides:(state.buggyBookings||[]).filter((r:any)=>r.agentId===agent.id).map((r:any)=>{
   const buggy=(state.buggyFleet||[]).find((b:any)=>b.id===r.buggyId);
   return {id:r.id,guest:r.guest,location:r.location,destination:r.destination,quantity:r.quantity,date:r.date,pickupTime:r.pickupTime,fareCents:r.fareCents,status:r.cancelled?'Cancelled':String(r.buggyStatus||'Requested'),buggyName:buggy?.name||'',driver:r.buggyDriver||'',operatorName:r.operatorName||'',createdAt:r.createdAt||''};
  }).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,40),
 };
}
async function view(agent:Agent){
 const [{state:transport,revision},{state:hotel},live]=await Promise.all([loadTransport(),loadStays(),activePartnerIds('boats')]);
 return {revision,today:islandToday(),...transferView(transport,agent,live),...rideView(hotel,agent)};
}

export async function GET(r:Request){
 try{
  const agent=await agentFromRequest(r,['transfers','rides']);
  if(!agent)return signedOut();
  return Response.json(await view(agent),{headers});
 }catch{return Response.json({error:'Could not load transfers and rides. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  // Speedboat actions need the transfers permission; buggy actions need rides.
  const body:Record<string,any>=await r.json();
  const agent=await agentFromRequest(r,String(body.action||'').includes('transfer')?'transfers':'rides');
  if(!agent)return signedOut();
  const by=agent.name+' (agent)';
  if(!await limit('agent-travel:'+agent.id,120,3600000))throw Error('Too many requests. Please try again later.');

  if(body.action==='book-transfer'){
   const owner='agent:'+agent.id;
   for(let attempt=0;attempt<3;attempt++){
    const {state,revision}=await loadTransport();
    if(state.bookings.some(b=>b.owner===owner&&b.token===body.token))return Response.json(await view(agent),{headers});
    const phone=cleanPhone(body.phone)||agent.phone;
    if(!PHONE.test(phone))throw Error(cleanPhone(body.phone)?'Enter the guest WhatsApp number with country code.':'Add the guest’s WhatsApp number so the operator can reach them (your guest house has no WhatsApp number on file with Nirili).');
    const journeys=seatsForBooking(state,body.journeys,Number(body.adults)+Number(body.children));
    assertBookable(state,journeys,await activePartnerIds('boats'));
    const booking=createTransfer(state,{...body,journeys,phone,traveller:TRAVELLERS.includes(body.traveller)?body.traveller:'Tourist',notes:text(body.notes,1000)},owner);
    Object.assign(booking,{source:'Partner',agentId:agent.id,agentName:agent.name,agentReference:text(body.agentReference,60),pickup:agent.pickup});
    addHistory(booking,by,'Booked','Partner portal');
    state.bookings.push(booking);
    if(!await saveTransport(state,revision,owner))continue;
    try{const j=booking.journeys[0];await emitAdminNotification({id:'transport:new:'+booking.id,type:'transport',title:'New partner transfer booking',detail:agent.name+' · '+booking.name+' · '+j.from+' → '+j.to+' · '+j.date+' '+j.depart+(j.operatorName?' · '+j.operatorName:''),ref:booking.id,url:'/home'});}catch{}
    return Response.json(await view(agent),{status:201,headers});
   }
   throw Error('Seats changed at the same moment. Please try again.');
  }

  if(body.action==='cancel-transfer'){
   for(let attempt=0;attempt<3;attempt++){
    const {state,revision}=await loadTransport();
    const booking=state.bookings.find(b=>b.id===String(body.bookingId||'')&&b.agentId===agent.id);
    if(!booking)throw Error('Booking not found.');
    if(booking.status==='Cancelled')return Response.json(await view(agent),{headers});
    if(booking.journeys.some(j=>j.departedAt||j.boardedPax))throw Error('Passengers have already boarded. Please contact the operator.');
    booking.status='Cancelled';addHistory(booking,by,'Cancelled by partner',text(body.reason,300));
    if(!await saveTransport(state,revision,'agent:'+agent.id))continue;
    try{await emitAdminNotification({id:'transport:cancel:'+booking.id,type:'transport',title:'Partner cancelled a transfer',detail:agent.name+' · '+booking.id+' · '+booking.name,ref:booking.id,url:'/home'});}catch{}
    return Response.json(await view(agent),{headers});
   }
   throw Error('Please try again in a moment.');
  }

  if(body.action==='request-ride'){
   const name=text(body.name,100),phone=cleanPhone(body.phone)||agent.phone,location=text(body.location,150)||agent.pickup,destination=text(body.destination,150),notes=text(body.notes,500),quantity=Number(body.quantity),token=String(body.token||'');
   if(!name||!destination)throw Error('Enter the guest name and where they are going.');
   if(!PHONE.test(phone))throw Error(cleanPhone(body.phone)?'Enter the guest WhatsApp number with country code.':'Add the guest’s WhatsApp number so the driver can reach them (your guest house has no WhatsApp number on file with Nirili).');
   if(location.toLowerCase()===destination.toLowerCase())throw Error('Enter different pickup and drop-off points.');
   if(!Number.isInteger(quantity)||quantity<1||quantity>6)throw Error('Choose between 1 and 6 passengers.');
   if(!/^[a-f0-9-]{20,80}$/i.test(token))throw Error('Refresh the page and try again.');
   for(let attempt=0;attempt<3;attempt++){
    const {state,revision}=await loadStays();
    if((state.buggyBookings||[]).some((x:any)=>x.token===token&&x.agentId===agent.id))return Response.json(await view(agent),{headers});
    const ride=addPublicRide(state,{token,name,phone,location,destination,quantity,notes,date:islandToday(),pickupTime:maldivesClock(),fareCents:Math.max(0,Number(state.buggySettings?.guestRideFareCents)||0),createdBy:'agent:'+agent.id,extra:{agentId:agent.id,agentName:agent.name}});
    if(!await saveStayAccess(state,revision,'agent:'+agent.id))continue;
    try{await emitAdminNotification({id:'buggy:new:'+ride.id,type:'buggy',title:'New partner ride request',detail:agent.name+' · '+name+' · '+location+' → '+destination,ref:ride.id,url:'/home'});}catch{}
    return Response.json(await view(agent),{status:201,headers});
   }
   throw Error('Dispatch is busy right now. Please try again.');
  }

  if(body.action==='cancel-ride'){
   for(let attempt=0;attempt<3;attempt++){
    const {state,revision}=await loadStays();
    const ride=(state.buggyBookings||[]).find((x:any)=>x.id===String(body.rideId||'')&&x.agentId===agent.id);
    if(!ride)throw Error('Ride not found.');
    if(!activeOnDemandRide(ride))return Response.json(await view(agent),{headers});
    if(ride.buggyStatus==='On trip')throw Error('The ride has already started.');
    const now=new Date().toISOString();
    Object.assign(ride,{cancelled:true,cancelledAt:now,cancelledBy:by,buggyStatus:'Cancelled'});
    const buggy=(state.buggyFleet||[]).find((b:any)=>b.id===ride.buggyId);
    if(buggy&&buggy.status==='Assigned'&&!(state.buggyBookings||[]).some((x:any)=>x.id!==ride.id&&x.buggyId===buggy.id&&activeOnDemandRide(x)))buggy.status='Available';
    if(!await saveStayAccess(state,revision,'agent:'+agent.id))continue;
    return Response.json(await view(agent),{headers});
   }
   throw Error('Please try again in a moment.');
  }
  throw Error('Unknown action.');
 }catch(e){
  if(seatTaken(e))try{const agent=await agentFromRequest(r,'transfers');if(agent)return Response.json({error:(e as Error).message,...await view(agent)},{status:409,headers});}catch{}
  return Response.json({error:e instanceof Error?e.message:'Could not save. Please try again.'},{status:400,headers});
 }
}
