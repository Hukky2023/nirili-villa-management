import test from 'node:test';
import assert from 'node:assert/strict';
import {deletePOSBill} from '../lib/pos-bill-delete.ts';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const bridgeSource=readFileSync(new URL('../lib/supabase-bridge.ts',import.meta.url),'utf8')
 .replace("import {env} from 'cloudflare:workers';","const env={SUPABASE_SECRET_KEY:'test-only-key'};")
 .replace("'./pos-room-billing'",JSON.stringify(new URL('../lib/pos-room-billing.ts',import.meta.url).href));
const bridge=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(bridgeSource,{mode:'transform'})).toString('base64'));

test('Supabase recovery and subsequent save do not resurrect a deleted booking bill',async t=>{
 const order={id:'POS-ARCHIVED',stayId:'NV-ARCHIVED',cents:0,items:[{included:true,cents:0}]};
 const state={stays:[],posOrders:[order],deletedBookings:[{stay:{id:'NV-ARCHIVED'},posOrders:[order]}]};
 let saved;
 t.mock.method(globalThis,'fetch',async (url,init)=>{
  if(String(url).includes('/restaurant_orders?'))return Response.json([{id:order.id,payload:order}]);
  if(String(url).endsWith('/rpc/save_operational_record')){saved=JSON.parse(init.body).p_payload;return Response.json(2);}
  throw Error('Unexpected test request: '+url);
 });
 await bridge.restoreRestaurantOrdersPrimary(state);
 assert.deepEqual(state.posOrders,[]);
 assert.equal(await bridge.saveOperationalRecordPrimary('hotel-stays-v1',state,1,'admin'),2);
 assert.deepEqual(saved.posOrders,[]);
 assert.equal(saved.deletedBookings[0].posOrders[0].id,order.id);
});

test('known deleted bills stay hidden when Supabase recovery is unavailable',async t=>{
 const state={stays:[],posOrders:[{id:'POS-ARCHIVED',stayId:'NV-ARCHIVED'}],deletedBookings:[{stay:{id:'NV-ARCHIVED'}}]};
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Recovery unavailable');});
 await assert.rejects(bridge.restoreRestaurantOrdersPrimary(state),/Recovery unavailable/);
 assert.deepEqual(state.posOrders,[]);
});

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
