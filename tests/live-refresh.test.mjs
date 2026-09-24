import test from 'node:test';
import assert from 'node:assert/strict';
import {startLiveRefresh,REFRESH_INTERVALS} from '../lib/live-refresh.ts';

function setup(t){
 t.mock.timers.enable({apis:['setInterval','setTimeout','Date'],now:0});
 const cleanups=[];t.stopRefresh=stop=>cleanups.push(stop);
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window=new EventTarget();
 globalThis.document=Object.assign(new EventTarget(),{hidden:false});
 t.after(()=>{cleanups.forEach(stop=>stop());globalThis.window=previousWindow;globalThis.document=previousDocument;});
 return {emit:name=>window.dispatchEvent(new Event(name)),visibility:hidden=>{document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));},advance:async ms=>{t.mock.timers.tick(ms);await Promise.resolve();await Promise.resolve();}};
}
for(const [name,interval] of Object.entries(REFRESH_INTERVALS)){
 test(`${name} refresh waits for its configured interval`,async t=>{
  const {advance}=setup(t);let calls=0;
  const stop=startLiveRefresh(()=>{calls++},interval);t.stopRefresh(stop);
  await advance(interval-1);assert.equal(calls,0);
  await advance(1);assert.equal(calls,1);
  await advance(interval);assert.equal(calls,2);
 });
}
test('hidden pages pause; returning to the page refreshes once immediately',async t=>{
 const {advance,visibility,emit}=setup(t);let calls=0;
 const stop=startLiveRefresh(()=>{calls++});t.stopRefresh(stop);
 visibility(true);await advance(60000);emit('services-updated');await advance(0);assert.equal(calls,0);
 visibility(false);emit('focus');await advance(0);assert.equal(calls,1);
 await advance(15000);assert.equal(calls,2);
});
test('save events refresh immediately and coalesce paired notifications',async t=>{
 const {advance,emit}=setup(t);let calls=0;
 const stop=startLiveRefresh(()=>{calls++},REFRESH_INTERVALS.reports);t.stopRefresh(stop);
 emit('pos-updated');emit('services-updated');await advance(0);assert.equal(calls,1);
 await advance(1000);emit('services-updated');await advance(0);assert.equal(calls,2);
});
test('slow requests never overlap, and a save during a request triggers a follow-up',async t=>{
 const {advance,emit}=setup(t);let calls=0,resolve;
 const stop=startLiveRefresh(()=>{calls++;return new Promise(r=>{resolve=r})});t.stopRefresh(stop);
 await advance(15000);assert.equal(calls,1);
 await advance(15000);assert.equal(calls,1);
 emit('services-updated');resolve();await Promise.resolve();await advance(0);assert.equal(calls,2);
 resolve();await Promise.resolve();
});
test('failed updates recover on the next interval',async t=>{
 const {advance}=setup(t);let calls=0;
 const stop=startLiveRefresh(()=>{calls++;if(calls===1)throw Error('offline')});t.stopRefresh(stop);
 await advance(15000);await advance(15000);assert.equal(calls,2);
});
test('cleanup cancels queued work and removes all listeners',async t=>{
 const {advance,emit,visibility}=setup(t);let calls=0;
 const stop=startLiveRefresh(()=>{calls++});emit('services-updated');stop();
 emit('pos-updated');emit('focus');emit('online');visibility(true);visibility(false);
 await advance(60000);assert.equal(calls,0);
});
