import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTransportPlan,mergeTransportPlanInternal,normalizeTransportPlan,syncTransportBuggy} from '../lib/transport-plan.ts';
import {cancelTransportPlanBills,syncTransportPlanBill,transportPlanBaseCents,transportPlanChargeCents} from '../lib/transport-plan-billing.ts';

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


test('room transport fare uses configured USD fare with children at half price',()=>{
 const stay={adults:2,children:1,pax:3};
 assert.equal(transportPlanBaseCents({roomFare:3500},stay),8750);
 assert.throws(()=>transportPlanBaseCents({},stay),/USD room fare/);
});

test('linked launch creates one Transfer bill and reschedule updates the same bill',()=>{
 const state={orders:[]};
 const stay={id:'NV-0100',guest:'Test Guest',room:'101',adults:2,children:0,pax:2,transportPlan:{arrival:{needTransfer:'yes',billing:{}}}};
 const booking={id:'NT-ROOM1',token:'token',created:'2026-10-01T00:00:00.000Z',journeys:[{scheduleId:'s1',date:'2026-10-04',from:'Velana Airport',to:'Dhiffushi',depart:'11:30',arrive:'12:25',boat:'Boat A'}]};
 const first=syncTransportPlanBill(state,stay,booking,{roomFare:3500},'arrival','admin');
 assert.equal(first.cents,7000);
 assert.equal(state.orders.length,1);
 booking.journeys=[{scheduleId:'s2',date:'2026-10-04',from:'Velana Airport',to:'Dhiffushi',depart:'13:30',arrive:'14:20',boat:'Boat B'}];
 const second=syncTransportPlanBill(state,stay,booking,{roomFare:4000},'arrival','admin');
 assert.equal(second.cents,8000);
 assert.equal(state.orders.length,1);
 assert.match(state.orders[0].name,/13:30/);
});

test('Admin free discount and custom transport pricing calculate correctly',()=>{
 assert.equal(transportPlanChargeCents(10000,{discountPercent:25}),7500);
 assert.equal(transportPlanChargeCents(10000,{priceCents:6200,discountPercent:25}),6200);
 assert.equal(transportPlanChargeCents(10000,{free:true,priceCents:6200}),0);
});

test('cancelled linked launch removes its room charge',()=>{
 const state={orders:[{id:'NT-CANCEL',kind:'transfer',status:'Confirmed',cents:7000},{id:'OTHER',kind:'transfer',status:'Confirmed',cents:1000}]};
 const changed=cancelTransportPlanBills(state,['NT-CANCEL'],'admin');
 assert.equal(changed,1);
 assert.equal(state.orders[0].status,'Cancelled');
 assert.equal(state.orders[0].cents,0);
 assert.equal(state.orders[1].cents,1000);
});
