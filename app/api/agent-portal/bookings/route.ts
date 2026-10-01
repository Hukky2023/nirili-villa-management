import {limit,sameOrigin} from '../../../../lib/auth';
import {islandToday} from '../../../../lib/guest-catalog';
import {loadStays} from '../../../../lib/stays';
import {saveStayAccess} from '../../../../lib/stay-login';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {createExcursionBooking,excursionBookingOptions} from '../../../../lib/excursion-booking';
import {AGENT_SOURCE,agentBookingSummaries,agentFromRequest,cancelAgentBooking,netPriceCents,publicAgent,text,type Agent} from '../../../../lib/excursion-agents';

// Partner guest houses book, follow and cancel their guests' excursions here.
const headers={'Cache-Control':'private, no-store'};
const signedOut=()=>Response.json({error:'Your session has ended. Please sign in again.'},{status:401,headers});
const by=(agent:Agent)=>agent.name+' (agent)';

export async function GET(r:Request){
 try{
  const agent=await agentFromRequest(r);
  if(!agent)return signedOut();
  const [options,{state}]=await Promise.all([excursionBookingOptions(),loadStays()]);
  const items=options.items.map((item:any)=>({...item,netCents:netPriceCents(item.cents,agent.discountPercent)}));
  return Response.json({...options,items,agent:publicAgent(agent),bookings:agentBookingSummaries(state,agent.id)},{headers});
 }catch{return Response.json({error:'Could not load your bookings. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 let body:Record<string,any>;
 try{body=await r.json();}catch{return Response.json({error:'Could not read the booking.'},{status:400,headers});}
 const agent=await agentFromRequest(r).catch(()=>null);
 if(!agent)return signedOut();
 const result=await createExcursionBooking(body,{
  source:AGENT_SOURCE,createdBy:by(agent),savedBy:'agent:'+agent.id,
  autoConfirm:agent.autoConfirm,guestContactRequired:false,guestEmail:false,guestManageLink:false,
  defaultPickup:agent.pickup,netPrice:cents=>netPriceCents(cents,agent.discountPercent),
  extra:{agentId:agent.id,agentName:agent.name,agentReference:text(body.agentReference,60),agentPayer:'Agent',agentDiscountPercent:agent.discountPercent},
  notifyTitle:'New agent excursion booking',notifyPrefix:agent.name+' · ',
  allow:()=>limit('agent-booking:'+agent.id,60,3600000),
 });
 return Response.json(result.body,{status:result.status,headers});
}

// Cancel a pending booking, or ask staff to cancel a confirmed one.
export async function PATCH(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const agent=await agentFromRequest(r);
  if(!agent)return signedOut();
  const body:Record<string,any>=await r.json(),ref=String(body.ref||'').slice(0,40);
  if(body.action!=='cancel')throw Error('Unknown action.');
  const {state,revision}=await loadStays();
  const result=cancelAgentBooking(state,agent.id,ref,body.reason,islandToday(),by(agent));
  if(!await saveStayAccess(state,revision,'agent:'+agent.id))return Response.json({error:'Another change was saved at the same time. Please try again.'},{status:409,headers});
  const first=result.orders[0];
  try{await emitAdminNotification({
   id:'excursion:agent-cancel:'+ref+':'+Date.now(),type:'excursion',
   title:result.mode==='cancelled'?'Agent cancelled a pending excursion':'Agent cancellation request',
   detail:agent.name+' · '+(first.packageName||first.name)+' · '+first.date+' · '+ref+(body.reason?' · '+text(body.reason,120):''),ref,url:'/home'
  });}catch{}
  return Response.json({ok:true,mode:result.mode,bookings:agentBookingSummaries(state,agent.id)},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not cancel the booking.'},{status:400,headers});}
}
