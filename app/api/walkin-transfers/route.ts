import {cookies} from 'next/headers';
import {sessionCookieName} from '../../../lib/tab-session';
import {randomToken,digest,sameOrigin,limit} from '../../../lib/auth';
import {addHistory,createTransfer,freeSeats,journeyLive,type TransportState} from '../../../lib/transport';
import {loadTransport,saveTransport} from '../../../lib/transport-store';
import {emitAdminNotification} from '../../../lib/admin-notifications';

// Public speedboat booking (transfers.nirilihotels.com). Departures come from independent
// speedboat operators; the guest pays the operator. Reads and writes go through the shared
// transport store so staff and operators always see the same tickets.
const headers={'Cache-Control':'no-store'};
async function identity(){const name=await sessionCookieName('nirili_transfer'),token=(await cookies()).get(name)?.value;return {name,token:token&&/^[a-f0-9]{64}$/.test(token)?token:null};}

function view(state:TransportState,revision:number,owner:string){
 return {
  revision,canEdit:false,isAdmin:false,role:'Walk-in',ownRoom:null,
  sailings:state.sailings.filter(s=>s.active).map(({roomFare,...s})=>s),
  bookings:state.bookings.filter(b=>b.owner===owner).map(({owner,token,history,...b})=>b),
  availability:state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)).map(j=>({scheduleId:j.scheduleId,date:j.date,seats:j.seats,pax:b.adults+b.children+b.infants}))),
 };
}

export async function GET(){
 try{
  const id=await identity(),token=id.token||randomToken(),owner='walk-transfer:'+await digest(token),{state,revision}=await loadTransport();
  return Response.json(view(state,revision,owner),{headers:{...headers,...(!id.token?{'Set-Cookie':`${id.name}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`}:{})}});
 }catch{return Response.json({error:'Unable to load transfers. Please refresh.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const id=await identity();if(!id.token)throw Error('Refresh before booking.');
  const owner='walk-transfer:'+await digest(id.token),b:Record<string,any>=await r.json();
  if(b.action!=='book'||b.payment!=='later')return Response.json({error:'Walk-in guests can book transfers with payment at reception only.'},{status:403,headers});
  if(!await limit(owner,10,3600000)||!await limit('walk-transfer-ip:'+(r.headers.get('cf-connecting-ip')||'unknown'),40,3600000))throw Error('Please contact reception for further bookings.');
  // Seat numbers are ticket slots, so the server picks free ones from the latest ledger. Other
  // bookings or an operator accepting tickets while the page was open never block the guest;
  // only a real lack of seats does. A lost race is retried on fresh data.
  let saved:{state:TransportState;revision:number;booking:any}|null=null;
  for(let attempt=0;attempt<4&&!saved;attempt++){
   const {state,revision}=await loadTransport();
   const repeat=state.bookings.find(x=>x.owner===owner&&x.token===b.token);
   if(repeat)return Response.json(view(state,revision,owner),{headers});
   const journeys=(Array.isArray(b.journeys)?b.journeys:[]).map((j:any)=>{
    const sailing=state.sailings.find(s=>s.id===j?.scheduleId&&s.active);
    const seats=sailing?freeSeats(state,sailing,String(j.date||''),Number(b.adults)+Number(b.children)):null;
    if(sailing&&!seats)throw Error('Not enough seats left on this boat for your group. Try another time or date.');
    return {...j,seats:seats||j?.seats};
   });
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
  return Response.json(view(state,next,owner),{headers});
 }catch(e){return Response.json({error:(e as Error).message},{status:400,headers});}
}
