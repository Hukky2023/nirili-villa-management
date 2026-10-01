import {sameOrigin} from '../../../../lib/auth';
import {occupied,transportToday,type Journey,type TransferBooking} from '../../../../lib/transport';
import {loadTransport,updateTransport} from '../../../../lib/transport-store';
import {closeDeparture,crewOnTrip,crewTrips,operatorDay,setBoarded,ticketPax} from '../../../../lib/transport-operator';
import {crewFromRequest,type Crew} from '../../../../lib/operator-crew';

// Crew boarding view: a crew member sees only the trips their operator assigned them to, and
// can board guests and close those trips. Fares are shown so crew can collect them on board.
const headers={'Cache-Control':'private, no-store'};
const denied=()=>Response.json({error:'Your session has ended. Please sign in again.'},{status:401,headers});
const dateOk=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d);
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);

function ticketView(booking:TransferBooking,journey:Journey,index:number){
 const roomBilled=!!booking.stayId&&Number.isInteger(booking.roomCents);
 return {bookingId:booking.id,index,name:booking.name,phone:booking.phone,seats:journey.seats,adults:booking.adults,children:booking.children,infants:booking.infants,pax:ticketPax(booking),
  notes:booking.notes||'',source:booking.agentName?'Partner: '+booking.agentName:booking.stayId?'Nirili Villa guest':booking.source||'Website',pickup:booking.pickup||'',
  date:journey.date,depart:journey.depart,scheduleId:journey.scheduleId,status:journey.operatorStatus||'Accepted',boardedPax:journey.boardedPax||0,departed:!!journey.departedAt,noShow:!!journey.noShow,
  roomBilled,fareMvr:roomBilled?0:journey.fare*booking.adults+Math.round(journey.fare/2)*booking.children};
}

async function view(crew:Crew,date:string){
 const {state,revision}=await loadTransport(),today=transportToday();
 const mine=(d:{scheduleId:string;date:string})=>crewOnTrip(state,crew.operatorId,crew.id,d.scheduleId,d.date);
 const day=operatorDay(state,crew.operatorId,date).filter(d=>mine(d)).map(({crewIds,crewChanged,...d})=>({...d,taken:occupied(state,d.scheduleId,date),
  tickets:d.tickets.filter(t=>t.journey.operatorStatus!=='Declined').map(t=>ticketView(t.booking,t.journey,t.index))}));
 // The next 7 days of assigned trips, so crew know when they work.
 const upcoming=crewTrips(state,crew.operatorId,crew.id,today,addDays(today,6)).map(t=>{
  const d=operatorDay(state,crew.operatorId,t.date).find(x=>x.scheduleId===t.scheduleId);
  return d?{scheduleId:t.scheduleId,date:t.date,depart:d.depart,from:d.from,to:d.to,boatName:d.boatName,sold:d.sold,seats:d.seats,closed:d.closed}:null;
 }).filter(Boolean);
 return {revision,today,date,day,upcoming};
}

export async function GET(r:Request){
 try{
  const found=await crewFromRequest(r);
  if(!found)return denied();
  const url=new URL(r.url),date=dateOk(url.searchParams.get('date')||'')?url.searchParams.get('date')!:transportToday();
  return Response.json(await view(found.crew,date),{headers});
 }catch{return Response.json({error:'Could not load your trips. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const found=await crewFromRequest(r);
  if(!found)return denied();
  const {crew}=found,body:Record<string,any>=await r.json(),by=crew.name+' ('+crew.role.toLowerCase()+')';
  await updateTransport('crew:'+crew.id,state=>{
   switch(body.action){
    case 'board':{
     const booking=state.bookings.find(b=>b.id===String(body.bookingId||'')),journey=booking?.journeys[Number(body.index)];
     if(!journey||!crewOnTrip(state,crew.operatorId,crew.id,journey.scheduleId,journey.date))throw Error('This ticket is not on one of your trips.');
     return setBoarded(state,crew.operatorId,booking!.id,Number(body.index),Number(body.boarded),by,transportToday());
    }
    case 'close':{
     const scheduleId=String(body.scheduleId||''),date=String(body.date||'');
     if(!crewOnTrip(state,crew.operatorId,crew.id,scheduleId,date))throw Error('This is not one of your trips.');
     if(date>transportToday())throw Error('You can close a trip on the day it leaves.');
     return closeDeparture(state,crew.operatorId,scheduleId,date,by);
    }
    default:throw Error('Crew can board guests and close their trips only.');
   }
  });
  const date=dateOk(String(body.viewDate||''))?String(body.viewDate):transportToday();
  return Response.json(await view(crew,date),{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save. Please try again.'},{status:400,headers});}
}
