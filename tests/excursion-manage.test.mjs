import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveExternalExcursionCancellation,
  approveExternalExcursionChange,
  approveExternalExcursionPackageCancellation,
  createExcursionManageToken,
  excursionLogisticsChanged,
  excursionManageSnapshot,
  excursionManageUrl,
  externalExcursionPaymentCents,
  pendingExcursionChange,
  validExcursionManageToken,
} from '../lib/excursion-manage.ts';

const token='b'.repeat(48);
const state=()=>({orders:[],excursionChanges:[]});

test('external excursion manage links keep the secret in the URL fragment',()=>{
 const a=createExcursionManageToken(),b=createExcursionManageToken();
 assert.equal(a.length,48);assert.equal(validExcursionManageToken(a),true);assert.notEqual(a,b);
 const url=excursionManageUrl(a);assert.match(url,/\/book\/excursions\/manage#/);assert.equal(url.includes('?token='),false);
});

test('snapshot exposes live payment and locks while a guest action is pending',()=>{
 const s=state(),order={id:'EXC-1',manageToken:token,source:'External guest website',kind:'excursion',guest:'Guest',email:'g@example.com',phone:'+9607000000',hotel:'Hotel',name:'Turtle',menuItemId:'turtle',date:'2026-10-01',time:'08:00',quantity:2,adults:2,children:0,infants:0,quotedCents:5000,cents:5000,status:'Scheduled',approvalStatus:'Approved',excursionPayments:[{cents:2000}]};
 s.orders.push(order);s.excursionChanges.push({id:'ECH-1',bookingId:order.id,type:'change',status:'Pending',requestedAt:'2026-09-23T06:00:00Z',proposed:{date:'2026-10-02'}});
 const view=excursionManageSnapshot(s,order,{time:'08:30',endTime:'10:00',vessel:'Boat One'});
 assert.equal(view.time,'08:30');assert.equal(view.paymentStatus,'Partially paid');assert.equal(view.balanceCents,3000);assert.equal(view.canEdit,false);assert.equal(view.pendingAction.id,'ECH-1');
});

test('payment total nets reversals',()=>{
 assert.equal(externalExcursionPaymentCents({excursionPayments:[{cents:5000},{cents:-2000}]}),3000);
});

test('logistics-changing approval releases old trip and moves booking back to scheduling',()=>{
 const order={id:'EXC-2',menuItemId:'turtle',name:'Turtle',date:'2026-10-01',quantity:2,privateBoatRequested:false,quotedCents:5000,cents:5000,status:'Scheduled',approvalStatus:'Approved',scheduleId:'trip2',time:'08:00',endTime:'09:30',schedule:{date:'2026-10-01',time:'08:00',vessel:'Boat'},matchedScheduleName:'Turtle + Coral',preferredTime:'08:00'};
 const proposed={...order,menuItemId:'shark',name:'Shark',date:'2026-10-02',quantity:3,quotedCents:30000,guest:'Guest',email:'g@example.com',phone:'+9607000000',hotel:'Hotel',externalRoom:'2',groupName:'',notes:'',adults:3,children:0,infants:0,guestNames:['A','B','C'],guestCategories:['adult','adult','adult'],footSizes:[40,41,42],buggyRequested:false,privateBoatRequested:false,pricingUnit:'guest',unitPriceCents:10000,baseQuotedCents:30000,privateBoatSurchargeCents:0,excursionGuestRoster:[]};
 const change={id:'ECH-2',type:'change',status:'Pending',proposed};
 assert.equal(excursionLogisticsChanged(order,proposed),true);
 const result=approveExternalExcursionChange(order,change,'manager');
 assert.equal(result.logisticsChanged,true);assert.equal(order.status,'Awaiting scheduling');assert.equal(order.approvalStatus,'Pending');assert.equal(order.cents,0);assert.equal(order.scheduleId,undefined);assert.equal(order.schedule,undefined);assert.equal(order.preferredTime,undefined);
});

test('contact-only approved change keeps confirmed trip assignment',()=>{
 const order={id:'EXC-3',menuItemId:'turtle',name:'Turtle',date:'2026-10-01',quantity:2,privateBoatRequested:false,quotedCents:5000,cents:5000,status:'Scheduled',approvalStatus:'Approved',scheduleId:'trip2',time:'08:00',schedule:{date:'2026-10-01',time:'08:00',vessel:'Boat'}};
 const proposed={...order,email:'new@example.com',phone:'+9607111111',hotel:'New Hotel',quotedCents:5000};
 const change={id:'ECH-3',type:'change',status:'Pending',proposed};
 const result=approveExternalExcursionChange(order,change,'manager');
 assert.equal(result.logisticsChanged,false);assert.equal(order.status,'Scheduled');assert.equal(order.scheduleId,'trip2');assert.equal(order.email,'new@example.com');
});

test('approved cancellation closes booking and records net refund required',()=>{
 const order={id:'EXC-4',status:'Scheduled',approvalStatus:'Approved',cents:10000,quotedCents:10000,excursionPayments:[{cents:10000},{cents:-2500}]};
 const change={id:'ECH-4',type:'cancel',status:'Pending'};
 const result=approveExternalExcursionCancellation(order,change,'manager');
 assert.equal(result.refundRequiredCents,7500);assert.equal(order.status,'Cancelled');assert.equal(order.approvalStatus,'Cancelled');assert.equal(order.cents,0);assert.equal(change.status,'Approved');
});

test('pending action lookup only returns current pending request',()=>{
 const s=state();s.excursionChanges=[{id:'old',bookingId:'EXC',status:'Rejected',requestedAt:'2026-09-20'},{id:'new',bookingId:'EXC',status:'Pending',requestedAt:'2026-09-21'}];
 assert.equal(pendingExcursionChange(s,'EXC').id,'new');
});


test('split Special Package appears as one manage booking with all departures',()=>{
 const s=state(),group='PKG-ABC';
 const first={id:'EXC-A',packageGroupId:group,packageName:'Special Package',packagePart:1,packageParts:2,packageTotalCents:22000,manageToken:token,source:'External guest website',kind:'excursion',guest:'Guest',email:'g@example.com',phone:'+9607000000',hotel:'Hotel',externalRoom:'5',menuItemId:'special-package',name:'Shark + Turtle',packageSegmentName:'Shark + Turtle',date:'2026-10-01',time:'11:00',endTime:'14:30',quantity:2,adults:2,children:0,infants:0,quotedCents:11000,cents:11000,status:'Scheduled',approvalStatus:'Approved',schedule:{vessel:'Boat A',crew:['Crew One']}};
 const second={...structuredClone(first),id:'EXC-B',packagePart:2,name:'Dolphin + Fishing',packageSegmentName:'Dolphin + Fishing',date:'2026-10-02',time:'16:30',endTime:'19:30',quotedCents:11000,cents:11000,schedule:{vessel:'Boat B',crew:['Crew Two']}};
 s.orders.push(first,second);
 const view=excursionManageSnapshot(s,first,null);
 assert.equal(view.reference,group);assert.equal(view.excursion,'Special Package');assert.equal(view.packageSegments.length,2);
 assert.equal(view.quotedCents,22000);assert.equal(view.canEdit,false);assert.equal(view.canCancel,true);assert.equal(view.vessel,'Multiple trips');
});

test('split package cancellation cancels all linked departures and sums refunds',()=>{
 const s=state(),group='PKG-REFUND';
 const a={id:'EXC-A',packageGroupId:group,packageName:'Special Package',manageToken:token,source:'External guest website',kind:'excursion',status:'Scheduled',approvalStatus:'Approved',cents:11000,quotedCents:11000,excursionPayments:[{cents:5000}]};
 const b={id:'EXC-B',packageGroupId:group,packageName:'Special Package',manageToken:token,source:'External guest website',kind:'excursion',status:'Scheduled',approvalStatus:'Approved',cents:11000,quotedCents:11000,excursionPayments:[{cents:3000}]};
 s.orders.push(a,b);
 const change={id:'ECH-PKG',bookingId:a.id,packageGroupId:group,type:'cancel',status:'Pending'};
 const result=approveExternalExcursionPackageCancellation(s,a,change,'manager');
 assert.equal(result.refundRequiredCents,8000);assert.equal(a.status,'Cancelled');assert.equal(b.status,'Cancelled');assert.equal(a.cents,0);assert.equal(b.cents,0);assert.equal(change.status,'Approved');
});


test('guest manage snapshot shows the current admin-edited excursion charge',()=>{
 const s=state(),order={id:'EXC-BILL',manageToken:token,source:'External guest website',kind:'excursion',guest:'Guest',email:'g@example.com',phone:'+9607000000',hotel:'Hotel',name:'Turtle',menuItemId:'turtle',date:'2026-10-01',quantity:2,adults:2,children:0,infants:0,quotedCents:5000,cents:4200,billingRevision:1,billingEditedAt:'2026-09-23T10:00:00Z',status:'Scheduled',approvalStatus:'Approved'};
 s.orders.push(order);
 const view=excursionManageSnapshot(s,order,null);
 assert.equal(view.originalQuotedCents,5000);
 assert.equal(view.quotedCents,4200);
 assert.equal(view.balanceCents,4200);
});

test('contact-only guest change does not overwrite an admin-edited excursion bill',()=>{
 const order={id:'EXC-BILL-CONTACT',menuItemId:'turtle',name:'Turtle',date:'2026-10-01',quantity:2,privateBoatRequested:false,quotedCents:5000,cents:4200,billingRevision:1,billingEditedAt:'2026-09-23T10:00:00Z',billingItems:[['Turtle',2,42,0]],status:'Scheduled',approvalStatus:'Approved',scheduleId:'trip2',time:'08:00',schedule:{date:'2026-10-01',time:'08:00',vessel:'Boat'}};
 const proposed={...order,email:'new@example.com',phone:'+9607111111',hotel:'New Hotel',quotedCents:5000};
 const change={id:'ECH-BILL-CONTACT',type:'change',status:'Pending',proposed};
 const result=approveExternalExcursionChange(order,change,'manager');
 assert.equal(result.logisticsChanged,false);
 assert.equal(order.cents,4200);
 assert.equal(order.billingRevision,1);
 assert.deepEqual(order.billingItems,[['Turtle',2,42,0]]);
});

test('logistics-changing guest change clears stale custom bill metadata before repricing',()=>{
 const order={id:'EXC-BILL-MOVE',menuItemId:'turtle',name:'Turtle',date:'2026-10-01',quantity:2,privateBoatRequested:false,quotedCents:5000,cents:4200,billingRevision:1,billingEditedAt:'2026-09-23T10:00:00Z',billingItems:[['Turtle',2,42,0]],billingStatus:'Posted',billingDate:'23 Sep',billingAdjustment:{action:'edit'},status:'Scheduled',approvalStatus:'Approved',scheduleId:'trip2',time:'08:00',schedule:{date:'2026-10-01',time:'08:00',vessel:'Boat'}};
 const proposed={...order,menuItemId:'shark',name:'Shark',date:'2026-10-02',quantity:3,quotedCents:30000,guest:'Guest',email:'g@example.com',phone:'+9607000000',hotel:'Hotel',externalRoom:'2',groupName:'',notes:'',adults:3,children:0,infants:0,guestNames:['A','B','C'],guestCategories:['adult','adult','adult'],footSizes:[40,41,42],buggyRequested:false,privateBoatRequested:false,pricingUnit:'guest',unitPriceCents:10000,baseQuotedCents:30000,privateBoatSurchargeCents:0,excursionGuestRoster:[]};
 const change={id:'ECH-BILL-MOVE',type:'change',status:'Pending',proposed};
 approveExternalExcursionChange(order,change,'manager');
 assert.equal(order.cents,0);
 assert.equal(order.billingRevision,0);
 assert.equal(order.billingItems,undefined);
 assert.equal(order.billingAdjustment,undefined);
});
