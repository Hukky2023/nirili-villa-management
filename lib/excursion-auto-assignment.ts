import {authDb} from './auth';
import {ensureStandardDailyExcursions} from './excursion-default-schedule';
import {excursionDeparturePassed} from './guest-catalog';
import {excursionResources} from './excursion-workflow';
import {scheduleCanServeRequest,scheduleMatchRank} from './excursion-operations';

const prefix='excursion-schedule:';
const normal=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();

function matches(order:any,schedule:any){
 if(order.kind!=='excursion'||order.status==='Cancelled'||order.approvalStatus==='Declined'||order.approvalStatus==='Cancelled')return false;
 if(order.scheduleId)return order.scheduleId===schedule.id&&(order.date||order.schedule?.date)===schedule.date;
 const stored=order.schedule||{};
 return (stored.date||order.date)===schedule.date&&stored.time===schedule.time&&(!schedule.vesselId||stored.vesselId===schedule.vesselId)&&normal(order.name)===normal(schedule.name);
}

const sharedKey=(schedule:any)=>schedule.sharedGroup
 ?schedule.date+'|'+schedule.time+'|group:'+schedule.sharedGroup
 :schedule.vesselId?schedule.date+'|'+schedule.time+'|vessel:'+schedule.vesselId:'';

function candidateLoad(schedule:any,allSchedules:any[],orders:any[],excludeOrderId=''){
 const key=sharedKey(schedule);
 const groupSchedules=key?allSchedules.filter((item:any)=>sharedKey(item)===key):[schedule];
 const groupIds=new Set(groupSchedules.map((item:any)=>item.id));
 const capacity=Math.min(...groupSchedules.map((item:any)=>Math.max(1,Number(item.capacity)||1)));
 const confirmedPax=orders
  .filter((order:any)=>order.id!==excludeOrderId&&order.kind==='excursion'&&!order.separateVessel&&order.status!=='Cancelled'&&order.approvalStatus!=='Pending'&&order.approvalStatus!=='Declined'&&order.approvalStatus!=='Cancelled'&&(groupIds.has(order.scheduleId)||groupSchedules.some((item:any)=>matches(order,item))))
  .reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quantity)||0),0);
 return {capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax)};
}

async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>JSON.parse(row.payload)).sort((a:any,b:any)=>String(a.time||'').localeCompare(String(b.time||''))||String(a.name||'').localeCompare(String(b.name||'')));
}

export async function autoAssignExcursionOrder(state:any,order:any){
 if(!order||order.kind!=='excursion'||!order.date||order.privateBoatRequested===true||order.specialPackage===true||order.packageGroupId)return null;
 await ensureStandardDailyExcursions(order.date);
 const allSchedules=(await schedulesForDate(order.date)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
 const quantity=Math.max(1,Number(order.quantity)||1);
 const candidates=allSchedules
  .filter((schedule:any)=>scheduleCanServeRequest(order.name,schedule.name))
  .map((schedule:any)=>({schedule,...candidateLoad(schedule,allSchedules,state.orders||[],order.id),rank:scheduleMatchRank(order.name,schedule.name)}))
  .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));
 const chosen=candidates.find((candidate:any)=>candidate.remaining>=quantity);
 if(!chosen)return null;

 const schedule=chosen.schedule,resources=excursionResources(state);
 const vessel=resources.vessels.find((value:any)=>value.id===schedule.vesselId);
 const crew=resources.crew.filter((value:any)=>schedule.crewIds?.includes(value.id));
 order.time=schedule.time;
 order.endTime=schedule.endTime||'';
 order.returnTime=schedule.returnTime||'';
 order.scheduleId=schedule.id;
 order.seatRequest=false;
 order.unscheduledRequest=false;
 order.requestedOverCapacity=false;
 order.approvalStatus='Approved';
 order.status='Scheduled';
 order.autoConfirmed=true;
 order.matchedFromMenu=true;
 order.matchedScheduleName=schedule.name;
 order.cents=Math.max(0,Number(order.quotedCents)||0);
 order.schedule={
  date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',
  ...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),
  vesselId:schedule.vesselId,vessel:vessel?.name||'',
  crewIds:schedule.crewIds||[],crew:crew.map((person:any)=>person.name)
 };
 order.guestNotified=false;
 delete order.preferredTime;delete order.preferredEndTime;delete order.preferredScheduleId;
 return {schedule,remainingBefore:chosen.remaining};
}
