import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const env={SUPABASE_SECRET_KEY:'supabase-secret',CHANNEX_PRODUCTION_API_KEY:'channex-key'};
const notices=[];
const stubs={
 'cloudflare:workers':{env},
 './auth':{authDb:()=>({prepare:()=>({bind:()=>({run:async()=>({})})})})},
 './booking-reference':{nextBookingReference:()=>'NV-1'},
 './guest-catalog':{nightly:(plan,pax)=>[5000,6000,7000][pax-1]},
 './rooms':{updateRoomInventory:state=>state},
 './stays':{stayKey:'stays'},
 './supabase-bridge':{mirrorHotelState:async()=>{},readOperationalRecordPrimary:async()=>({payload:{rooms:hotelRooms,stays:hotelStays},revision:1}),saveOperationalRecordPrimary:async()=>1},
 './admin-notifications':{emitAdminNotification:async notice=>{notices.push(notice)}},
 './booking-closures':{bookingClosureForStay:()=>null,isBookingDateClosed:()=>false}
};
const src=ts.transpileModule(readFileSync(new URL('../lib/channels.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',src)(id=>{if(!(id in stubs))throw Error('Unexpected import '+id);return stubs[id]},mod,mod.exports);
const channels=mod.exports;

let connection,reservations,calls,ariPayload,hotelRooms,hotelStays;
function reset(overrides={}){
 connection={id:'booking-com',channel:'booking-com',provider:'channex',enabled:true,mode:'production',status:'connected',property_id:'prop-1',settings:{dryRun:false,autoImportReservations:true,autoPushAvailability:true},...overrides};
 reservations=[];calls=[];notices.length=0;ariPayload=null;hotelRooms=[{number:'101',capacity:3},{number:'102',capacity:3}];hotelStays=[];
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
globalThis.fetch=async(input,init={})=>{
 const url=String(input),method=init.method||'GET';
 calls.push({url,method,body:init.body});
 if(url.includes('/rest/v1/channel_connections'))return method==='GET'?json([connection]):new Response(null,{status:204});
 if(url.includes('/rest/v1/channel_reservations'))return method==='GET'?json(reservations):json([]);
 if(url.includes('/rest/v1/channel_room_mappings'))return json([{channel_room_id:'room-1',pms_room_type:'Double Room',active:true,settings:{}}]);
 if(url.includes('/rest/v1/integration_state')){
  if(method==='GET')return json(ariPayload?[{payload:ariPayload}]:[]);
  ariPayload=JSON.parse(init.body)[0].payload;return json([{}]);
 }
 if(url.includes('/rest/v1/channel_rate_mappings'))return json([
  {channel_rate_id:'rate-pp',pms_meal_plan:'Bed & Breakfast',active:true,settings:{}},
  {channel_rate_id:'rate-room',pms_meal_plan:'Bed & Breakfast',active:true,settings:{stagingOnly:true,stagingOccupancy:1}}
 ]);
 if(url.endsWith('/availability')||url.endsWith('/restrictions'))return json({meta:{message:'Success'}});
 if(url.includes('/rest/v1/'))return method==='GET'?json([]):json([{}]);
 if(url.includes('/webhooks?'))return json({data:[]});
 if(url.endsWith('/webhooks'))return json({data:{id:'hook-1',attributes:{}}});
 if(url.includes('/booking_revisions/feed'))return json({data:[]});
 throw Error('Unexpected fetch '+url);
};

test('webhook setup uses the API key of the active environment',async()=>{
 reset();
 const result=await channels.ensureBookingComWebhook('https://pms.example/api/channels/booking-com/webhook');
 assert.equal(result.ok,true);
 assert.equal(result.webhookId,'hook-1');
 const created=calls.find(call=>call.url.endsWith('/webhooks')&&call.method==='POST');
 assert.ok(created,'webhook was registered with Channex');
 const body=JSON.parse(created.body);
 assert.equal(body.webhook.event_mask,'booking');
 assert.ok(body.webhook.headers['X-Nirili-Channel-Secret']);
});

test('recovery poll accepts the CHANNEX_CRON_TOKEN secret and rejects anything else',async()=>{
 reset();
 env.CHANNEX_CRON_TOKEN='poll-token';
 try{
  const request=token=>new Request('https://pms.example/api/channels/booking-com/cron',{method:'POST',headers:token?{'x-nirili-channel-cron':token}:{}});
  await assert.rejects(channels.handleBookingComCron(request('')),error=>error.status===401);
  await assert.rejects(channels.handleBookingComCron(request('wrong')),error=>error.status===401);
  const result=await channels.handleBookingComCron(request('poll-token'));
  assert.equal(result.ok,true);
  assert.equal(result.skipped,false);
  assert.ok(calls.some(call=>call.url.includes('/booking_revisions/feed')),'feed was polled');
 }finally{delete env.CHANNEX_CRON_TOKEN;}
});

const revision=(id='rev-1')=>({data:{id,attributes:{
 revision_id:id,unique_id:'BDC-42',ota_reservation_code:'42',status:'new',
 arrival_date:'2026-12-01',departure_date:'2026-12-03',currency:'USD',amount:200,
 customer:{name:'Ana',surname:'Silva'},
 rooms:[{room_type_id:'unmapped-room',rate_plan_id:'rate-1',occupancy:{adults:2,children:0},amount:200}]
}}});

test('a production booking that cannot be imported alerts staff once',async()=>{
 reset();
 await assert.rejects(channels.processBookingComRevision(revision()),/not mapped/);
 assert.equal(notices.length,1);
 assert.equal(notices[0].title,'Booking.com reservation needs attention');
 assert.match(notices[0].detail,/Ana Silva/);

 reservations=[{status:'mapping_required',external_revision_id:'rev-1'}];
 await assert.rejects(channels.processBookingComRevision(revision()),/not mapped/);
 assert.equal(notices.length,1,'a retry of the same revision does not alert again');
});

test('staging import failures do not alert staff',async()=>{
 reset({mode:'staging'});
 env.CHANNEX_STAGING_API_KEY='staging-key';
 try{
  await assert.rejects(channels.processBookingComRevision(revision('rev-2')));
  assert.equal(notices.length,0);
 }finally{delete env.CHANNEX_STAGING_API_KEY;}
});

const availabilityCalls=()=>calls.filter(call=>call.url.endsWith('/availability')).map(call=>JSON.parse(call.body).values);

test('automatic availability push sends only dates that changed',async()=>{
 reset();
 const first=await channels.autoPushBookingComAvailability(5);
 assert.equal(first.changedDates,5,'first push has no snapshot, so every date is new');
 assert.equal(availabilityCalls().length,1);

 const again=await channels.autoPushBookingComAvailability(5);
 assert.equal(again.skipped,true,'nothing changed, so nothing is sent');
 assert.equal(availabilityCalls().length,1);

 hotelRooms=[...hotelRooms,{number:'103',capacity:3}];
 const changed=await channels.autoPushBookingComAvailability(5);
 assert.equal(changed.changedDates,5);
 const sent=availabilityCalls().at(-1);
 assert.equal(sent.length,1,'consecutive changed dates collapse into one range');
 assert.equal(sent[0].availability,3);
});

test('availability pushes stay within 10 requests per minute',async()=>{
 reset();
 const now=new Date().toISOString();
 ariPayload={mappingKey:'room-1',values:{},requests:Array(10).fill(now)};
 const deferred=await channels.autoPushBookingComAvailability(5);
 assert.equal(deferred.deferred,true);
 assert.equal(availabilityCalls().length,0);
 await assert.rejects(channels.pushBookingComAvailability(5),/10 availability updates per minute/);

 ariPayload.requests=Array(10).fill(new Date(Date.now()-61000).toISOString());
 const sent=await channels.autoPushBookingComAvailability(5);
 assert.equal(sent.changedDates,5,'deferred dates are sent once the minute has passed');
 assert.equal(availabilityCalls().length,1);
});

test('change detection compares against the last values sent',()=>{
 const values=[{date:'2026-12-01',availability:3},{date:'2026-12-02',availability:4}];
 assert.deepEqual(channels.changedAvailability(values,{'2026-12-01':3,'2026-12-02':5}),[values[1]]);
 assert.equal(channels.recentAvailabilityRequests([new Date(Date.now()-59000).toISOString(),new Date(Date.now()-61000).toISOString()]).length,1);
});

test('full sync is exactly two Channex calls carrying every declared restriction',async()=>{
 reset({mode:'staging'});
 env.CHANNEX_STAGING_API_KEY='staging-key';
 try{
  const result=await channels.fullSyncBookingComAri(30);
  assert.equal(result.apiCalls,2);
  const channexCalls=calls.filter(call=>!call.url.includes('/rest/v1/'));
  assert.deepEqual(channexCalls.map(call=>call.url.split('/').pop()),['availability','restrictions']);
  const restrictions=JSON.parse(channexCalls[1].body).values;
  assert.equal(restrictions.length,2,'30 open days collapse into one range per rate plan');
  for(const value of restrictions){
   for(const key of ['min_stay_arrival','max_stay','closed_to_arrival','closed_to_departure','stop_sell'])assert.ok(key in value,key+' is sent');
  }
  assert.deepEqual(restrictions[0].rates,[{occupancy:1,rate:'50.00'},{occupancy:2,rate:'60.00'},{occupancy:3,rate:'70.00'}],'per-person plans price every occupancy');
  assert.equal(restrictions[1].rate,'50.00','per-room plans use their occupancy');
 }finally{delete env.CHANNEX_STAGING_API_KEY;}
});

test('staging availability follows bookings in the real PMS calendar',async()=>{
 reset({mode:'staging'});
 env.CHANNEX_STAGING_API_KEY='staging-key';
 try{
  await channels.autoPushBookingComAvailability(5);
  hotelRooms=[...hotelRooms,{number:'103',capacity:3}];
  const result=await channels.autoPushBookingComAvailability(5);
  assert.equal(result.changedDates,5);
 }finally{delete env.CHANNEX_STAGING_API_KEY;}
});

test('a 1-night booking sends one date; moving it a week later sends old and new dates',async()=>{
 reset();
 const day=n=>new Date(Date.now()+n*86400000+5*3600000).toISOString().slice(0,10);
 await channels.fullSyncBookingComAri(30);
 const booking={id:'NV-9',room:'101',status:'Confirmed',checkIn:day(3),checkOut:day(4)};
 hotelStays=[booking];
 await channels.autoPushBookingComAvailability(30);
 assert.deepEqual(availabilityCalls().at(-1).map(v=>[v.date_from,v.date_to,v.availability]),[[day(3),day(3),1]]);

 Object.assign(booking,{checkIn:day(10),checkOut:day(11)});
 await channels.autoPushBookingComAvailability(30);
 assert.deepEqual(availabilityCalls().at(-1).map(v=>[v.date_from,v.date_to,v.availability]),[[day(3),day(3),2],[day(10),day(10),1]]);
});
