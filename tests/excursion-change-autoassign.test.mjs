import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAutoAssignmentCandidate} from '../lib/excursion-operations.ts';

const fishingOrder={
 id:'EXC-50EBE1AF',kind:'excursion',name:'Fishing',date:'2026-09-24',quantity:2,
 status:'Awaiting scheduling',approvalStatus:'Pending',privateBoatRequested:false
};
const schedules=[
 {id:'trip2',date:'2026-09-24',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',capacity:6,status:'Open',vesselId:'boat-b'},
 {id:'trip6',date:'2026-09-24',time:'16:30',endTime:'19:30',name:'Dolphin Watching + Fishing with Dinner',capacity:8,status:'Open',vesselId:'boat-a'}
];

test('approved Fishing date change auto-matches the next-day Fishing-compatible trip',()=>{
 const chosen=chooseAutoAssignmentCandidate(fishingOrder,schedules,[fishingOrder]);
 assert.ok(chosen);
 assert.equal(chosen.schedule.id,'trip6');
 assert.equal(chosen.schedule.time,'16:30');
 assert.equal(chosen.remaining,8);
});

test('auto-reassignment respects remaining capacity',()=>{
 const existing={id:'EXC-OTHER',kind:'excursion',name:'Dolphin Watching + Fishing with Dinner',date:'2026-09-24',quantity:7,status:'Scheduled',approvalStatus:'Approved',scheduleId:'trip6'};
 const chosen=chooseAutoAssignmentCandidate(fishingOrder,schedules,[fishingOrder,existing]);
 assert.equal(chosen,null);
});

test('auto-reassignment does not put Fishing on an incompatible trip',()=>{
 const chosen=chooseAutoAssignmentCandidate(fishingOrder,[schedules[0]],[fishingOrder]);
 assert.equal(chosen,null);
});

test('private boat changes stay in manual scheduling',()=>{
 const chosen=chooseAutoAssignmentCandidate({...fishingOrder,privateBoatRequested:true},schedules,[fishingOrder]);
 assert.equal(chosen,null);
});


test('auto-assignment chooses the earliest compatible trip even when a later trip is a closer name match',()=>{
 const order={...fishingOrder,id:'EARLY-TURTLE',name:'Turtle Snorkeling',quantity:2};
 const candidates=[
  {id:'early-combo',date:'2026-09-24',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',capacity:6,status:'Open',vesselId:'boat-a'},
  {id:'later-exact',date:'2026-09-24',time:'11:00',endTime:'12:00',name:'Turtle Snorkeling',capacity:6,status:'Open',vesselId:'boat-b'}
 ];
 const chosen=chooseAutoAssignmentCandidate(order,candidates,[order]);
 assert.ok(chosen);
 assert.equal(chosen.schedule.id,'early-combo');
 assert.equal(chosen.schedule.time,'08:00');
});

test('if the earliest compatible trip is full, auto-assignment uses the next earliest trip with enough seats',()=>{
 const order={...fishingOrder,id:'EARLY-CAPACITY',name:'Turtle Snorkeling',quantity:2};
 const candidates=[
  {id:'early',date:'2026-09-24',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',capacity:2,status:'Open',vesselId:'boat-a'},
  {id:'later',date:'2026-09-24',time:'10:30',endTime:'12:30',name:'Sandbank Trip + Turtle Snorkeling',capacity:6,status:'Open',vesselId:'boat-b'}
 ];
 const existing={id:'FULL',kind:'excursion',name:'Turtle Snorkeling',date:'2026-09-24',quantity:2,status:'Scheduled',approvalStatus:'Approved',scheduleId:'early'};
 const chosen=chooseAutoAssignmentCandidate(order,candidates,[order,existing]);
 assert.ok(chosen);
 assert.equal(chosen.schedule.id,'later');
 assert.equal(chosen.schedule.time,'10:30');
});
