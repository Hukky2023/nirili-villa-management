import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecialPackageOrders} from '../lib/special-package-booking.ts';

const base={
 token:'token',kind:'excursion',quantity:2,guest:'Guest',guestNames:['Guest','Guest 2'],
 guestCategories:['adult','adult'],date:'2026-09-24',createdAt:'2026-09-23T18:00:00Z'
};

test('unmatched Special Package is always six operational legs under one package reference',()=>{
 const built=buildSpecialPackageOrders({base,totalCents:44000,plan:null,sourceDate:'2026-09-24'});
 assert.match(built.packageGroupId,/^PKG-/);
 assert.equal(built.orders.length,6);
 assert.equal(new Set(built.orders.map(o=>o.packageGroupId)).size,1);
 assert.equal(built.orders.some(o=>o.name==='Special Package'),false);
 assert.deepEqual(new Set(built.orders.flatMap(o=>o.packageCoverage)),new Set(['turtle','shark','sandbank','coral garden','dolphin','fishing']));
 assert.equal(built.orders.every(o=>o.status==='Awaiting scheduling'&&o.approvalStatus==='Pending'),true);
 assert.equal(built.orders.reduce((sum,o)=>sum+o.quotedCents,0),44000);
});

test('matched Special Package uses real scheduled legs instead of one package trip',()=>{
 const plan=[
  {id:'trip-a',date:'2026-09-24',time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',coverage:['turtle','coral garden'],vesselId:'v1',crewIds:['c1']},
  {id:'trip-b',date:'2026-09-24',time:'10:30',endTime:'12:30',name:'Sandbank Trip',coverage:['sandbank'],vesselId:'v1',crewIds:['c1']},
  {id:'trip-c',date:'2026-09-25',time:'11:00',endTime:'14:30',name:'Shark Snorkeling',coverage:['shark'],vesselId:'v2',crewIds:['c2']},
  {id:'trip-d',date:'2026-09-25',time:'16:30',endTime:'19:30',name:'Dolphin Watching + Fishing with Dinner',coverage:['dolphin','fishing'],vesselId:'v2',crewIds:['c2']}
 ];
 const resources={vessels:[{id:'v1',name:'Boat 1'},{id:'v2',name:'Boat 2'}],crew:[{id:'c1',name:'Crew 1'},{id:'c2',name:'Crew 2'}]};
 const built=buildSpecialPackageOrders({base,totalCents:44000,plan,resources,sourceDate:'2026-09-24'});
 assert.equal(built.orders.length,4);
 assert.equal(built.orders.some(o=>o.name==='Special Package'),false);
 assert.equal(built.orders.every(o=>o.status==='Scheduled'&&o.approvalStatus==='Approved'),true);
 assert.deepEqual(built.orders.map(o=>o.scheduleId),['trip-a','trip-b','trip-c','trip-d']);
 assert.equal(built.orders.reduce((sum,o)=>sum+o.quotedCents,0),44000);
});

test('partial plan produces scheduled legs plus separate pending uncovered activities',()=>{
 const plan=[
  {id:'trip-a',date:'2026-09-24',time:'08:00',endTime:'09:30',name:'Turtle + Coral Garden',coverage:['turtle','coral garden'],vesselId:'',crewIds:[]}
 ];
 const built=buildSpecialPackageOrders({base,totalCents:44000,plan,sourceDate:'2026-09-24'});
 assert.equal(built.orders.length,5);
 assert.equal(built.orders.filter(o=>o.status==='Scheduled').length,1);
 assert.equal(built.orders.filter(o=>o.status==='Awaiting scheduling').length,4);
 assert.equal(built.orders.some(o=>o.name==='Special Package'),false);
});

test('private Special Package is still split into separate pending legs',()=>{
 const built=buildSpecialPackageOrders({base:{...base,privateBoatRequested:true},totalCents:49000,plan:null,sourceDate:'2026-09-24',pendingPrivateBoat:true});
 assert.equal(built.orders.length,6);
 assert.equal(built.orders.every(o=>o.privateBoatRequested===true),true);
 assert.equal(built.orders.some(o=>o.name==='Special Package'),false);
});
