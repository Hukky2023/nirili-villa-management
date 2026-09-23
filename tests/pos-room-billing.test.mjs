import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mealPlanIncludedOrder,
  restaurantPaymentStatus,
  restaurantRoomBillItems,
  syncRestaurantRoomBill
} from '../lib/pos-room-billing.ts';

test('Full Board included-only order never creates a room bill',()=>{
 const stay={id:'NV-FB',meal:'Full Board',posBills:[],paidBills:{}};
 const order={
  id:'POS-FB',stayId:'NV-FB',cents:0,method:'',
  items:[
   {name:'Rice · Chicken',quantity:1,unitCents:0,cents:0,included:true,menuCents:800},
   {name:'Hot Beverages · Tea',quantity:2,unitCents:0,cents:0,included:true,menuCents:300}
  ]
 };
 assert.equal(mealPlanIncludedOrder(order),true);
 assert.equal(syncRestaurantRoomBill(stay,order),false);
 assert.deepEqual(stay.posBills,[]);
 assert.equal(restaurantPaymentStatus(order,stay),'Meal plan included');
});

test('mixed meal-plan order bills only chargeable extras at unit price',()=>{
 const stay={id:'NV-FB',meal:'Full Board',posBills:[],paidBills:{}};
 const order={
  id:'POS-MIXED',stayId:'NV-FB',cents:1200,method:'Room',
  items:[
   {name:'Rice · Chicken (meal plan included)',quantity:1,unitCents:0,cents:0,included:true,menuCents:800},
   {name:'Soft Drink · Coke',quantity:2,unitCents:600,cents:1200,included:false,menuCents:600}
  ]
 };
 assert.equal(mealPlanIncludedOrder(order),false);
 assert.equal(syncRestaurantRoomBill(stay,order),true);
 assert.equal(stay.posBills.length,1);
 assert.equal(stay.posBills[0].totalCents,1200);
 assert.deepEqual(stay.posBills[0].items,[['Soft Drink · Coke',2,6,0]]);
 assert.equal(restaurantPaymentStatus(order,stay),'Charged to room');
});

test('re-sync removes an old zero-dollar meal-plan room bill',()=>{
 const stay={id:'NV-FB',meal:'Full Board',posBills:[{department:'Restaurant',id:'POS-OLD',totalCents:0}],paidBills:{'Restaurant:POS-OLD':0}};
 const order={id:'POS-OLD',stayId:'NV-FB',cents:0,items:[{name:'Pizza · Chicken',quantity:1,unitCents:0,cents:0,included:true}]};
 assert.equal(syncRestaurantRoomBill(stay,order),false);
 assert.deepEqual(stay.posBills,[]);
});
