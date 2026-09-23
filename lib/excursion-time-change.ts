export function applyExcursionScheduleTimeChange(
 order:any,
 schedule:any,
 actor:string,
 resources:{vessels?:any[];crew?:any[]}={},
 changedAt=new Date().toISOString()
){
 const before={
  date:String(order?.date||order?.schedule?.date||schedule?.date||''),
  time:String(order?.time||order?.schedule?.time||'')
 };
 const after={date:String(schedule?.date||''),time:String(schedule?.time||'')};
 const vessel=(resources.vessels||[]).find((item:any)=>item.id===schedule?.vesselId);
 const crew=(resources.crew||[]).filter((item:any)=>schedule?.crewIds?.includes(item.id));
 order.scheduleTimeHistory=Array.isArray(order.scheduleTimeHistory)?order.scheduleTimeHistory:[];
 order.scheduleTimeHistory.push({at:changedAt,by:actor,from:before,to:after,scheduleId:String(schedule?.id||order?.scheduleId||'')});
 order.date=after.date;
 order.time=after.time;
 order.endTime=String(schedule?.endTime||'');
 order.returnTime=String(schedule?.returnTime||'');
 order.schedule={
  ...(order.schedule||{}),
  date:after.date,time:after.time,endTime:String(schedule?.endTime||''),returnTime:String(schedule?.returnTime||''),
  vesselId:String(schedule?.vesselId||''),vessel:String(vessel?.name||order.schedule?.vessel||''),
  crewIds:Array.isArray(schedule?.crewIds)?schedule.crewIds:[],crew:crew.map((person:any)=>person.name)
 };
 order.guestNotified=false;
 return {order,before,after};
}

export function excursionTimeChangeMessage(order:any,before:{date?:string;time?:string},after:{date?:string;time?:string}){
 const name=String(order?.packageName||order?.name||'Excursion');
 const oldTime=String(before?.time||'the previous time'),newTime=String(after?.time||'a new time'),date=String(after?.date||before?.date||'');
 return name+' departure changed from '+oldTime+' to '+newTime+(date?' on '+date:'')+'.';
}
