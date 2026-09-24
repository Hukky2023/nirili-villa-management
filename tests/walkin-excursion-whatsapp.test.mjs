import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWalkInExcursionWhatsAppMessage,normalizeWhatsAppPhone,walkInExcursionWhatsAppUrl} from '../lib/walkin-excursion-whatsapp.ts';
import {markWalkInExcursionNotified} from '../lib/walkin-excursion-notification.ts';

test('WhatsApp message contains booking details and 24-hour departure time',()=>{
 const booking={id:'EXC-1',guest:'Walk In Guest',phone:'+960 777 0000',excursion:'Turtle Snorkeling',date:'2026-09-24',time:'08:00',endTime:'09:30',hotel:'Hotel A',room:'12',totalCents:5000};
 const message=buildWalkInExcursionWhatsAppMessage(booking);
 assert.match(message,/EXC-1/);assert.match(message,/Turtle Snorkeling/);assert.match(message,/24-09-2026/);assert.match(message,/08:00–09:30/);assert.match(message,/Hotel A · Room 12/);assert.match(message,/USD 50\.00/);
 assert.equal(normalizeWhatsAppPhone('+960 777-0000'),'9607770000');
 assert.match(walkInExcursionWhatsAppUrl(booking),/^https:\/\/wa\.me\/9607770000\?text=/);
});

test('Special Package WhatsApp message uses one package reference and lists every leg',()=>{
 const booking={id:'EXC-A',packageGroupId:'PKG-100',packageName:'Special Package',guest:'Guest',phone:'+9607000000',hotel:'Hotel',totalCents:10000};
 const legs=[
  {...booking,id:'EXC-A',excursion:'Turtle Snorkeling',date:'2026-09-24',time:'08:00',endTime:'09:30',totalCents:10000},
  {...booking,id:'EXC-B',excursion:'Shark Snorkeling',date:'2026-09-25',time:'11:00',endTime:'14:30',totalCents:12000}
 ];
 const message=buildWalkInExcursionWhatsAppMessage(booking,legs);
 assert.match(message,/Booking: PKG-100/);assert.match(message,/Package itinerary:/);assert.match(message,/Turtle Snorkeling · 24-09-2026 · 08:00–09:30/);assert.match(message,/Shark Snorkeling · 25-09-2026 · 11:00–14:30/);assert.match(message,/USD 220\.00/);
});

test('mark sent updates all active package legs but preserves pricing and assignment',()=>{
 const first={id:'EXC-A',kind:'excursion',packageGroupId:'PKG-1',phone:'+9607000000',cents:10000,scheduleId:'trip-a',time:'08:00',status:'Scheduled',approvalStatus:'Approved'};
 const second={id:'EXC-B',kind:'excursion',packageGroupId:'PKG-1',phone:'+9607000000',cents:12000,scheduleId:'trip-b',time:'11:00',status:'Scheduled',approvalStatus:'Approved'};
 const state={orders:[first,second]};
 const result=markWalkInExcursionNotified(state,first,{notified:true,by:'manager',channel:'WhatsApp',packageGroupId:'PKG-1',at:'2026-09-24T05:00:00.000Z'});
 assert.equal(result.targets.length,2);
 for(const order of state.orders){assert.equal(order.guestNotified,true);assert.equal(order.guestNotificationChannel,'WhatsApp');assert.equal(order.guestNotifiedBy,'manager');assert.equal(order.notificationHistory.length,1);}
 assert.equal(first.cents,10000);assert.equal(first.scheduleId,'trip-a');assert.equal(first.time,'08:00');assert.equal(second.cents,12000);assert.equal(second.scheduleId,'trip-b');
});

test('walk-in notification helper rejects in-house bookings and missing phone',()=>{
 assert.throws(()=>markWalkInExcursionNotified({orders:[]},{id:'A',kind:'excursion',stayId:'NV-1',phone:'+9607000000'},{notified:true,by:'admin'}),/walk-in/i);
 assert.throws(()=>markWalkInExcursionNotified({orders:[]},{id:'B',kind:'excursion',phone:''},{notified:true,by:'admin'}),/WhatsApp number/i);
});
