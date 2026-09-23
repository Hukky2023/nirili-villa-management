import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mealItemCoveredByPackage,
  mealItemIncluded,
  mealPlanDailyOrderLimit,
  mealPlanIncludedOrderCount,
  mealPlanOrderStatus
} from '../lib/meal-access.ts';

const halfBoardState=()=>({
  stays:[{id:'NV-HB',status:'In House',meal:'Half Board',history:[]}],
  posOrders:[]
});
const fullBoardState=()=>({
  stays:[{id:'NV-FB',status:'In House',meal:'Full Board',history:[]}],
  posOrders:[]
});
const includedOrder=(id,stayId,createdAt)=>({
  id,stayId,createdAt,items:[{id:'menu-1',included:true}]
});

test('meal-plan daily order limits are Half Board 1 and Full Board 2',()=>{
  assert.equal(mealPlanDailyOrderLimit('Half Board'),1);
  assert.equal(mealPlanDailyOrderLimit('Full Board'),2);
  assert.equal(mealPlanDailyOrderLimit('Bed & Breakfast'),0);
});

test('Half Board gets one included order per Maldives day with no time restriction',()=>{
  const s=halfBoardState(),late='2026-09-23T18:30:00Z';
  assert.equal(mealPlanOrderStatus(s,'NV-HB',late).remaining,1);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'',''),true);
  s.posOrders.push(includedOrder('POS-HB-1','NV-HB',late));
  const status=mealPlanOrderStatus(s,'NV-HB',late);
  assert.equal(status.used,1);
  assert.equal(status.remaining,0);
  assert.equal(status.available,false);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},status.available,'','Dinner'),false);
});

test('Full Board gets two included orders per Maldives day and third order is charged',()=>{
  const s=fullBoardState(),day='2026-09-23T06:00:00Z';
  assert.equal(mealPlanOrderStatus(s,'NV-FB',day).remaining,2);
  s.posOrders.push(includedOrder('POS-FB-1','NV-FB','2026-09-23T06:00:00Z'));
  assert.equal(mealPlanOrderStatus(s,'NV-FB',day).remaining,1);
  s.posOrders.push(includedOrder('POS-FB-2','NV-FB','2026-09-23T12:00:00Z'));
  const status=mealPlanOrderStatus(s,'NV-FB',day);
  assert.equal(status.used,2);
  assert.equal(status.remaining,0);
  assert.equal(mealItemIncluded('Full Board',{fullBoard:true},status.available),false);
});

test('orders containing only paid extras do not consume a free meal-plan order',()=>{
  const s=halfBoardState(),now='2026-09-23T12:00:00Z';
  s.posOrders.push({id:'POS-EXTRA',stayId:'NV-HB',createdAt:now,items:[{included:false}]});
  assert.equal(mealPlanIncludedOrderCount(s,'NV-HB',now),0);
  assert.equal(mealPlanOrderStatus(s,'NV-HB',now).remaining,1);
  assert.equal(mealItemCoveredByPackage('Half Board',{fullBoard:false}),false);
});

test('editing an included order excludes itself from the allowance calculation',()=>{
  const s=halfBoardState(),now='2026-09-23T12:00:00Z';
  s.posOrders.push(includedOrder('POS-HB-EDIT','NV-HB',now));
  assert.equal(mealPlanOrderStatus(s,'NV-HB',now).available,false);
  const duringEdit=mealPlanOrderStatus(s,'NV-HB',now,'POS-HB-EDIT');
  assert.equal(duringEdit.used,0);
  assert.equal(duringEdit.remaining,1);
  assert.equal(duringEdit.available,true);
});

test('deleting an included order restores the daily allowance',()=>{
  const s=fullBoardState(),now='2026-09-23T12:00:00Z';
  s.posOrders.push(includedOrder('POS-1','NV-FB',now),includedOrder('POS-2','NV-FB',now));
  assert.equal(mealPlanOrderStatus(s,'NV-FB',now).remaining,0);
  s.posOrders=s.posOrders.filter(o=>o.id!=='POS-1');
  assert.equal(mealPlanOrderStatus(s,'NV-FB',now).remaining,1);
});

test('daily allowance resets on the next Maldives day',()=>{
  const s=halfBoardState();
  s.posOrders.push(includedOrder('POS-DAY-1','NV-HB','2026-09-23T12:00:00Z'));
  assert.equal(mealPlanOrderStatus(s,'NV-HB','2026-09-23T12:30:00Z').remaining,0);
  assert.equal(mealPlanOrderStatus(s,'NV-HB','2026-09-24T12:30:00Z').remaining,1);
});
