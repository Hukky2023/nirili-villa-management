import {currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {islandToday} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {loadTransport} from '../../../lib/transport-store';
import {operatorBoats,operatorSailings,operatorStatement,operatorTickets} from '../../../lib/transport-operator';
import {buggyStatement,ownerBuggies} from '../../../lib/buggy-operator';
import {createOperator,loadOperators,offers,publicOperator,updateOperator} from '../../../lib/travel-operators';

// Staff side of the Nirili Travels marketplace: operator accounts and commission, their fleets,
// and monthly statements. Admin manages accounts; transfer staff can follow statements.
const headers={'Cache-Control':'no-store'};
const canView=(u:any)=>u?.role==='admin'||hasPermission(u,'edit_transfers');
const actor=(u:any)=>u?.displayName||u?.username||'staff';

export async function GET(r:Request){
 const user=await currentUser();
 if(!canView(user))return Response.json({error:'Admin or transfer access is required.'},{status:403,headers});
 try{
  const month=new URL(r.url).searchParams.get('month')||islandToday().slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(month))throw Error('Choose a valid month.');
  const [rows,{state:transport},{state:hotel}]=await Promise.all([loadOperators(),loadTransport(),loadStays()]);
  const today=islandToday();
  const operators=rows.map(({operator,revision})=>({...publicOperator(operator),revision,
   boats:offers(operator,'boat')?operatorBoats(transport,operator.id):[],
   departures:offers(operator,'boat')?operatorSailings(transport,operator.id).length:0,
   upcomingTickets:offers(operator,'boat')?operatorTickets(transport,operator.id,t=>t.journey.operatorStatus!=='Declined'&&!t.journey.departedAt&&t.journey.date>=today).length:0,
   boatStatement:offers(operator,'boat')?operatorStatement(transport,operator,month,today):null,
   buggies:offers(operator,'buggy')?ownerBuggies(hotel,operator.id).map((b:any)=>({id:b.id,name:b.name,capacity:b.capacity,status:b.status,driver:b.driver||''})):[],
   buggyStatement:offers(operator,'buggy')?buggyStatement(hotel,operator,month):null}));
  return Response.json({month,today,operators,canEdit:user?.role==='admin'},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not load travel operators.'},{status:400,headers});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access is required.'},{status:403,headers});
 try{
  const operator=await createOperator(await r.json(),actor(user));
  return Response.json({operator:publicOperator(operator)},{status:201,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create the operator.'},{status:400,headers});}
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access is required.'},{status:403,headers});
 try{
  const body:Record<string,any>=await r.json();
  const result=await updateOperator(String(body.id||''),Number(body.revision),body,actor(user));
  if(!result)return Response.json({error:'Operator not found.'},{status:404,headers});
  if(result==='conflict')return Response.json({error:'This operator was changed by someone else. Refresh and try again.'},{status:409,headers});
  return Response.json({operator:{...publicOperator(result.operator),revision:result.revision}},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save the operator.'},{status:400,headers});}
}
