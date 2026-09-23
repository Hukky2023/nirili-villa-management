import test from 'node:test';
import assert from 'node:assert/strict';
import {deletePOSBill} from '../lib/pos-bill-delete.ts';

test('included Full Board zero-dollar bill deletes without a linked room charge',()=>{
 const order={
  id:'POS-FB-DELETE',stayId:'NV-1',customer:'Guest',room:'102',cents:0,method:'',
  items:[
   {name:'Rice · Vegetable (meal plan included)',quantity:1,unitCents:0,cents:0,included:true,menuCents:800},
   {name:'Rice · Nasi Goreng (meal plan included)',quantity:1,unitCents:0,cents:0,included:true,menuCents:900}
  ]
 };
 const state={stays:[{id:'NV-1',status:'In House',posBills:[],paidBills:{},history:[]}],posOrders:[order],deletedPOSOrders:[]};
 deletePOSBill(state,order,'cashier');
 assert.deepEqual(state.posOrders,[]);
 assert.equal(state.deletedPOSOrders.length,1);
 assert.equal(state.deletedPOSOrders[0].id,'POS-FB-DELETE');
 assert.deepEqual(state.stays[0].posBills,[]);
 assert.match(state.stays[0].history[0].detail,/Restaurant bill POS-FB-DELETE deleted/);
});

test('chargeable room bill still requires its linked room charge before deletion',()=>{
 const order={id:'POS-PAID-LINK',stayId:'NV-1',cents:1200,method:'Room',items:[{name:'Drink',quantity:1,cents:1200,included:false}]};
 const state={stays:[{id:'NV-1',status:'In House',posBills:[],paidBills:{},history:[]}],posOrders:[order],deletedPOSOrders:[]};
 assert.throws(()=>deletePOSBill(state,order,'cashier'),/Linked room bill is missing/);
 assert.equal(state.posOrders.length,1);
});

test('paid bill remains protected from deletion',()=>{
 const order={id:'POS-PAID',stayId:'NV-1',cents:1200,method:'Cash',items:[{name:'Drink',quantity:1,cents:1200,included:false}]};
 const state={stays:[{id:'NV-1',status:'In House',posBills:[{id:'POS-PAID'}],paidBills:{},history:[]}],posOrders:[order],deletedPOSOrders:[]};
 assert.throws(()=>deletePOSBill(state,order,'cashier'),/Reverse the payment before deleting/);
});
