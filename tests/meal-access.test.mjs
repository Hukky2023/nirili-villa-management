import test from 'node:test';
import assert from 'node:assert/strict';
import {
  halfBoardFreeOrderAvailable,
  halfBoardMealSelection,
  mealItemIncluded,
  restaurantMealPeriod,
  setHalfBoardMealSelection
} from '../lib/meal-access.ts';

const state=()=>({
  stays:[{id:'NV-HB',status:'In House',meal:'Half Board',history:[]}],
  posOrders:[]
});

test('restaurant meal periods follow Maldives service hours',()=>{
  assert.equal(restaurantMealPeriod('2026-09-23T02:30:00Z'),'Breakfast');
  assert.equal(restaurantMealPeriod('2026-09-23T07:30:00Z'),'Lunch');
  assert.equal(restaurantMealPeriod('2026-09-23T14:00:00Z'),'Dinner');
  assert.equal(restaurantMealPeriod('2026-09-25T08:00:00Z'),'');
  assert.equal(restaurantMealPeriod('2026-09-25T08:30:00Z'),'Lunch');
});

test('Half Board breakfast is included and selected lunch or dinner is included once',()=>{
  const s=state();
  const lunch='2026-09-23T07:30:00Z';
  setHalfBoardMealSelection(s,'NV-HB','Lunch','waiter',lunch);
  assert.equal(halfBoardMealSelection(s,'NV-HB',lunch),'Lunch');
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'Lunch','Breakfast'),true);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'Lunch','Lunch'),true);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'Lunch','Dinner'),false);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:false},true,'Lunch','Lunch'),false);
  assert.equal(mealItemIncluded('Full Board',{fullBoard:true},true,'',''),true);
});

test('Half Board lunch or dinner selection locks after included meal is used',()=>{
  const s=state(),now='2026-09-23T07:30:00Z';
  setHalfBoardMealSelection(s,'NV-HB','Lunch','guest',now);
  s.posOrders.push({
    id:'POS-1',stayId:'NV-HB',createdAt:now,mealPeriod:'Lunch',includedMealPeriod:'Lunch',
    items:[{included:true}]
  });
  assert.equal(halfBoardFreeOrderAvailable(s,'NV-HB',now),false);
  assert.throws(()=>setHalfBoardMealSelection(s,'NV-HB','Dinner','guest',now),/locked/);
  assert.equal(halfBoardMealSelection(s,'NV-HB',now),'Lunch');
});

test('Breakfast does not consume the Half Board lunch or dinner entitlement',()=>{
  const s=state(),breakfast='2026-09-23T02:30:00Z',lunch='2026-09-23T07:30:00Z';
  setHalfBoardMealSelection(s,'NV-HB','Dinner','guest',breakfast);
  s.posOrders.push({
    id:'POS-B',stayId:'NV-HB',createdAt:breakfast,mealPeriod:'Breakfast',includedMealPeriod:'Breakfast',
    items:[{included:true}]
  });
  assert.equal(halfBoardFreeOrderAvailable(s,'NV-HB',lunch),true);
});
