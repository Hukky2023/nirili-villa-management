import {cookies} from 'next/headers';
import {sessionCookieName} from '../../../lib/tab-session';
import {randomToken,digest,sameOrigin,limit} from '../../../lib/auth';
import {activePartnerIds} from '../../../lib/partners';
import {addHistory,assertBookable,bookableState,createTransfer,ports,publicBoats,seatAvailability,seatsForBooking,seatTaken,type TransportState} from '../../../lib/transport';
import {loadTransport,saveTransport,updateTransport} from '../../../lib/transport-store';
import {publicCharterRates,requestCharter,searchCharters} from '../../../lib/transport-charter';
import {emitAdminNotification} from '../../../lib/admin-notifications';

// Public speedboat booking (transfers.nirilihotels.com). Departures come from independent
// speedboat operators; the guest pays the operator. Reads and writes go through the shared
// transport store so staff and operators always see the same tickets.
const headers={'Cache-Control':'no-store'};
const live=()=>activePartnerIds('boats');
async function identity(){const name=await sessionCookieName('nirili_transfer'),token=(await cookies()).get(name)?.value;return {name,token:token&&/^[a-f0-9]{64}$/.test(token)?token:null};}

function view(all:TransportState,revision:number,owner:string,live:Set<string>){
 // Only departures of active operators are for sale; the guest's own bookings always show.
 const state=bookableState(all,live);
 return {
  revision,canEdit:false,isAdmin:false,role:'Walk-in',ownRoom:null,
  sailings:state.sailings.filter(s=>s.active).map(({roomFare,...s})=>s),
  bookings:all.bookings.filter(b=>b.owner===owner).map(({owner,token,history,...b})=>b),
  boats:publicBoats(state),
  ports:ports(state),
  charterRates:publicCharterRates(state),
  // Like ODI's "Vessels onboard": boats in service and operators on the platform.
  stats:{vessels:(state.boats||[]).filter(b=>b.active).length,operators:new Set((state.boats||[]).filter(b=>b.active).map(b=>b.operatorId)).size},
  charters:(state.charters||[]).filter(c=>c.owner===owner).map(({owner,token,history,...c})=>c),
  availability:seatAvailability(state),
 };
}

export async function GET(){
 try{
  const id=await identity(),token=id.token||randomToken(),owner='walk-transfer:'+await digest(token),{state,revision}=await loadTransport();
  return Response.json(view(state,revision,owner,await live()),{headers:{...headers,...(!id.token?{'Set-Cookie':`${id.name}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`}:{})}});
 }catch{return Response.json({error:'Unable to load transfers. Please refresh.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const id=await identity();if(!id.token)throw Error('Refresh before booking.');
  const owner='walk-transfer:'+await digest(id.token),b:Record<string,any>=await r.json();
  // Private charters: search is read-only; a request waits for the operator to confirm.
  if(b.action==='charter-search'){const {state}=await loadTransport();return Response.json({offers:searchCharters(bookableState(state,await live()),b)},{headers});}
  if(b.action==='charter'){
   if(!await limit(owner,10,3600000)||!await limit('walk-transfer-ip:'+(r.headers.get('cf-connecting-ip')||'unknown'),40,3600000))throw Error('Please contact reception for further bookings.');
   const {state:before}=await loadTransport();
   if((before.charters||[]).some(c=>c.owner===owner&&c.token===b.token)){const {state,revision}=await loadTransport();return Response.json(view(state,revision,owner,await live()),{headers});}
   const operators=await live();
   const {result:charter,state,revision}=await updateTransport(owner,state=>{
    const rate=(state.charterRates||[]).find(x=>x.id===String(b.rateId||''));
    if(rate&&!operators.has(rate.operatorId))throw Error('This charter is no longer offered. Search again.');
    return requestCharter(state,b,owner);
   });
   try{await emitAdminNotification({id:'transport:charter:'+charter.id,type:'transport',title:'New charter request',detail:charter.name+' · '+charter.from+' → '+charter.to+' · '+charter.date+' '+charter.time+' · '+charter.pax+' guests · '+charter.operatorName,ref:charter.id,url:'/home'});}catch{}
   return Response.json({...view(state,revision,owner,await live()),charter:{id:charter.id}},{headers});
  }
  if(b.action!=='book'||b.payment!=='later')return Response.json({error:'Walk-in guests can book transfers with payment at reception only.'},{status:403,headers});
  if(!await limit(owner,10,3600000)||!await limit('walk-transfer-ip:'+(r.headers.get('cf-connecting-ip')||'unknown'),40,3600000))throw Error('Please contact reception for further bookings.');
  // Guests pick seats on the trip boat's seat map (or let us choose the first free ones). Other
  // bookings saved while the page was open never block the guest unless they took one of the
  // same seats. A lost save race is retried on fresh data.
  let saved:{state:TransportState;revision:number;booking:any}|null=null;
  for(let attempt=0;attempt<4&&!saved;attempt++){
   const {state,revision}=await loadTransport();
   const repeat=state.bookings.find(x=>x.owner===owner&&x.token===b.token);
   if(repeat)return Response.json(view(state,revision,owner,await live()),{headers});
   const journeys=seatsForBooking(state,b.journeys,Number(b.adults)+Number(b.children));
   assertBookable(state,journeys,await live());
   const booking=createTransfer(state,{...b,journeys},owner);
   booking.source='Website';addHistory(booking,'guest','Booked','Transfers website');
   state.bookings.push(booking);
   const next=await saveTransport(state,revision,owner);
   if(next)saved={state,revision:next,booking};
  }
  if(!saved)return Response.json({error:'Many bookings are arriving at once. Please try again.'},{status:409,headers});
  const {state,booking}=saved,next=saved.revision;
  try{
   const journey=booking.journeys?.[0];
   await emitAdminNotification({id:'transport:new:'+booking.id,type:'transport',title:'New transport booking',detail:String(booking.name||'Walk-in guest')+' · '+String(journey?.from||'')+' → '+String(journey?.to||'')+' · '+String(journey?.date||'')+' '+String(journey?.depart||'')+(journey?.operatorName?' · '+journey.operatorName:''),ref:booking.id,url:'/home'});
  }catch{}
  return Response.json(view(state,next,owner,await live()),{headers});
 }catch(e){
  // Someone took a chosen seat first: send the fresh seat map so the guest can pick again.
  if(seatTaken(e))try{const id=await identity(),{state,revision}=await loadTransport();return Response.json({error:(e as Error).message,...view(state,revision,'walk-transfer:'+await digest(id.token||''),await live())},{status:409,headers});}catch{}
  return Response.json({error:(e as Error).message},{status:400,headers});
 }
}
