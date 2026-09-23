import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTransferBillEdit,transferBillItems,transferBillStatus} from '../lib/transfer-billing.ts';

test('transfer bill edits update the source order instead of a detached folio override',()=>{
 const state={
  orders:[{id:'TRF-98155527',kind:'transfer',stayId:'NV-0001',name:'Airport transfer',quantity:2,cents:7000,status:'Confirmed',transportPlanBilling:true,transportPlanLeg:'arrival'}],
  stays:[{id:'NV-0001',room:'101',history:[],transportPlan:{arrival:{billing:{baseCents:7000,cents:7000}}}}]
 };
 const result=applyTransferBillEdit(state,{id:'TRF-98155527',date:'24 Sept 2026, 02:15',status:'Unpaid',items:[['New item',2,60,0]]},'admin');
 assert.equal(result.totalCents,6000);
 assert.equal(state.orders[0].cents,6000);
 assert.deepEqual(state.orders[0].billItems,[['New item',2,60,0]]);
 assert.equal(state.orders[0].billStatus,'Unpaid');
 assert.equal(state.stays[0].transportPlan.arrival.billing.priceCents,6000);
 assert.equal(transferBillStatus(state.orders[0]),'Unpaid');
 assert.deepEqual(transferBillItems(state.orders[0]),[['New item',2,60,0]]);
});

test('transfer discounts and multiple edited items persist in the source bill',()=>{
 const state={orders:[{id:'TRF-2',kind:'transfer',stayId:'NV-2',name:'Transfer',quantity:1,cents:10000,status:'Confirmed'}],stays:[{id:'NV-2',room:'102',history:[]}]};
 const result=applyTransferBillEdit(state,{id:'TRF-2',date:'24 Sep 2026, 03:00',status:'Posted',items:[['Launch',1,80,25],['Extra bag',1,10,0]]},'admin');
 assert.equal(result.totalCents,7000);
 assert.equal(state.orders[0].cents,7000);
 assert.equal(result.bill.total,70);
});

test('cancelled transfer bill cancels its source order',()=>{
 const state={orders:[{id:'TRF-3',kind:'transfer',stayId:'NV-3',name:'Transfer',quantity:1,cents:3500,status:'Confirmed'}],stays:[{id:'NV-3',room:'103',history:[]}]};
 applyTransferBillEdit(state,{id:'TRF-3',date:'24 Sep 2026, 03:00',status:'Cancelled',items:[['Transfer',1,35,0]]},'admin');
 assert.equal(state.orders[0].status,'Cancelled');
 assert.equal(transferBillStatus(state.orders[0]),'Cancelled');
});
