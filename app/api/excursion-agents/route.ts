import {currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {islandToday} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {agentBookingSummaries,agentStatement,createAgent,loadAgents,publicAgent,resolveAgentCancelRequest,updateAgent} from '../../../lib/excursion-agents';

// Staff side of the partner Agent Portal: partner accounts, monthly net-rate statements and
// cancellation requests. Admin manages accounts; the Excursions Manager can follow statements.
const headers={'Cache-Control':'no-store'};
const canView=(u:any)=>u?.role==='admin'||hasPermission(u,'excursions_manager');
const denied=()=>Response.json({error:'Admin or Excursions Manager access is required.'},{status:403,headers});
const actor=(u:any)=>u?.displayName||u?.username||'staff';

export async function GET(r:Request){
 const user=await currentUser();
 if(!canView(user))return denied();
 try{
  const month=new URL(r.url).searchParams.get('month')||islandToday().slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(month))throw Error('Choose a valid month.');
  const [rows,{state}]=await Promise.all([loadAgents(),loadStays()]);
  const statement=agentStatement(state,rows.map(row=>row.agent),month);
  const agents=rows.map(({agent,revision})=>({...publicAgent(agent),revision,statement:statement.find(s=>s.agentId===agent.id),
   bookings:agentBookingSummaries(state,agent.id).filter(b=>b.date.startsWith(month)||b.cancelRequested)}));
  return Response.json({month,today:islandToday(),agents,canEdit:user?.role==='admin'},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not load partner agents.'},{status:400,headers});}
}

// Create a partner account (Admin).
export async function POST(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access is required.'},{status:403,headers});
 try{
  const agent=await createAgent(await r.json(),actor(user));
  return Response.json({agent:publicAgent(agent)},{status:201,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create the partner.'},{status:400,headers});}
}

// Update partner details or password (Admin), or decide on a cancellation request (Admin or Excursions Manager).
export async function PATCH(r:Request){
 const user=await currentUser();
 if(!canView(user)||!sameOrigin(r))return denied();
 try{
  const body:Record<string,any>=await r.json();
  if(body.action==='resolve-cancel'){
   const {state,revision}=await loadStays();
   resolveAgentCancelRequest(state,String(body.ref||''),body.approve===true,actor(user));
   if(!await saveStayAccess(state,revision,'excursion-agents'))return Response.json({error:'Another change was saved at the same time. Please try again.'},{status:409,headers});
   return Response.json({ok:true},{headers});
  }
  if(user?.role!=='admin')return Response.json({error:'Admin access is required.'},{status:403,headers});
  const result=await updateAgent(String(body.id||''),Number(body.revision),body,actor(user));
  if(!result)return Response.json({error:'Partner not found.'},{status:404,headers});
  if(result==='conflict')return Response.json({error:'This partner was changed by someone else. Refresh and try again.'},{status:409,headers});
  return Response.json({agent:{...publicAgent(result.agent),revision:result.revision}},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save the partner.'},{status:400,headers});}
}
