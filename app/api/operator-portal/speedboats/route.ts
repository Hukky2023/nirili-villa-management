import {sameOrigin} from '../../../../lib/auth';
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
 return {revision,today,date,month,operator:publicOperator(operator),boats:operatorBoats(state,operator.id),sailings:operatorSailings(state,operator.id),crew,day,
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
