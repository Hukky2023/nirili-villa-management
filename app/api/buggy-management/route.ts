import {currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {islandToday,validDate} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {isRomanticBeachDinner} from '../../../lib/excursion-services';

const fleetStatuses=['Available','Assigned','Charging','Maintenance','Out of Service'] as const;
const clean=(value:any,max=120)=>String(value||'').trim().slice(0,max);
const allowed=async()=>{const user=await currentUser();return {user,ok:!!user&&(user.role==='admin'||hasPermission(user,'guesthouse_reception'))};};
function minusMinutes(time:string,minutes:number){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return '';const [h,m]=time.split(':').map(Number),total=(h*60+m-minutes+1440)%1440;return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
function confirmed(order:any){return order?.kind==='excursion'&&order.status!=='Cancelled'&&order.status!=='Completed'&&order.approvalStatus!=='Pending'&&order.approvalStatus!=='Declined'&&order.approvalStatus!=='Cancelled'&&(!!(order.time||order.schedule?.time)||isRomanticBeachDinner(order));}
function dispatchFor(order:any,state:any){
 const stay=order.stayId?(state.stays||[]).find((s:any)=>s.id===order.stayId):null,inHouse=!!stay||!!order.stayId;
 const time=String(order.time||order.schedule?.time||''),romanticDinner=isRomanticBeachDinner(order),roundTrip=romanticDinner&&!!order.buggyRoundTrip;
 return {id:order.id,source:'excursion',guest:order.guest||stay?.guest||'Guest',phone:order.phone||stay?.whatsapp||'',room:inHouse?String(stay?.room||order.room||''):String(order.externalRoom||order.room||''),date:order.date||order.schedule?.date||'',pickupTime:minusMinutes(time,15),location:inHouse?'Nirili Villa':clean(order.hotel)||'Guest meeting location',destination:romanticDinner?'Romantic Beach Dinner location':'Excursion meeting point',quantity:Math.max(1,Number(order.quantity)||1),service:order.name||'Excursion',status:order.buggyStatus||(!order.buggyArrivedAt?'Pending pickup':!order.buggyBoardedAt?'Arrived':roundTrip&&!order.buggyReturnCompleteAt?'In progress':'Completed'),buggyId:order.buggyId||'',driver:order.buggyDriver||'',roundTrip,createdAt:order.createdAt||''};
}
function manualDispatch(item:any){
 const guestRide=item.bookingType==='guest-ride';
 return {id:item.id,source:guestRide?'guest':'manual',guest:item.guest||'Guest',phone:item.phone||'',room:item.room||'',date:item.date||'',pickupTime:item.pickupTime||'',location:item.location||'',destination:item.destination||'',quantity:Math.max(1,Number(item.quantity)||1),service:guestRide?'Guest buggy ride':item.excursion||'Buggy booking',status:item.buggyStatus||(guestRide?'Requested':!item.buggyArrivedAt?'Pending pickup':!item.buggyBoardedAt?'Arrived':'Completed'),buggyId:item.buggyId||'',driver:item.buggyDriver||'',roundTrip:false,guestRide,fareCents:Math.max(0,Number(item.fareCents)||0),chargeToRoom:item.chargeToRoom===true,createdAt:item.createdAt||''};
}
function timeMinutes(value:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return null;const [h,m]=value.split(':').map(Number);return h*60+m;}
function activeStatus(status:string){return !['Completed','Round trip complete','Cancelled'].includes(status);}
function assignmentConflict(state:any,id:string,buggyId:string,date:string,pickupTime:string){
 const when=timeMinutes(pickupTime);
 return dispatchesFor(state,date).find((x:any)=>{
  if(x.id===id||x.buggyId!==buggyId||!activeStatus(String(x.status||'')))return false;
  const other=timeMinutes(String(x.pickupTime||''));
  if(when==null||other==null)return true;
  return Math.abs(when-other)<45;
 });
}
function normalizedFleet(state:any){
 state.buggyFleet??=[];
 return state.buggyFleet.map((b:any)=>({id:b.id,name:b.name,capacity:Number(b.capacity)||4,status:fleetStatuses.includes(b.status)?b.status:'Available',driver:b.driver||'',driverPhone:b.driverPhone||'',battery:b.battery===''||b.battery==null?null:Math.max(0,Math.min(100,Number(b.battery)||0)),trackerProvider:b.trackerProvider||'',trackerId:b.trackerId||'',lastLatitude:Number.isFinite(Number(b.lastLatitude))?Number(b.lastLatitude):null,lastLongitude:Number.isFinite(Number(b.lastLongitude))?Number(b.lastLongitude):null,lastLocationAt:b.lastLocationAt||'',maintenanceDue:b.maintenanceDue||'',notes:b.notes||''}));
}
function dispatchesFor(state:any,date?:string){
 const excursions=(state.orders||[]).filter((o:any)=>confirmed(o)&&(!!o.stayId||o.buggyRequested===true)&&(!date||(o.date||o.schedule?.date)===date)).map((o:any)=>dispatchFor(o,state));
 const manual=(state.buggyBookings||[]).filter((b:any)=>b.cancelled!==true&&(!date||b.date===date)).map(manualDispatch);
 return [...excursions,...manual].sort((a:any,b:any)=>(a.date||'').localeCompare(b.date||'')||(a.pickupTime||'').localeCompare(b.pickupTime||'')||a.guest.localeCompare(b.guest));
}
function historyFor(state:any){
 return (state.buggyTripHistory||[]).slice().sort((a:any,b:any)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,150);
}
function maintenanceFor(state:any){
 return (state.buggyMaintenance||[]).slice().sort((a:any,b:any)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,150);
}
export async function GET(r:Request){
 const {ok}=await allowed();if(!ok)return Response.json({error:'Buggy management access required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||islandToday();if(!validDate(date))return Response.json({error:'Choose a valid date.'},{status:400});
 try{const {state}=await loadStays();return Response.json({date,settings:{guestRideFareCents:Math.max(0,Number(state.buggySettings?.guestRideFareCents)||0)},fleet:normalizedFleet(state),dispatches:dispatchesFor(state,date),upcoming:dispatchesFor(state).filter((x:any)=>x.date>=date).slice(0,100),maintenance:maintenanceFor(state),history:historyFor(state)},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Could not load buggy management.'},{status:503});}
}
export async function POST(r:Request){
 const {user,ok}=await allowed();if(!ok||!sameOrigin(r))return Response.json({error:'Buggy management access required.'},{status:403});
 try{
  const body=await r.json(),action=clean(body.action,40),{state,revision}=await loadStays();state.buggyFleet??=[];state.buggyMaintenance??=[];state.buggyTripHistory??=[];state.buggyBookings??=[];state.buggySettings??={guestRideFareCents:0};
  const actor=user?.username||user?.displayName||'management',now=new Date().toISOString();
  if(action==='save-settings'){
   if(user?.role!=='admin')throw Error('Only Admin can change buggy pricing.');
   const fareCents=Math.max(0,Math.min(100000,Math.round(Number(body.guestRideFareCents)||0)));
   state.buggySettings={...state.buggySettings,guestRideFareCents:fareCents,updatedAt:now,updatedBy:actor};
  }else if(action==='save-buggy'){
   const id=clean(body.id,100)||'buggy-'+crypto.randomUUID(),name=clean(body.name,80),capacity=Math.max(1,Math.min(20,Number(body.capacity)||4)),status=clean(body.status,30) as any;
   if(!name)throw Error('Enter the buggy name.');if(!fleetStatuses.includes(status))throw Error('Choose a valid buggy status.');
   const item={id,name,capacity,status,driver:clean(body.driver,100),driverPhone:clean(body.driverPhone,30),battery:body.battery===''||body.battery==null?'':Math.max(0,Math.min(100,Number(body.battery)||0)),trackerProvider:clean(body.trackerProvider,80),trackerId:clean(body.trackerId,120),maintenanceDue:clean(body.maintenanceDue,10),notes:clean(body.notes,500),updatedAt:now,updatedBy:actor};
   const index=state.buggyFleet.findIndex((x:any)=>x.id===id);if(index>=0)state.buggyFleet[index]={...state.buggyFleet[index],...item};else state.buggyFleet.push({...item,createdAt:now});
  }else if(action==='delete-buggy'){
   if(user?.role!=='admin')throw Error('Only Admin can delete a buggy.');
   const id=clean(body.id,100);if(!id)throw Error('Buggy not found.');state.buggyFleet=state.buggyFleet.filter((x:any)=>x.id!==id);
   for(const x of [...(state.orders||[]),...(state.buggyBookings||[])])if(x.buggyId===id){delete x.buggyId;delete x.buggyDriver;}
  }else if(action==='assign'){
   const id=clean(body.id,120),buggyId=clean(body.buggyId,100),driver=clean(body.driver,100),buggy=state.buggyFleet.find((x:any)=>x.id===buggyId);
   if(!id||!buggy)throw Error('Choose a valid buggy.');
   if(['Maintenance','Out of Service','Charging'].includes(String(buggy.status)))throw Error('That buggy is not available for dispatch.');
   const item=(state.buggyBookings||[]).find((x:any)=>x.id===id&&x.cancelled!==true)||(state.orders||[]).find((x:any)=>x.id===id);
   if(!item)throw Error('Buggy booking not found.');
   const row=dispatchesFor(state).find((x:any)=>x.id===id);
   if(Math.max(1,Number(item.quantity)||1)>Math.max(1,Number(buggy.capacity)||4))throw Error('This buggy does not have enough seats for the booking.');
   const conflict=assignmentConflict(state,id,buggyId,String(row?.date||item.date||item.schedule?.date||''),String(row?.pickupTime||item.pickupTime||''));
   if(conflict)throw Error(buggy.name+' is already assigned near this pickup time. Choose another buggy.');
   item.buggyId=buggyId;item.buggyDriver=driver||buggy.driver||'';item.buggyAssignedAt=now;item.buggyAssignedBy=actor;
   if(item.bookingType==='guest-ride'&&!['Arrived','On trip','Completed','Cancelled'].includes(String(item.buggyStatus||'')))item.buggyStatus='Driver on the way';
   buggy.status='Assigned';if(driver)buggy.driver=driver;buggy.updatedAt=now;buggy.updatedBy=actor;
   state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Assigned',buggyId,buggyName:buggy.name,bookingId:id,guest:item.guest||'',driver:item.buggyDriver||'',by:actor});
  }else if(action==='set-status'){
   const id=clean(body.id,100),status=clean(body.status,30) as any,buggy=state.buggyFleet.find((x:any)=>x.id===id);
   if(!buggy||!fleetStatuses.includes(status))throw Error('Choose a valid buggy and status.');buggy.status=status;buggy.updatedAt=now;buggy.updatedBy=actor;
  }else if(action==='maintenance'){
   const buggyId=clean(body.buggyId,100),buggy=state.buggyFleet.find((x:any)=>x.id===buggyId),date=clean(body.date,10),kind=clean(body.kind,80),notes=clean(body.notes,500),cost=Math.max(0,Number(body.cost)||0),setMaintenance=body.setMaintenance===true;
   if(!buggy||!validDate(date)||!kind)throw Error('Choose a buggy, date and maintenance type.');
   state.buggyMaintenance.push({id:'buggy-maint-'+crypto.randomUUID(),buggyId,buggyName:buggy.name,date,kind,notes,cost,createdAt:now,createdBy:actor});
   if(setMaintenance)buggy.status='Maintenance';buggy.updatedAt=now;buggy.updatedBy=actor;
  }else throw Error('Choose a valid buggy management action.');
  const saved=await saveStayAccess(state,revision,user?.userId||'buggy-management');if(!saved)return Response.json({error:'Another update was saved. Refresh and try again.'},{status:409});
  return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update buggy management.'},{status:400});}
}
