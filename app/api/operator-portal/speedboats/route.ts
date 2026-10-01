import {sameOrigin} from '../../../../lib/auth';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {transportToday,type Journey,type TransferBooking} from '../../../../lib/transport';
import {loadTransport,updateTransport} from '../../../../lib/transport-store';
import {acceptTicket,closeDeparture,declineTicket,operatorBoats,operatorDay,operatorSailings,operatorStatement,operatorTickets,saveBoat,saveOperatorSailing,setBoarded,ticketPax} from '../../../../lib/transport-operator';
import {offers,operatorFromRequest,publicOperator,type Operator} from '../../../../lib/travel-operators';

// Speedboat operator portal: fleet, published departures, incoming tickets, boarding and the
// monthly statement. Only the signed-in operator's own boats, departures and tickets appear.
const headers={'Cache-Control':'private, no-store'};
const denied=()=>Response.json({error:'Your session has ended. Please sign in again.'},{status:401,headers});
const dateOk=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d);

// Guest contact details are shared once the operator has accepted the ticket.
function ticketView(booking:TransferBooking,journey:Journey,index:number){
 const accepted=journey.operatorStatus==='Accepted';
 const roomBilled=!!booking.stayId&&Number.isInteger(booking.roomCents);
 return {bookingId:booking.id,index,name:booking.name,phone:accepted?booking.phone:'',adults:booking.adults,children:booking.children,infants:booking.infants,pax:ticketPax(booking),
  notes:booking.notes||'',source:booking.agentName?'Partner: '+booking.agentName:booking.stayId?'Nirili Villa guest':booking.source||'Website',pickup:booking.pickup||'',
  date:journey.date,depart:journey.depart,arrive:journey.arrive,from:journey.from,to:journey.to,scheduleId:journey.scheduleId,
  status:journey.operatorStatus||'New',boatId:journey.boatId||'',boatName:journey.boatName||'',boardedPax:journey.boardedPax||0,departed:!!journey.departedAt,noShow:!!journey.noShow,declineReason:journey.declineReason||'',
  roomBilled,fareMvr:roomBilled?0:journey.fare*booking.adults+Math.round(journey.fare/2)*booking.children,created:booking.created};
}

async function view(operator:Operator,date:string,month:string){
 const {state,revision}=await loadTransport(),today=transportToday();
 const inbox=operatorTickets(state,operator.id,t=>t.journey.operatorStatus==='New'&&t.journey.date>=today).map(t=>ticketView(t.booking,t.journey,t.index));
 const day=operatorDay(state,operator.id,date).map(d=>({...d,tickets:d.tickets.map(t=>ticketView(t.booking,t.journey,t.index))}));
 const upcoming=operatorTickets(state,operator.id,t=>t.journey.date>=today&&t.journey.operatorStatus==='Accepted'&&!t.journey.departedAt).map(t=>ticketView(t.booking,t.journey,t.index));
 return {revision,today,date,month,operator:publicOperator(operator),boats:operatorBoats(state,operator.id),sailings:operatorSailings(state,operator.id),inbox,day,upcoming,statement:operatorStatement(state,operator,month,today)};
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
  let notice:any=null;
  await updateTransport('operator:'+operator.id,state=>{
   switch(body.action){
    case 'save-boat':return saveBoat(state,ref,body.boat);
    case 'save-sailing':return saveOperatorSailing(state,ref,body.sailing);
    case 'accept':return acceptTicket(state,operator.id,String(body.bookingId||''),Number(body.index),String(body.boatId||''),by);
    case 'decline':{
     const {booking,journey}=declineTicket(state,operator.id,String(body.bookingId||''),Number(body.index),body.reason,by);
     notice={id:'transport:declined:'+booking.id+':'+journey.scheduleId,type:'transport',title:'Speedboat ticket declined',detail:operator.name+' declined '+booking.id+' · '+booking.name+' · '+journey.date+' '+journey.depart+' '+journey.from+' → '+journey.to+' · '+journey.declineReason+(booking.stayId?' · Nirili Villa guest: reschedule in Transfers':' · help the guest rebook'),ref:booking.id,url:'/home'};
     return booking;
    }
    case 'board':return setBoarded(state,operator.id,String(body.bookingId||''),Number(body.index),Number(body.boarded),by,transportToday());
    case 'close':return closeDeparture(state,operator.id,String(body.scheduleId||''),String(body.date||''),String(body.boatId||''),by);
    default:throw Error('Unknown action.');
   }
  });
  if(notice)try{await emitAdminNotification(notice);}catch{}
  const today=transportToday(),date=dateOk(String(body.viewDate||''))?String(body.viewDate):today,month=/^\d{4}-\d{2}$/.test(String(body.viewMonth||''))?String(body.viewMonth):today.slice(0,7);
  return Response.json(await view(operator,date,month),{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save. Please try again.'},{status:400,headers});}
}
