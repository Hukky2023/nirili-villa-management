import {sameOrigin} from '../../../../lib/auth';
import {islandToday} from '../../../../lib/guest-catalog';
import {loadStays} from '../../../../lib/stays';
import {saveStayAccess} from '../../../../lib/stay-login';
import {sendGuestPushForRide} from '../../../../lib/web-push';
import {RIDE_ACTIONS,acceptRide,advanceRide,buggyStatement,openRideRequests,ownerBuggies,ownerRides,saveOwnerBuggy,type RideAction} from '../../../../lib/buggy-operator';
import {offers,operatorFromRequest,publicOperator,setBuggyOnline,type Operator} from '../../../../lib/travel-operators';

// Buggy owner portal: go online, take waiting ride requests (first to accept wins), drive the
// ride, and see the monthly statement. Rider phone numbers are shown only after accepting.
const headers={'Cache-Control':'private, no-store'};
const denied=()=>Response.json({error:'Your session has ended. Please sign in again.'},{status:401,headers});

function rideView(ride:any,mine:boolean){
 return {id:ride.id,guest:ride.guest||'Guest',phone:mine?ride.phone||'':'',location:ride.location||'',destination:ride.destination||'',quantity:Math.max(1,Number(ride.quantity)||1),
  notes:ride.notes||'',date:ride.date||'',pickupTime:ride.pickupTime||'',status:ride.cancelled?'Cancelled':String(ride.buggyStatus||'Requested'),fareCents:Math.max(0,Number(ride.fareCents)||0),
  roomBilled:ride.bookingType==='guest-ride',buggyId:ride.buggyId||'',createdAt:ride.createdAt||''};
}
async function view(operator:Operator,month:string){
 const {state,revision}=await loadStays(),today=islandToday();
 const mine=ownerRides(state,operator.id);
 return {revision,today,month,operator:publicOperator(operator),online:!!operator.buggyOnline,
  buggies:ownerBuggies(state,operator.id),
  open:operator.buggyOnline?openRideRequests(state,today).map((r:any)=>rideView(r,false)):[],
  active:mine.filter((r:any)=>!r.cancelled&&!['Completed','Cancelled'].includes(String(r.buggyStatus||''))).map((r:any)=>rideView(r,true)),
  recent:mine.filter((r:any)=>r.cancelled||['Completed','Cancelled'].includes(String(r.buggyStatus||''))).slice(0,20).map((r:any)=>rideView(r,true)),
  statement:buggyStatement(state,operator,month)};
}
async function buggyOperator(r:Request){
 const operator=await operatorFromRequest(r);
 return operator&&offers(operator,'buggy')?operator:null;
}
const monthOf=(value:any)=>/^\d{4}-\d{2}$/.test(String(value||''))?String(value):islandToday().slice(0,7);

export async function GET(r:Request){
 try{
  const operator=await buggyOperator(r);
  if(!operator)return denied();
  return Response.json(await view(operator,monthOf(new URL(r.url).searchParams.get('month'))),{headers});
 }catch{return Response.json({error:'Could not load your rides. Please retry.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  let operator=await buggyOperator(r);
  if(!operator)return denied();
  const body:Record<string,any>=await r.json(),month=monthOf(body.viewMonth);
  if(body.action==='online'){
   operator=await setBuggyOnline(operator.id,body.online===true);
   return Response.json(await view(operator,month),{headers});
  }
  const owner={id:operator.id,name:operator.name,buggyOnline:operator.buggyOnline};
  let push:{ride:any;event:any}|null=null;
  for(let attempt=0;attempt<3;attempt++){
   const {state,revision}=await loadStays();
   if(body.action==='save-buggy')saveOwnerBuggy(state,owner,body.buggy);
   else if(body.action==='accept'){const {ride,buggy}=acceptRide(state,owner,String(body.rideId||''),String(body.buggyId||''));push={ride:{...ride,buggyName:buggy.name,driver:ride.buggyDriver},event:'assigned'};}
   else if(body.action==='advance'){
    if(!(RIDE_ACTIONS as readonly string[]).includes(body.step))throw Error('Choose a valid ride step.');
    const {ride,event}=advanceRide(state,owner,String(body.rideId||''),body.step as RideAction);
    const buggy=(state.buggyFleet||[]).find((b:any)=>b.id===ride.buggyId);
    if(event)push={ride:{...ride,buggyName:buggy?.name||'',driver:ride.buggyDriver||operator.name},event};
   }else throw Error('Unknown action.');
   if(!await saveStayAccess(state,revision,'operator:'+operator.id))continue;
   if(push){
    const stay=push.ride.stayId?(state.stays||[]).find((s:any)=>s.id===push!.ride.stayId):null;
    try{await sendGuestPushForRide({...push.ride,accountId:push.ride.accountId||stay?.accountId||''},push.event);}catch{}
   }
   return Response.json(await view(operator,month),{headers});
  }
  return Response.json({error:'Another driver updated the rides at the same moment. Please try again.'},{status:409,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save. Please try again.'},{status:400,headers});}
}
