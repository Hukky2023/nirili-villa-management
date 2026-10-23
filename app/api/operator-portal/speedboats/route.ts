import {sameOrigin,authDb} from '../../../../lib/auth';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {occupied,transportToday,tripBoat,type Journey,type TransferBooking} from '../../../../lib/transport';
import {loadTransport,updateTransport} from '../../../../lib/transport-store';
import {closeDeparture,declineTicket,operatorBoats,operatorDay,operatorSailings,operatorStatement,operatorTickets,saveBoat,saveOperatorSailing,setBoarded,setTripBoat,setTripCrew,ticketPax,tripCrew} from '../../../../lib/transport-operator';
import {offers,operatorFromRequest,publicOperator,type Operator} from '../../../../lib/travel-operators';
import {completeCharter,confirmCharter,declineCharter,operatorCharterRates,operatorCharters,saveCharterRate,setCharterCrew} from '../../../../lib/transport-charter';
import {createCrew,operatorCrew,publicCrew,updateCrew} from '../../../../lib/operator-crew';

// Speedboat operator portal: fleet with seat maps, crew logins, published departures with their
// crew, bookings, boarding and the monthly statement. Only the signed-in operator's own boats, departures and tickets appear.
const headers={'Cache-Control':'private, no-store'};
const denied=()=>Response.json({error:'Your session has ended. Please sign in again.'},{status:401,headers});
const dateOk=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d);
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);

function ticketView(booking:TransferBooking,journey:Journey,index:number){
 const roomBilled=!!booking.stayId&&Number.isInteger(booking.roomCents);
 return {bookingId:booking.id,index,name:booking.name,traveller:booking.traveller,localFare:booking.traveller==='Local'||booking.traveller==='Expat',phone:journey.operatorStatus==='Declined'?'':booking.phone,seats:journey.seats,adults:booking.adults,children:booking.children,infants:booking.infants,pax:ticketPax(booking),
  notes:booking.notes||'',source:booking.agentName?'Partner: '+booking.agentName:booking.stayId?'Nirili Villa guest':booking.source||'Website',pickup:booking.pickup||'',
  date:journey.date,depart:journey.depart,arrive:journey.arrive,from:journey.from,to:journey.to,scheduleId:journey.scheduleId,
  status:journey.operatorStatus||'Accepted',cancelledByOperator:!!journey.cancelledByOperator,boatId:journey.boatId||'',boatName:journey.boatName||'',boardedPax:journey.boardedPax||0,departed:!!journey.departedAt,noShow:!!journey.noShow,declineReason:journey.declineReason||'',
  roomBilled,fareMvr:roomBilled?0:journey.fare*booking.adults+Math.round(journey.fare/2)*booking.children,created:booking.created};
}

async function view(operator:Operator,date:string,month:string){
 // A shared availability enquiry is visible to every authenticated active boat operator.
 let availabilityRequests:any[]=[];
 if(operator.active&&offers(operator,'boat')){
  try{const records=await authDb().prepare("SELECT payload FROM operation_records WHERE key LIKE 'private-hire-enquiry:%' ORDER BY rowid DESC LIMIT 100").all();
   availabilityRequests=(records.results||[]).flatMap((r:any)=>{try{const e=JSON.parse(String(r.payload||''));return e.status==='Awaiting Availability'&&e.date>=transportToday()?[{id:e.id,from:e.from,to:e.to,date:e.date,time:e.time,pax:e.pax,traveller:e.traveller,notes:e.notes||'',created:e.created,contactVia:'Nirili Management'}]:[]}catch{return []}});
  }catch{}
 }

 const [{state,revision},crewRows]=await Promise.all([loadTransport(),operatorCrew(operator.id)]),today=transportToday();
 const crew=crewRows.map(r=>publicCrew(r.crew));
 const day=operatorDay(state,operator.id,date).map(d=>({...d,taken:occupied(state,d.scheduleId,date),tickets:d.tickets.map(t=>ticketView(t.booking,t.journey,t.index))}));
 // Upcoming trips that have bookings, each with the boat it runs on.
 const upcoming=operatorTickets(state,operator.id,t=>t.journey.date>=today&&t.journey.operatorStatus!=='Declined'&&!t.journey.departedAt);
 const trips=new Map<string,any>();
 for(const t of upcoming){
  const key=t.journey.scheduleId+'|'+t.journey.date,sailing=state.sailings.find(s=>s.id===t.journey.scheduleId),boat=sailing?tripBoat(state,sailing,t.journey.date):undefined;
  if(!trips.has(key))trips.set(key,{crewIds:sailing?tripCrew(sailing,t.journey.date):[],scheduleId:t.journey.scheduleId,date:t.journey.date,depart:sailing?.depart||t.journey.depart,arrive:sailing?.arrive||t.journey.arrive,from:sailing?.from||t.journey.from,to:sailing?.to||t.journey.to,stops:sailing?.stops||null,boatId:boat?.id||'',boatName:boat?.name||t.journey.boatName||'',swapped:!!sailing?.boatOverrides?.[t.journey.date],sold:0,tickets:[]});
  const trip=trips.get(key);trip.sold+=t.journey.seats.length;trip.tickets.push(ticketView(t.booking,t.journey,t.index));
 }
 return {revision,today,date,month,operator:publicOperator(operator),availabilityRequests,boats:operatorBoats(state,operator.id),sailings:operatorSailings(state,operator.id),crew,day,
  charterRates:operatorCharterRates(state,operator.id),
  charters:operatorCharters(state,operator.id).filter(c=>c.date>=addDays(today,-7)).map(({token,owner,history,...c})=>({...c,phone:['Requested','Confirmed','Completed'].includes(c.status)?c.phone:''})),bookings:[...trips.values()],statement:operatorStatement(state,operator,month,today)};
}

