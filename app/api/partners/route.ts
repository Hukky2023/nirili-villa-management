import {currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {islandToday} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {loadTransport,updateTransport} from '../../../lib/transport-store';
import {readRecords} from '../../../lib/operation-records';
import {operatorBoats,operatorSailings,operatorStatement,operatorTickets} from '../../../lib/transport-operator';
import {buggyStatement,ownerBuggies} from '../../../lib/buggy-operator';
import {CREW_PREFIX,publicCrew,type Crew} from '../../../lib/operator-crew';
import {agentBookingSummaries,agentStatement,asAgent,resolveAgentCancelRequest} from '../../../lib/excursion-agents';
import {createPartner,deletePartner,loadPartners,publicPartner,purgeLegacyAccounts,updatePartner,type Partner} from '../../../lib/partners';

// Management → Partners: every outside business Nirili works with, what each may do, their
// cancellation requests and one monthly statement covering everything they booked or ran.
// Admin manages accounts; Excursions and Transfers staff can follow statements and requests.
const headers={'Cache-Control':'no-store'};
const canView=(u:any)=>u?.role==='admin'||hasPermission(u,'excursions_manager')||hasPermission(u,'edit_transfers');
const denied=()=>Response.json({error:'Admin, Excursions Manager or transfer access is required.'},{status:403,headers});
const adminOnly=()=>Response.json({error:'Admin access is required.'},{status:403,headers});
const actor=(u:any)=>u?.displayName||u?.username||'staff';

// Room and package bookings a partner made for stays starting this month.
function roomStatement(hotel:any,partnerId:string,month:string){
 const rows=(hotel.requests||[]).filter((q:any)=>q.tourOperatorId===partnerId&&String(q.checkIn||'').startsWith(month)&&!['Cancelled','Declined','Deleted'].includes(String(q.status||'')));
 return {bookings:rows.length,guests:rows.reduce((n:number,q:any)=>n+(Number(q.pax)||0),0),totalCents:rows.reduce((n:number,q:any)=>n+(Number(q.estimate)||0),0)};
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!canView(user))return denied();
 try{
  const month=new URL(r.url).searchParams.get('month')||islandToday().slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(month))throw Error('Choose a valid month.');
  const [rows,{state:transport},{state:hotel},crewRows]=await Promise.all([loadPartners(),loadTransport(),loadStays(),readRecords<Crew>(CREW_PREFIX)]);
  const today=islandToday(),agents=rows.filter(r=>r.partner.permissions?.includes('excursions')).map(r=>asAgent(r.partner));
  const excursions=agentStatement(hotel,agents,month);
  const partners=rows.map(({partner,revision})=>{
   const p=partner as Partner,boats=p.permissions.includes('boats'),buggies=p.permissions.includes('buggies');
   return {...publicPartner(p),revision,
    excursionStatement:p.permissions.includes('excursions')?excursions.find(s=>s.agentId===p.id)||null:null,
    excursionBookings:p.permissions.includes('excursions')?agentBookingSummaries(hotel,p.id).filter(b=>b.date.startsWith(month)||b.cancelRequested):[],
    roomStatement:p.permissions.includes('rooms')?roomStatement(hotel,p.id,month):null,
    boats:boats?operatorBoats(transport,p.id):[],departures:boats?operatorSailings(transport,p.id).length:0,
    upcomingTickets:boats?operatorTickets(transport,p.id,t=>t.journey.operatorStatus!=='Declined'&&!t.journey.departedAt&&t.journey.date>=today).length:0,
    boatStatement:boats?operatorStatement(transport,p,month,today):null,
    crew:crewRows.filter(c=>c.key.startsWith(CREW_PREFIX)&&c.value.operatorId===p.id).map(c=>{const x=publicCrew(c.value);return {id:x.id,name:x.name,role:x.role,active:x.active};}),
    buggies:buggies?ownerBuggies(hotel,p.id).map((b:any)=>({id:b.id,name:b.name,capacity:b.capacity,status:b.status,driver:b.driver||''})):[],
    buggyStatement:buggies?buggyStatement(hotel,p,month):null};
  });
  return Response.json({month,today,partners,canEdit:user?.role==='admin'},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not load partners.'},{status:400,headers});}
}

// Create a partner (Admin), or remove the old separate test logins and their test data.
export async function POST(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return adminOnly();
 try{
  const body:Record<string,any>=await r.json();
  if(body.action==='purge-legacy'){
   const accounts=await purgeLegacyAccounts();
   const current=new Set((await loadPartners()).map(r=>r.partner.id));
   const old=(id?:string)=>!!id&&!current.has(id);
   // Boats, routes and charter routes of the old operators. Sold tickets stay as history.
   const {result:transport}=await updateTransport('partners:purge',state=>{
    const before=state.sailings.length+(state.boats||[]).length+(state.charterRates||[]).length;
    state.sailings=state.sailings.filter(s=>!old(s.operatorId));
    state.boats=(state.boats||[]).filter(b=>!old(b.operatorId));
    state.charterRates=(state.charterRates||[]).filter(c=>!old(c.operatorId));
    return before-(state.sailings.length+state.boats.length+state.charterRates.length);
   });
   // Buggies registered by the old buggy owners.
   const {state:hotel,revision}=await loadStays();
   const fleet=(hotel.buggyFleet||[]).length;
   hotel.buggyFleet=(hotel.buggyFleet||[]).filter((b:any)=>!old(b.ownerId));
   const buggies=fleet-hotel.buggyFleet.length;
   if(buggies&&!await saveStayAccess(hotel,revision,'partners:purge'))throw Error('Buggies changed at the same moment. Run the clean-up again.');
   return Response.json({ok:true,accounts,transport,buggies},{headers});
  }
  const partner=await createPartner(body,actor(user));
  return Response.json({partner:publicPartner(partner)},{status:201,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create the partner.'},{status:400,headers});}
}

// Edit a partner (Admin), or decide on an excursion cancellation request (any viewer).
export async function PATCH(r:Request){
 const user=await currentUser();
 if(!canView(user)||!sameOrigin(r))return denied();
 try{
  const body:Record<string,any>=await r.json();
  if(body.action==='resolve-cancel'){
   const {state,revision}=await loadStays();
   resolveAgentCancelRequest(state,String(body.ref||''),body.approve===true,actor(user));
   if(!await saveStayAccess(state,revision,'partners'))return Response.json({error:'Another change was saved at the same time. Please try again.'},{status:409,headers});
   return Response.json({ok:true},{headers});
  }
  if(user?.role!=='admin')return adminOnly();
  const result=await updatePartner(String(body.id||''),Number(body.revision),body,actor(user));
  if(!result)return Response.json({error:'Partner not found.'},{status:404,headers});
  if(result==='conflict')return Response.json({error:'This partner was changed by someone else. Refresh and try again.'},{status:409,headers});
  return Response.json({partner:{...publicPartner(result.partner),revision:result.revision}},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save the partner.'},{status:400,headers});}
}

// Delete a partner login (Admin). Their bookings and trips stay in the system.
export async function DELETE(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return adminOnly();
 try{
  const body:any=await r.json(),id=String(body?.id||'');
  const deleted=await deletePartner(id);
  if(!deleted)return Response.json({error:'Partner not found.'},{status:404,headers});
  return Response.json({ok:true,deleted},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not delete the partner.'},{status:400,headers});}
}
