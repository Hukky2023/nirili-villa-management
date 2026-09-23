import test from 'node:test';
import assert from 'node:assert/strict';
import {applyExcursionReassignment} from '../lib/excursion-reassignment.ts';
import {excursionScheduleLoadForOrder,scheduleCanServeRequest} from '../lib/excursion-operations.ts';

test('manual reassignment changes only trip assignment and preserves booking/billing/guest data',()=>{
 const order={
  id:'EXC-100',kind:'excursion',guest:'Guest A',guestNames:['Guest A','Guest B'],quantity:2,
  date:'2026-09-24',time:'08:00',endTime:'09:30',scheduleId:'trip-old',name:'Turtle Snorkeling',
  schedule:{date:'2026-09-24',time:'08:00',endTime:'09:30',vesselId:'boat-old',vessel:'Old Boat',crewIds:['c1'],crew:['Crew 1']},
  approvalStatus:'Approved',status:'Scheduled',cents:5000,quotedCents:5000,
  excursionPayments:[{cents:2500,method:'Cash'}],buggyRequested:true,pickupLocation:'Hotel A',externalRoom:'101',
  packageGroupId:'',notes:'Keep this',manageToken:'secret'
 };
 const target={id:'trip-new',date:'2026-09-24',time:'10:30',endTime:'12:30',name:'Sandbank Trip + Turtle Snorkeling',vesselId:'boat-new',crewIds:['c2']};
 const resources={vessels:[{id:'boat-new',name:'New Boat'}],crew:[{id:'c2',name:'Crew 2'}]};
 const before=structuredClone(order);
 const result=applyExcursionReassignment(order,target,resources,'manager','Guest requested later trip',true,'2026-09-23T16:00:00Z');
 assert.equal(result.before.scheduleId,'trip-old');
 assert.equal(order.scheduleId,'trip-new');assert.equal(order.time,'10:30');assert.equal(order.schedule.vessel,'New Boat');
 assert.equal(order.guest,before.guest);assert.deepEqual(order.guestNames,before.guestNames);assert.equal(order.quantity,before.quantity);
 assert.equal(order.cents,before.cents);assert.equal(order.quotedCents,before.quotedCents);assert.deepEqual(order.excursionPayments,before.excursionPayments);
 assert.equal(order.buggyRequested,true);assert.equal(order.pickupLocation,'Hotel A');assert.equal(order.externalRoom,'101');assert.equal(order.notes,'Keep this');assert.equal(order.manageToken,'secret');
 assert.equal(order.assignmentHistory.length,1);assert.equal(order.assignmentHistory[0].by,'manager');assert.equal(order.assignmentHistory[0].reason,'Guest requested later trip');
 assert.equal(order.autoConfirmed,false);assert.equal(order.status,'Scheduled');assert.equal(order.approvalStatus,'Approved');
});

test('manual override is recorded when manager intentionally picks a non-standard trip',()=>{
 const order={id:'EXC-101',kind:'excursion',date:'2026-09-24',time:'16:30',scheduleId:'old',name:'Fishing',quantity:2,status:'Scheduled',approvalStatus:'Approved',cents:8000};
 const target={id:'turtle-trip',date:'2026-09-24',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',vesselId:'boat'};
 const result=applyExcursionReassignment(order,target,{vessels:[{id:'boat',name:'Boat'}],crew:[]},'admin','Manual operational move',false,'2026-09-23T16:00:00Z');
 assert.equal(result.manualOverride,true);assert.equal(order.assignmentHistory[0].manualOverride,true);assert.equal(order.matchedFromMenu,false);
 assert.equal(scheduleCanServeRequest('Fishing',target.name),false);
});

test('package leg keeps its package linkage when moved to another compatible trip',()=>{
 const order={id:'EXC-P1',kind:'excursion',packageGroupId:'PKG-1',packageName:'Special Package',packagePart:1,packageParts:3,date:'2026-09-24',time:'08:00',scheduleId:'old',name:'Turtle',quantity:2,status:'Scheduled',approvalStatus:'Approved',cents:7000};
 applyExcursionReassignment(order,{id:'new',date:'2026-09-25',time:'10:30',endTime:'12:30',name:'Sandbank + Turtle',vesselId:''},{vessels:[],crew:[]},'manager','',true,'2026-09-23T16:00:00Z');
 assert.equal(order.packageGroupId,'PKG-1');assert.equal(order.packageName,'Special Package');assert.equal(order.packagePart,1);assert.equal(order.packageParts,3);
 assert.equal(order.date,'2026-09-25');assert.equal(order.scheduleId,'new');
});

test('capacity calculation excludes the booking being moved but counts other confirmed guests',()=>{
 const schedules=[{id:'trip',date:'2026-09-24',time:'16:30',endTime:'19:30',name:'Dolphin Watching + Fishing with Dinner',capacity:8,status:'Open',vesselId:'boat'}];
 const moving={id:'MOVE',kind:'excursion',date:'2026-09-24',scheduleId:'trip',quantity:2,status:'Scheduled',approvalStatus:'Approved',name:'Fishing'};
 const other={id:'OTHER',kind:'excursion',date:'2026-09-24',scheduleId:'trip',quantity:5,status:'Scheduled',approvalStatus:'Approved',name:'Fishing'};
 const load=excursionScheduleLoadForOrder(schedules[0],schedules,[moving,other],moving.id);
 assert.equal(load.capacity,8);assert.equal(load.confirmedPax,5);assert.equal(load.remaining,3);
});
