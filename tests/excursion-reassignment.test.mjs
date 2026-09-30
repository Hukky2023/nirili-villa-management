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

import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {excursionReassignmentError} from '../lib/excursion-reassignment.ts';

const routeSource=fs.readFileSync(new URL('../app/api/excursion-bookings/route.ts',import.meta.url),'utf8');
const routeCode=stripTypeScriptTypes(routeSource.replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
function moveHarness(overrides={},options={}){
 const order={id:'MISSED',kind:'excursion',status:'Scheduled',approvalStatus:'Approved',date:'2026-09-30',time:'11:00',scheduleId:'old',name:'Shark Snorkeling',quantity:2,cents:10000,excursionPayments:[{cents:5000}],excursionGuestRoster:[{id:'MISSED:1',slot:1,name:'Guest A',boarded:false},{id:'MISSED:2',slot:2,name:'Guest B',boarded:false}],attendanceReviewedAt:'2026-09-30T06:00:00Z',attendanceReviewedBy:'admin',...overrides};
 const target={id:'next',date:'2026-10-01',time:'11:00',name:'Shark Snorkeling',status:'Open',capacity:6};
 const state={orders:[order],stays:[]};
 let saved=0;
 const context=vm.createContext({Response,Request,URL,Date,Map,Set,JSON,Number,String,Array,Error,
  currentUser:async()=>({role:options.denied?'staff':'admin',username:'admin',userId:'admin'}),
  hasPermission:()=>!options.denied,sameOrigin:()=>true,loadStays:async()=>({state,revision:7}),
  isConfirmedExcursion:()=>true,validDate:d=>/^\d{4}-\d{2}-\d{2}$/.test(d),islandToday:()=> '2026-09-30',
  excursionDeparturePassed:(d,t)=>d<'2026-09-30'||d==='2026-09-30'&&t<='13:05',
  readExcursionSchedulesPrimary:async()=>[options.pastTarget?{...target,date:'2026-09-30',time:'12:00'}:target],
  excursionResources:()=>({vessels:[],crew:[]}),
  excursionScheduleLoadForOrder:()=>({capacity:6,confirmedPax:options.full?5:0,remaining:options.full?1:6}),
  scheduleCanServeRequest:()=>true,applyExcursionReassignment,excursionReassignmentError,
  saveStayAccess:async()=>{saved++;return true;},
 });
 vm.runInContext(routeCode,context);
 const body={action:'reassign-booking',id:'MISSED',scheduleId:'next',scheduleDate:options.pastTarget?'2026-09-30':'2026-10-01',revision:options.stale?6:7,note:'Guest did not board'};
 return {order,get saved(){return saved;},get:()=>context.GET(new Request('https://example.test/api/excursion-bookings?bookingId=MISSED&scheduleDate=2026-10-01')),patch:()=>context.PATCH(new Request('https://example.test/api/excursion-bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('admin moves unboarded guests after original departure to tomorrow without changing their bill',async()=>{
 const h=moveHarness(),before=structuredClone(h.order);
 assert.equal((await h.get()).status,200);
 const response=await h.patch();assert.equal(response.status,200,JSON.stringify(await response.json()));
 assert.equal(h.saved,1);assert.equal(h.order.date,'2026-10-01');assert.equal(h.order.scheduleId,'next');
 assert.equal(h.order.cents,before.cents);assert.deepEqual(h.order.excursionPayments,before.excursionPayments);
 assert.deepEqual(h.order.excursionGuestRoster,before.excursionGuestRoster);
 assert.equal(h.order.attendanceReviewedAt,undefined);
 assert.equal(h.order.assignmentHistory[0].attendanceReviewedAt,before.attendanceReviewedAt);
});
test('partly boarded bookings are rejected by both options and save, even before status updates',async()=>{
 const h=moveHarness({excursionGuestRoster:[{boarded:false},{boarded:true}]});
 assert.equal((await h.get()).status,409);assert.equal((await h.patch()).status,409);assert.equal(h.saved,0);
});
test('a fully boarded booking cannot move',async()=>{
 const h=moveHarness({excursionGuestRoster:[{boarded:true},{boarded:true}]});
 assert.equal((await h.patch()).status,409);assert.equal(h.saved,0);
});
for(const status of ['Departed','Completed','Cancelled'])test(status+' bookings cannot move',async()=>{
 const h=moveHarness({status});assert.equal((await h.patch()).status,409);assert.equal(h.saved,0);
});
for(const [name,options,expected] of [['insufficient seats',{full:true},409],['stale revision',{stale:true},409],['unauthorized user',{denied:true},403],['past target departure',{pastTarget:true},409]])test(name+' still blocks reassignment',async()=>{
 const h=moveHarness({},options);assert.equal((await h.patch()).status,expected);assert.equal(h.saved,0);
});
