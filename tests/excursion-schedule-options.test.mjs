import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../lib/guest-catalog.ts';
import {excursionScheduleNameOptions,standardScheduleSuggestions} from '../lib/excursion-schedule-options.ts';

test('schedule dropdown contains every active excursion from the catalog',()=>{
 const menu=catalog.filter(item=>item.kind==='excursion').map(item=>({...item,active:true}));
 const options=excursionScheduleNameOptions(menu);
 for(const item of menu){
  assert.equal(options.includes(item.name),true,'missing '+item.name);
 }
});

test('schedule dropdown keeps standard operating trip combinations too',()=>{
 const menu=catalog.filter(item=>item.kind==='excursion').map(item=>({...item,active:true}));
 const options=excursionScheduleNameOptions(menu);
 for(const name of standardScheduleSuggestions){
  assert.equal(options.includes(name),true,'missing standard trip '+name);
 }
});

test('inactive menu entries are excluded and names are de-duplicated',()=>{
 const options=excursionScheduleNameOptions([
  {kind:'excursion',name:'Turtle Snorkeling',active:true},
  {kind:'excursion',name:'Hidden Excursion',active:false},
  {kind:'excursion',name:'Turtle Snorkeling',active:true}
 ]);
 assert.equal(options.includes('Hidden Excursion'),false);
 assert.equal(options.filter(name=>name==='Turtle Snorkeling').length,1);
});
