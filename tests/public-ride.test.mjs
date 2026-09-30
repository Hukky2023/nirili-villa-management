import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
function load(path,stubs={},cache=new Map()){
 const file=resolve(root,path);
 if(cache.has(file))return cache.get(file);
 const mod={exports:{}};cache.set(file,mod.exports);
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',source)(id=>{
  if(Object.hasOwn(stubs,id))return stubs[id];
  if(!id.startsWith('.'))return require(id);
  const base=resolve(dirname(file),id);
  return load(existsSync(base+'.ts')?base+'.ts':base,stubs,cache);
 },mod,mod.exports);
 return mod.exports;
}

// In-memory stand-in for the hotel state record that holds buggy bookings.
function harness({fleet=[{id:'B1',name:'Buggy 1',capacity:4,status:'Available',driver:'Ali'}],fare=300}={}){
 const h={state:{stays:[],buggyFleet:structuredClone(fleet),buggySettings:{guestRideFareCents:fare},buggyBookings:[],buggyTripHistory:[]},revision:1,notices:[],saves:0};
 const route=load('app/api/public-ride/route.ts',{
  '../../../lib/auth':{limit:async()=>true,sameOrigin:(r)=>r.headers.get('origin')==='https://ride.nirilihotels.com'},
  '../../../lib/stays':{loadStays:async()=>({state:structuredClone(h.state),revision:h.revision})},
  '../../../lib/stay-login':{saveStayAccess:async(state,revision)=>{if(revision!==h.revision)return false;h.state=structuredClone(state);h.revision++;h.saves++;return true;}},
  '../../../lib/guest-catalog':{islandToday:()=>'2026-09-30'},
  '../../../lib/admin-notifications':{emitAdminNotification:async(n)=>{h.notices.push(n)}},
 });
 const post=(body,origin='https://ride.nirilihotels.com')=>route.POST(new Request('https://ride.nirilihotels.com/api/public-ride',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 const get=(query='')=>route.GET(new Request('https://ride.nirilihotels.com/api/public-ride'+query));
 const request=(extra={})=>post({action:'request',token:crypto.randomUUID(),name:'Test Rider',phone:'+960 700 0001',location:'Harbour',destination:'Nirili Villa',quantity:2,...extra});
 return {h,post,get,request};
}

test('shows the configured fare',async()=>{
 const {get}=harness({fare:300});
 assert.deepEqual(await (await get()).json(),{fareCents:300,maxPassengers:6});
});

test('a public ride joins buggy dispatch and is auto-assigned without touching any room bill',async()=>{
 const {h,request}=harness();
 const res=await request(),body=await res.json();
 assert.equal(res.status,200);
 assert.match(body.key,/^[a-f0-9]{32}$/);
 assert.equal(body.ride.status,'Assigned');
 assert.equal(body.ride.buggyName,'Buggy 1');
 const ride=h.state.buggyBookings[0];
 assert.equal(ride.bookingType,'public-ride');
 assert.equal(ride.room,'');
 assert.equal(ride.chargeToRoom,false);
 assert.equal(ride.fareCents,300);
 assert.equal(h.state.buggyFleet[0].status,'Assigned');
 assert.equal(h.notices[0].title,'New Nirili Ride request');
 assert.equal(h.state.stays.length,0);
});

test('waits in the queue when no buggy is free',async()=>{
 const {h,request}=harness({fleet:[{id:'B1',name:'Buggy 1',capacity:4,status:'Maintenance'}]});
 const body=await (await request()).json();
 assert.equal(body.ride.status,'Requested');
 assert.equal(h.state.buggyBookings[0].buggyId,undefined);
});

test('the rider can follow the ride only with its private key, and sees no internal details',async()=>{
 const {request,get}=harness();
 const {ride,key}=await (await request()).json();
 const ok=await (await get('?id='+ride.id+'&key='+key)).json();
 assert.equal(ok.ride.id,ride.id);
 assert.equal(ok.ride.phone,undefined);
 assert.equal(ok.ride.rideKey,undefined);
 assert.equal((await get('?id='+ride.id+'&key='+'0'.repeat(32))).status,404);
});

test('one active ride per phone number; retries with the same token do not duplicate',async()=>{
 const {h,request}=harness();
 const token=crypto.randomUUID();
 const first=await (await request({token})).json(),again=await (await request({token})).json();
 assert.equal(again.ride.id,first.ride.id);
 assert.equal(h.state.buggyBookings.length,1);
 const other=await request();
 assert.equal(other.status,400);
 assert.match((await other.json()).error,/already has an active ride/);
});

test('cancelling frees the buggy; a ride already under way cannot be cancelled online',async()=>{
 const {h,request,post}=harness();
 const {ride,key}=await (await request()).json();
 const cancelled=await (await post({action:'cancel',id:ride.id,key})).json();
 assert.equal(cancelled.ride.status,'Cancelled');
 assert.equal(h.state.buggyFleet[0].status,'Available');
 const second=await (await request({phone:'+960 700 0002'})).json();
 h.state.buggyBookings.find(x=>x.id===second.ride.id).buggyStatus='On trip';
 const res=await post({action:'cancel',id:second.ride.id,key:second.key});
 assert.equal(res.status,400);
});

test('rejects bad input and cross-site requests',async()=>{
 const {request,post}=harness();
 assert.equal((await request({phone:'7000001'})).status,400);
 assert.equal((await request({destination:'Harbour'})).status,400);
 assert.equal((await request({quantity:9})).status,400);
 assert.equal((await post({action:'request'},'https://evil.example')).status,403);
});

test('dispatch and drivers treat public rides like in-house guest rides',()=>{
 const {isOnDemandRide,isPublicRide,activeOnDemandRide}=load('lib/buggy-rides.ts');
 assert.equal(isOnDemandRide({bookingType:'public-ride'}),true);
 assert.equal(isOnDemandRide({bookingType:'guest-ride'}),true);
 assert.equal(isOnDemandRide({bookingType:'manual'}),false);
 assert.equal(isPublicRide({bookingType:'guest-ride'}),false);
 assert.equal(activeOnDemandRide({bookingType:'public-ride',buggyStatus:'Completed'}),false);
});
