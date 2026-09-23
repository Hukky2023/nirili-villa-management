import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingManageUrl,bookingForManageToken,bookingManageSnapshot,createBookingManageToken,roomAvailability,validBookingManageToken} from '../lib/booking-manage.ts';

const token='a'.repeat(48);
const base=()=>({
 rooms:[
  {number:'101',status:'Available',capacity:3},
  {number:'102',status:'Available',capacity:3},
  {number:'103',status:'Maintenance',capacity:3}
 ],
 stays:[],requests:[],bookingChanges:[],deletedBookings:[]
});

test('manage tokens are high entropy and links keep the token in the URL fragment',()=>{
 const a=createBookingManageToken(),b=createBookingManageToken();
 assert.equal(a.length,48);assert.equal(b.length,48);assert.notEqual(a,b);
 assert.equal(validBookingManageToken(a),true);assert.equal(validBookingManageToken('short'),false);
 const url=bookingManageUrl(a);assert.match(url,/\/book\/manage#/);assert.equal(url.includes('?token='),false);
});

test('pending public booking can be found and safely projected',()=>{
 const state=base();state.requests.push({id:'REQ-1',manageToken:token,guest:'Guest',email:'g@example.com',whatsapp:'+9607000000',checkIn:'2026-10-01',checkOut:'2026-10-04',pax:2,adults:2,children:0,meal:'Bed & Breakfast',status:'Pending',estimate:18000});
 const target=bookingForManageToken(state,token);assert.equal(target?.kind,'request');
 const view=bookingManageSnapshot(state,target);assert.equal(view.reference,'REQ-1');assert.equal(view.canEdit,true);assert.equal(view.canCancel,true);assert.equal(view.totalCents,18000);
});

test('confirmed booking is locked while a guest action waits for staff approval',()=>{
 const state=base();state.stays.push({id:'NV-0001',manageToken:token,guest:'Guest',email:'g@example.com',whatsapp:'+9607000000',room:'101',checkIn:'2026-10-01',checkOut:'2026-10-04',pax:2,meal:'Bed & Breakfast',status:'Confirmed',base:18000});
 state.bookingChanges.push({id:'BCH-1',bookingId:'NV-0001',type:'cancel',status:'Pending',requestedAt:'2026-09-23T06:00:00Z'});
 const view=bookingManageSnapshot(state,bookingForManageToken(state,token));
 assert.equal(view.status,'Confirmed');assert.equal(view.pendingAction.type,'cancel');assert.equal(view.canEdit,false);assert.equal(view.canCancel,false);
});

test('cancelled archived booking remains viewable from the private link with refund required',()=>{
 const state=base();state.deletedBookings.push({stay:{id:'NV-0002',manageToken:token,guest:'Guest',email:'g@example.com',checkIn:'2026-10-01',checkOut:'2026-10-04',pax:2,meal:'Half Board',status:'Cancelled',refundRequiredCents:12000,base:24000},refundRequiredCents:12000});
 const view=bookingManageSnapshot(state,bookingForManageToken(state,token));
 assert.equal(view.kind,'archived');assert.equal(view.status,'Cancelled');assert.equal(view.refundRequiredCents,12000);assert.equal(view.canEdit,false);assert.equal(view.canCancel,false);
});

test('room availability blocks overlaps and maintenance but ignores cancelled and checked-out stays',()=>{
 const state=base();
 state.stays=[
  {id:'live',room:'101',status:'Confirmed',checkIn:'2026-10-02',checkOut:'2026-10-05'},
  {id:'cancelled',room:'102',status:'Cancelled',checkIn:'2026-10-02',checkOut:'2026-10-05'},
  {id:'past',room:'102',status:'Checked Out',checkIn:'2026-10-02',checkOut:'2026-10-05'}
 ];
 assert.deepEqual(roomAvailability(state,'2026-10-03','2026-10-04',2).map(r=>r.number),['102']);
 assert.deepEqual(roomAvailability(state,'2026-10-03','2026-10-04',2,'live').map(r=>r.number),['101','102']);
});