async function speedboatOperator(r:Request){
 const operator=await operatorFromRequest(r);
 return operator&&offers(operator,'boat')?operator:null;
}

export async function GET(r:Request){
 try{
  const operator=await speedboatOperator(r);
  if(!operator)return denied();
  const url=new URL(r.url),today=transportToday();
  const date=dateOk(url.searchParams.get('date')||'')?url.searchParams.get('date')!:today;
  const month=/^\d{4}-\d{2}$/.test(url.searchParams.get('month')||'')?url.searchParams.get('month')!:today.slice(0,7);
  return Response.json(await view(operator,date,month),{headers});
 }catch{return Response.json({error:'Could not load your departures. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const operator=await speedboatOperator(r);
  if(!operator)return denied();
  const body:Record<string,any>=await r.json(),by=operator.name,ref={id:operator.id,name:operator.name};
  // Crew logins live outside the speedboat ledger.
  if(body.action==='save-crew'){
   const c=body.crew||{};
   if(c.id)await updateCrew(operator.id,String(c.id),c,'operator:'+operator.id);else await createCrew(operator.id,c,'operator:'+operator.id);
   const today=transportToday();
   return Response.json(await view(operator,dateOk(String(body.viewDate||''))?String(body.viewDate):today,/^\d{4}-\d{2}$/.test(String(body.viewMonth||''))?String(body.viewMonth):today.slice(0,7)),{headers});
  }
  const activeCrew=new Set((await operatorCrew(operator.id)).filter(r=>r.crew.active).map(r=>r.crew.id));
  let notice:any=null;
  await updateTransport('operator:'+operator.id,state=>{
   switch(body.action){
    case 'save-boat':return saveBoat(state,ref,body.boat);
    case 'save-sailing':return saveOperatorSailing(state,ref,body.sailing,activeCrew);
    case 'save-charter-rate':return saveCharterRate(state,ref,body.rate);
    case 'charter-confirm':return confirmCharter(state,operator.id,String(body.id||''),String(body.boatId||''),by);
    case 'charter-crew':return setCharterCrew(state,operator.id,String(body.id||''),body.crewIds,activeCrew);
    case 'charter-complete':return completeCharter(state,operator.id,String(body.id||''),by,transportToday());
    case 'charter-decline':{
     const c=declineCharter(state,operator.id,String(body.id||''),body.reason,by);
     notice={id:'transport:charter:'+c.id+':'+c.status,type:'transport',title:c.status==='Declined'?'Charter request declined':'Charter cancelled by operator',detail:operator.name+' · '+c.id+' · '+c.name+' '+c.phone+' · '+c.date+' '+c.time+' '+c.from+' → '+c.to+' · '+c.reason,ref:c.id,url:'/home'};
     return c;
    }
    case 'retire-sailing':{
     const id=String(body.scheduleId||''),sailing=state.sailings.find(s=>s.id===id&&s.operatorId===operator.id);
     if(!sailing)throw Error('Departure not found.');
     const affected=state.bookings.flatMap(b=>b.journeys.map((j,index)=>({b,j,index}))).filter(({b,j})=>b.status!=='Cancelled'&&j.scheduleId===id&&j.operatorStatus!=='Declined'&&j.date>=transportToday()&&!j.departedAt);
     if(affected.some(({j})=>(j.boardedPax||0)>0))throw Error('This departure has boarded passengers and cannot be cancelled.');
     sailing.active=false;
     for(const {b,j} of affected){
      Object.assign(j,{operatorStatus:'Declined',declinedAt:new Date().toISOString(),declineReason:'Departure cancelled by operator — reassignment required',cancelledByOperator:true});
      b.history=[...(b.history||[]),{at:new Date().toISOString(),by:'operator:'+operator.id,action:'Departure cancelled; reassignment required',detail:j.date+' '+j.depart+' '+j.from+' to '+j.to}];
     }
     notice={id:'transport:retire:'+id+':'+Date.now(),type:'transport',title:'Speedboat schedule cancelled — passengers need reassignment',detail:operator.name+' cancelled '+sailing.depart+' '+sailing.from+' → '+sailing.to+'; '+affected.length+' ticket(s) require reassignment',ref:id,url:'/home'};
     return sailing;
    }
    case 'reassign-ticket':{
     const bookingId=String(body.bookingId||''),index=Number(body.index),targetId=String(body.targetScheduleId||''),date=String(body.date||'');
     if(!dateOk(date))throw Error('Choose a valid replacement date.');
     const booking=state.bookings.find(b=>b.id===bookingId);
     const journey=booking?.journeys[index];
     if(!booking||!journey||journey.operatorId!==operator.id||booking.status==='Cancelled')throw Error('Ticket not found.');
     if(journey.operatorStatus!=='Declined'||!journey.cancelledByOperator)throw Error('Only operator-cancelled tickets can be reassigned using this action.');
     if(journey.boardedPax||journey.departedAt)throw Error('Cannot reassign a boarded or departed ticket.');
     const target=state.sailings.find(s=>s.id===targetId&&s.operatorId===operator.id&&s.active);
     if(!target||target.id===journey.scheduleId)throw Error('Choose another active departure operated by you.');
     if(target.from!==journey.from||target.to!==journey.to)throw Error('Replacement must use the same origin and destination.');
     if(target.days?.length&&!target.days.includes(new Date(date+'T00:00:00Z').getUTCDay()))throw Error('Replacement trip does not operate on that day.');
     if(Date.parse(date+'T'+target.depart+':00+05:00')<=Date.now())throw Error('Choose a future departure.');
     const boat=tripBoat(state,target,date),allowed=boat?.layout?.cells?.filter(n=>n>0)||Array.from({length:target.capacity},(_,i)=>i+1);
     const occupiedSeats=new Set(occupied(state,target.id,date));
     const available=allowed.filter(n=>!occupiedSeats.has(n)).sort((a,b)=>a-b);
     if(available.length<journey.seats.length)throw Error('Not enough available seats on replacement departure.');
     const newSeats=available.slice(0,journey.seats.length);
     const oldTrip=journey.date+' '+journey.depart+' '+journey.from+' → '+journey.to;
     Object.assign(journey,{scheduleId:target.id,date,seats:newSeats,boat:target.boat,from:target.from,to:target.to,depart:target.depart,arrive:target.arrive,operatorStatus:'Accepted',boatId:boat?.id||target.boatId||'',boatName:boat?.name||target.boat||'',acceptedAt:new Date().toISOString(),acceptedBy:operator.name,declinedAt:undefined,declineReason:undefined,cancelledByOperator:false,boardedPax:0,boardedAt:undefined,noShow:false});
     booking.history=[...(booking.history||[]),{at:new Date().toISOString(),by:'operator:'+operator.id,action:'Reassigned speedboat ticket',detail:oldTrip+' → '+date+' '+target.depart+' / seats '+newSeats.join(', ')}];
     notice={id:'transport:reassign:'+booking.id+':'+Date.now(),type:'transport',title:'Speedboat ticket reassigned',detail:operator.name+' reassigned '+booking.name+' · '+booking.id+' to '+date+' '+target.depart+' · seats '+newSeats.join(', '),ref:booking.id,url:'/home'};
     return booking;
    }
    case 'trip-crew':return setTripCrew(state,ref,String(body.scheduleId||''),String(body.date||''),body.crewIds,activeCrew,body.regular===true);
    case 'trip-boat':return setTripBoat(state,ref,String(body.scheduleId||''),String(body.date||''),String(body.boatId||''),by);
    case 'decline':
    case 'cancel':{
     const kind=body.action==='cancel'?'cancel':'decline';
     const {booking,journey}=declineTicket(state,operator.id,String(body.bookingId||''),Number(body.index),body.reason,by,kind);
     notice={id:'transport:'+kind+':'+booking.id+':'+journey.scheduleId,type:'transport',title:kind==='cancel'?'Speedboat ticket cancelled by operator':'Speedboat ticket declined',detail:operator.name+' declined '+booking.id+' · '+booking.name+' · '+journey.date+' '+journey.depart+' '+journey.from+' → '+journey.to+' · '+journey.declineReason+(booking.stayId?' · Nirili Villa guest: reschedule in Transfers':kind==='cancel'?'':' · help the guest rebook'),ref:booking.id,url:'/home'};
     return booking;
    }
    case 'board':return setBoarded(state,operator.id,String(body.bookingId||''),Number(body.index),Number(body.boarded),by,transportToday());
    case 'close':return closeDeparture(state,operator.id,String(body.scheduleId||''),String(body.date||''),by);
    default:throw Error('Unknown action.');
   }
  });
  if(notice)try{await emitAdminNotification(notice);}catch{}
  const today=transportToday(),date=dateOk(String(body.viewDate||''))?String(body.viewDate):today,month=/^\d{4}-\d{2}$/.test(String(body.viewMonth||''))?String(body.viewMonth):today.slice(0,7);
  return Response.json(await view(operator,date,month),{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save. Please try again.'},{status:400,headers});}
}
