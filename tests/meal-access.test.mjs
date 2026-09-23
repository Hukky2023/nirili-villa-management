import test from 'node:test';
import assert from 'node:assert/strict';
import {
  halfBoardFreeOrderAvailable,
  halfBoardIncludedMealPeriod,
  mealItemCoveredByPackage,
  mealItemIncluded,
  restaurantMealPeriod
} from '../lib/meal-access.ts';

const state=()=>({
  stays:[{id:'NV-HB',status:'In House',meal:'Half Board',history:[]}],
  posOrders:[]
});

test('restaurant meal periods follow Maldives service hours',()=>{
  assert.equal(restaurantMealPeriod('2026-09-23T02:30:00Z'),'Breakfast');
  assert.equal(restaurantMealPeriod('2026-09-23T09:59:00Z'),'Lunch');
  assert.equal(restaurantMealPeriod('2026-09-23T10:00:00Z'),'');
  assert.equal(restaurantMealPeriod('2026-09-23T14:00:00Z'),'Dinner');
  assert.equal(restaurantMealPeriod('2026-09-23T17:59:00Z'),'Dinner');
  assert.equal(restaurantMealPeriod('2026-09-23T18:00:00Z'),'');
  assert.equal(restaurantMealPeriod('2026-09-25T08:00:00Z'),'');
  assert.equal(restaurantMealPeriod('2026-09-25T08:30:00Z'),'Lunch');
  assert.equal(restaurantMealPeriod('2026-09-25T10:00:00Z'),'');
});

test('Half Board first lunch is automatically included',()=>{
  const s=state();
  assert.equal(halfBoardFreeOrderAvailable(s,'NV-HB','2026-09-23T07:30:00Z'),true);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'','Lunch'),true);
  s.posOrders.push({
    id:'POS-LUNCH',stayId:'NV-HB',createdAt:'2026-09-23T07:30:00Z',
    mealPeriod:'Lunch',includedMealPeriod:'Lunch',items:[{included:true}]
  });
  assert.equal(halfBoardIncludedMealPeriod(s,'NV-HB','2026-09-23T14:00:00Z'),'Lunch');
  assert.equal(halfBoardFreeOrderAvailable(s,'NV-HB','2026-09-23T14:00:00Z'),false);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},false,'','Dinner'),false);
});

test('Half Board first dinner is automatically included when lunch was not used',()=>{
  const s=state();
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'','Dinner'),true);
  s.posOrders.push({
    id:'POS-DINNER',stayId:'NV-HB',createdAt:'2026-09-23T14:00:00Z',
    mealPeriod:'Dinner',includedMealPeriod:'Dinner',items:[{included:true}]
  });
  assert.equal(halfBoardIncludedMealPeriod(s,'NV-HB','2026-09-23T14:10:00Z'),'Dinner');
  assert.equal(halfBoardFreeOrderAvailable(s,'NV-HB','2026-09-23T14:10:00Z'),false);
});

test('Half Board breakfast stays included and does not consume lunch or dinner',()=>{
  const s=state();
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'','Breakfast'),true);
  s.posOrders.push({
    id:'POS-B',stayId:'NV-HB',createdAt:'2026-09-23T02:30:00Z',
    mealPeriod:'Breakfast',includedMealPeriod:'Breakfast',items:[{included:true}]
  });
  assert.equal(halfBoardFreeOrderAvailable(s,'NV-HB','2026-09-23T07:30:00Z'),true);
  assert.equal(mealItemIncluded('Half Board',{fullBoard:true},true,'','Lunch'),true);
});

test('non-package Half Board items remain chargeable',()=>{
  assert.equal(mealItemIncluded('Half Board',{fullBoard:false},true,'','Lunch'),false);
  assert.equal(mealItemCoveredByPackage('Half Board',{fullBoard:false}),false);
});

test('Full Board package items remain included',()=>{
  assert.equal(mealItemIncluded('Full Board',{fullBoard:true},true,'','Lunch'),true);
  assert.equal(mealItemCoveredByPackage('Full Board',{fullBoard:true}),true);
});
