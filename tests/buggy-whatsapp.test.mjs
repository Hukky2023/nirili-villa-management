import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBuggyDriverWhatsAppMessage,buggyDriverWhatsAppUrl,normalizeBuggyWhatsAppPhone} from '../lib/buggy-whatsapp.ts';

const pickup={
 id:'buggy-1',
 guest:'Guest One',
 phone:'+960 777 1234',
 room:'203',
 location:'Dhiffushi Harbour',
 destination:'Nirili Villa',
 pickupTime:'16:30',
 buggyName:'Buggy 2',
 driver:'Ahmed'
};

test('buggy WhatsApp helper normalizes Maldives guest numbers',()=>{
 assert.equal(normalizeBuggyWhatsAppPhone('7771234'),'9607771234');
 assert.equal(normalizeBuggyWhatsAppPhone('+960 777-1234'),'9607771234');
 assert.equal(normalizeBuggyWhatsAppPhone(''),'');
});

test('driver on the way message includes guest, driver and pickup details',()=>{
 const message=buildBuggyDriverWhatsAppMessage(pickup,'on-the-way','Fallback Driver');
 assert.match(message,/Hello Guest One/);
 assert.match(message,/Ahmed is on the way/);
 assert.match(message,/Dhiffushi Harbour · Room 203/);
 assert.match(message,/Pickup time: 16:30/);
 assert.match(message,/Buggy: Buggy 2/);
});

test('arrived and return messages are explicit',()=>{
 assert.match(buildBuggyDriverWhatsAppMessage(pickup,'arrived'),/has arrived at Dhiffushi Harbour · Room 203/);
 assert.match(buildBuggyDriverWhatsAppMessage(pickup,'return-arrived'),/arrived for the return pickup/);
});

test('buggy WhatsApp URL targets saved guest number with prefilled text',()=>{
 const url=buggyDriverWhatsAppUrl(pickup,'arrived');
 assert.match(url,/^https:\/\/wa\.me\/9607771234\?text=/);
 assert.match(decodeURIComponent(url),/Guest One/);
 assert.equal(buggyDriverWhatsAppUrl({...pickup,phone:''},'arrived'),'');
});
