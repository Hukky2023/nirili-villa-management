import test from 'node:test';
import assert from 'node:assert/strict';
import {excursionComponents,isDroneRequiredTrip,isSnorkelingTrip,planSpecialPackageSchedules,scheduleCanServeRequest} from '../lib/excursion-operations.ts';

test('Special Package is recognized as its six included excursion components',()=>{
 assert.deepEqual(excursionComponents('Special Package'),['turtle','shark','sandbank','coral garden','dolphin','fishing']);
 assert.equal(isSnorkelingTrip('Special Package'),true);
 assert.equal(isDroneRequiredTrip('Special Package'),true);
});

test('Special Package can auto-match a compatible full-package schedule',()=>{
 assert.equal(scheduleCanServeRequest('Special Package','Special Package'),true);
 assert.equal(scheduleCanServeRequest('Special Package','Turtle + Shark + Sandbank + Coral Garden + Dolphin Watching + Fishing with Dinner'),true);
});

test('partial standard trips do not falsely satisfy the whole Special Package',()=>{
 assert.equal(scheduleCanServeRequest('Special Package','Turtle Snorkeling + Coral Garden Snorkeling'),false);
 assert.equal(scheduleCanServeRequest('Special Package','Shark Snorkeling (Nurse Shark) + Turtle Snorkeling'),false);
 assert.equal(scheduleCanServeRequest('Special Package','Dolphin Watching + Fishing with Dinner'),false);
});


test('planner splits Special Package across the fewest non-overlapping departures',()=>{
 const candidates=[
  {id:'trip2-d1',date:'2026-10-01',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',remaining:6},
  {id:'trip3-d1',date:'2026-10-01',time:'10:30',endTime:'12:30',name:'Sandbank Trip + Turtle Snorkeling',remaining:6},
  {id:'trip4-d1',date:'2026-10-01',time:'11:00',endTime:'14:30',name:'Shark Snorkeling (Nurse Shark) + Turtle Snorkeling',remaining:6},
  {id:'trip6-d1',date:'2026-10-01',time:'16:30',endTime:'19:30',name:'Dolphin Watching + Fishing with Dinner',remaining:6},
  {id:'trip4-d2',date:'2026-10-02',time:'11:00',endTime:'14:30',name:'Shark Snorkeling (Nurse Shark) + Turtle Snorkeling',remaining:6}
 ];
 const plan=planSpecialPackageSchedules(candidates,2);
 assert.ok(plan);
 assert.equal(plan.length,4);
 assert.deepEqual(plan.map(item=>item.id),['trip2-d1','trip3-d1','trip6-d1','trip4-d2']);
 const covered=new Set(plan.flatMap(item=>item.coverage));
 for(const component of ['turtle','shark','sandbank','coral garden','dolphin','fishing'])assert.equal(covered.has(component),true);
});

test('planner uses one full-package trip when it is available',()=>{
 const plan=planSpecialPackageSchedules([
  {id:'full',date:'2026-10-01',time:'07:00',endTime:'19:30',name:'Turtle + Shark + Sandbank + Coral Garden + Dolphin + Fishing',remaining:4},
  {id:'shark',date:'2026-10-01',time:'11:00',endTime:'14:30',name:'Shark + Turtle',remaining:4}
 ],2);
 assert.equal(plan?.length,1);
 assert.equal(plan?.[0].id,'full');
});

test('planner ignores departures without enough remaining seats and falls back when coverage is incomplete',()=>{
 const noCapacity=planSpecialPackageSchedules([
  {id:'shark',date:'2026-10-01',time:'11:00',endTime:'14:30',name:'Shark + Turtle',remaining:1},
  {id:'sand-coral',date:'2026-10-02',time:'08:00',endTime:'10:00',name:'Sandbank + Coral Garden',remaining:6},
  {id:'dolphin-fishing',date:'2026-10-02',time:'16:30',endTime:'19:30',name:'Dolphin + Fishing',remaining:6}
 ],2);
 assert.equal(noCapacity,null);
});


test('Special Package planner prefers the earliest chronological itinerary when multiple complete plans are valid',()=>{
 const candidates=[
  {id:'early-turtle-coral',date:'2026-10-01',time:'08:00',endTime:'09:30',name:'Turtle + Coral Garden',remaining:6},
  {id:'late-turtle-coral',date:'2026-10-01',time:'09:00',endTime:'10:00',name:'Turtle + Coral Garden',remaining:6},
  {id:'sandbank',date:'2026-10-01',time:'10:30',endTime:'12:30',name:'Sandbank + Turtle',remaining:6},
  {id:'shark',date:'2026-10-02',time:'11:00',endTime:'14:30',name:'Shark + Turtle',remaining:6},
  {id:'dolphin-fishing',date:'2026-10-02',time:'16:30',endTime:'19:30',name:'Dolphin + Fishing',remaining:6}
 ];
 const plan=planSpecialPackageSchedules(candidates,2);
 assert.ok(plan);
 assert.equal(plan[0].id,'early-turtle-coral');
 assert.equal(plan[0].time,'08:00');
});
