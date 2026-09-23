import {authDb} from './auth';
import {ensureStandardDailyExcursions} from './excursion-default-schedule';
import {excursionDeparturePassed} from './guest-catalog';
import {excursionResources} from './excursion-workflow';
import {chooseAutoAssignmentCandidate} from './excursion-operations';

const prefix='excursion-schedule:';
async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>JSON.parse(row.payload)).sort((a:any,b:any)=>String(a.time||'').localeCompare(String(b.time||''))||String(a.name||'').localeCompare(String(b.name||'')));
}

export async function autoAssignExcursionOrder(state:any,order:any){
 if(!order||order.kind!=='excursion'||!order.date||order.privateBoatRequested===true||order.specialPackage===true||order.packageGroupId)return null;
 await ensureStandardDailyExcursions(order.date);
 const allSchedules=(await schedulesForDate(order.date)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
 const chosen=chooseAutoAssignmentCandidate(order,allSchedules,state.orders||[]);
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
