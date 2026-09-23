import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAutoAssignmentCandidate} from '../lib/excursion-auto-assignment.ts';

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
