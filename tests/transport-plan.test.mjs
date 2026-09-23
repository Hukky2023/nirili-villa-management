import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTransportPlan,mergeTransportPlanInternal,normalizeTransportPlan,syncTransportBuggy} from '../lib/transport-plan.ts';

test('normalizes arrival and departure transport details',()=>{
 const plan=normalizeTransportPlan({
  arrival:{needTransfer:'yes',flightNumber:' EK656 ',flightTime:'09:15'},
  departure:{needTransfer:'no',ownDepartureTime:'11:30'}
 },'2026-10-04','2026-10-08');
 assert.equal(plan.arrival.needTransfer,'yes');
 assert.equal(plan.arrival.flightNumber,'EK656');
 assert.equal(plan.arrival.date,'2026-10-04');
 assert.equal(plan.departure.needTransfer,'no');
 assert.equal(plan.departure.date,'2026-10-08');
});

test('own transport creates arrival buggy at harbour arrival time and departure buggy 15 minutes earlier',()=>{
 const state={buggyBookings:[]};
 const stay={id:'NV-0001',guest:'Guest',whatsapp:'+9607000000',room:'202',pax:2,checkIn:'2026-10-04',checkOut:'2026-10-08',transportPlan:defaultTransportPlan('2026-10-04','2026-10-08')};
 stay.transportPlan.arrival={...stay.transportPlan.arrival,needTransfer:'no',dhiffushiArrivalTime:'14:20'};
 stay.transportPlan.departure={...stay.transportPlan.departure,needTransfer:'no',ownDepartureTime:'11:30'};
 const arrival=syncTransportBuggy(state,stay,'arrival');
 const departure=syncTransportBuggy(state,stay,'departure');
 assert.equal(arrival.pickupTime,'14:20');
 assert.equal(arrival.location,'Dhiffushi Harbour');
 assert.equal(departure.pickupTime,'11:15');
 assert.equal(departure.location,'Nirili Villa');
 assert.equal(state.buggyBookings.length,2);
});

test('scheduled launch keeps buggy tied to launch arrival or 15 minutes before departure',()=>{
 const state={buggyBookings:[]};
 const stay={id:'NV-0002',guest:'Guest',room:'101',pax:3,checkIn:'2026-10-04',checkOut:'2026-10-08',transportPlan:{
  arrival:{...defaultTransportPlan('2026-10-04','2026-10-08').arrival,needTransfer:'yes'},
  departure:{...defaultTransportPlan('2026-10-04','2026-10-08').departure,needTransfer:'yes'}
 }};
 const arrival=syncTransportBuggy(state,stay,'arrival',{date:'2026-10-04',depart:'11:30',arrive:'12:25'});
 const departure=syncTransportBuggy(state,stay,'departure',{date:'2026-10-08',depart:'16:30',arrive:'17:25'});
 assert.equal(arrival.pickupTime,'12:25');
 assert.equal(departure.pickupTime,'16:15');
 assert.equal(departure.quantity,3);
});

test('flight-time change marks an already scheduled transport leg for review',()=>{
 const current=defaultTransportPlan('2026-10-04','2026-10-08');
 current.arrival={...current.arrival,needTransfer:'yes',flightTime:'09:15',transportBookingId:'NT-1',launch:{scheduleId:'s1',date:'2026-10-04',depart:'11:30',arrive:'12:25'}};
 const next=normalizeTransportPlan({arrival:{needTransfer:'yes',flightTime:'10:45'},departure:{needTransfer:'later'}},'2026-10-04','2026-10-08');
 const merged=mergeTransportPlanInternal(current,next);
 assert.equal(merged.arrival.needsReview,true);
 assert.equal(merged.arrival.previousTransportBookingId,'NT-1');
 assert.equal(merged.arrival.status,'Needs transport review');
});
