export function excursionReassignmentError(order:any):string{
 if(['Departed','Completed','Cancelled','Guests boarded','Guests boarded & Departed','Arrived','Arrived & Completed'].includes(String(order?.status||'')))return 'Boarded, departed, completed or cancelled bookings cannot be reassigned.';
 if(Array.isArray(order?.excursionGuestRoster)&&order.excursionGuestRoster.some((person:any)=>person?.boarded===true))return 'This booking includes guests who have boarded and cannot be moved as a whole.';
 return '';
}

export function excursionAssignmentSnapshot(order:any){
 return {
  date:String(order?.date||order?.schedule?.date||''),
  time:String(order?.time||order?.schedule?.time||''),
  endTime:String(order?.endTime||order?.schedule?.endTime||''),
  scheduleId:String(order?.scheduleId||''),
  scheduleName:String(order?.matchedScheduleName||order?.schedule?.name||order?.name||''),
  vesselId:String(order?.schedule?.vesselId||''),
  vessel:String(order?.schedule?.vessel||'')
 };
}

export function applyExcursionReassignment(
 order:any,
 target:any,
 resources:{vessels:any[];crew:any[]},
 actor:string,
 note='',
 compatible=true,
 now=new Date().toISOString()
){
 if(!order||!target)throw Error('Booking and target trip are required.');
 const blocked=excursionReassignmentError(order);if(blocked)throw Error(blocked);
 const before=excursionAssignmentSnapshot(order);
 const vessel=(resources?.vessels||[]).find((item:any)=>item.id===target.vesselId);
 const crew=(resources?.crew||[]).filter((item:any)=>target.crewIds?.includes(item.id));
 order.assignmentHistory=Array.isArray(order.assignmentHistory)?order.assignmentHistory:[];
 order.assignmentHistory.push({
  at:now,by:actor,reason:String(note||'').trim().slice(0,500),manualOverride:!compatible,
  attendanceReviewedAt:order.attendanceReviewedAt||'',attendanceReviewedBy:order.attendanceReviewedBy||'',
  from:before,
  to:{date:target.date,time:target.time,endTime:target.endTime||'',scheduleId:target.id,scheduleName:target.name,vesselId:target.vesselId||'',vessel:vessel?.name||target.vessel||''}
 });
 order.date=target.date;order.time=target.time;order.endTime=target.endTime||'';order.returnTime=target.returnTime||'';order.scheduleId=target.id;
 order.schedule={
  date:target.date,time:target.time,endTime:target.endTime||'',
  ...(target.returnTime?{returnTime:target.returnTime}:{}),
  vesselId:target.vesselId,vessel:vessel?.name||target.vessel||'',
  crewIds:target.crewIds||[],crew:crew.map((person:any)=>person.name)
 };
 order.approvalStatus='Approved';order.status='Scheduled';order.seatRequest=false;order.unscheduledRequest=false;order.requestedOverCapacity=false;order.autoConfirmed=false;
 order.matchedFromMenu=compatible;order.matchedScheduleName=target.name;order.manuallyReassigned=true;order.reassignedAt=now;order.reassignedBy=actor;order.guestNotified=false;
 // Boarding must be reviewed again for the new departure.
 delete order.attendanceReviewedAt;delete order.attendanceReviewedBy;
 delete order.preferredTime;delete order.preferredEndTime;delete order.preferredScheduleId;delete order.scheduleCancelled;delete order.rescheduleReason;
 return {order,before,after:excursionAssignmentSnapshot(order),compatible,manualOverride:!compatible};
}
