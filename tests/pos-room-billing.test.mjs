import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mealPlanIncludedOrder,
  restaurantPaymentStatus,
  restaurantRoomBillItems,
  reconcileRestaurantRoomBills,
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


test('reconcile replaces a stale restaurant room bill after an admin edit',()=>{
 const state={
  stays:[{id:'NV-EDIT',posBills:[{department:'Restaurant',id:'POS-EDIT',items:[['Old item',1,25,0]],status:'Posted',totalCents:2500}],paidBills:{}}],
  posOrders:[{id:'POS-EDIT',stayId:'NV-EDIT',method:'Room',cents:800,items:[{name:'Rice · Chicken',quantity:1,unitCents:800,cents:800,included:false,discount:0}]}],
  deletedPOSOrders:[]
 };
 reconcileRestaurantRoomBills(state);
 assert.equal(state.stays[0].posBills.length,1);
 assert.equal(state.stays[0].posBills[0].totalCents,800);
 assert.deepEqual(state.stays[0].posBills[0].items,[['Rice · Chicken',1,8,0]]);
});

test('reconcile moves a restaurant bill to the order current room',()=>{
 const state={
  stays:[
   {id:'NV-OLD',posBills:[{department:'Restaurant',id:'POS-MOVE',totalCents:500}],paidBills:{}},
   {id:'NV-NEW',posBills:[],paidBills:{}}
  ],
  posOrders:[{id:'POS-MOVE',stayId:'NV-NEW',method:'Room',cents:500,items:[{name:'Coke',quantity:1,unitCents:500,cents:500,included:false,discount:0}]}],
  deletedPOSOrders:[]
 };
 reconcileRestaurantRoomBills(state);
 assert.equal(state.stays[0].posBills.some(b=>b.id==='POS-MOVE'),false);
 assert.equal(state.stays[1].posBills.find(b=>b.id==='POS-MOVE').totalCents,500);
});

test('reconcile removes deleted restaurant bills from room folios',()=>{
 const state={
  stays:[{id:'NV-DEL',posBills:[{department:'Restaurant',id:'POS-DEL',totalCents:500}],paidBills:{'Restaurant:POS-DEL':500}}],
  posOrders:[],
  deletedPOSOrders:[{id:'POS-DEL'}]
 };
 reconcileRestaurantRoomBills(state);
 assert.deepEqual(state.stays[0].posBills,[]);
 assert.equal('Restaurant:POS-DEL' in state.stays[0].paidBills,false);
});

test('complimentary restaurant items stay visible in the room bill',()=>{
 const stay={id:'NV-FREE',posBills:[],paidBills:{}};
 const order={
  id:'POS-FREE',stayId:'NV-FREE',cents:0,method:'Room',complimentary:true,
  items:[{name:'Burger · Chicken',quantity:1,unitCents:900,cents:0,included:false,discount:100}]
 };
 syncRestaurantRoomBill(stay,order);
 assert.equal(stay.posBills.length,1);
 assert.deepEqual(stay.posBills[0].items,[['Burger · Chicken',1,9,100]]);
 assert.equal(stay.posBills[0].status,'Complimentary');
});
