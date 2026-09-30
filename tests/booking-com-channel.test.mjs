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
 './guest-catalog':{nightly:()=>0},
 './rooms':{updateRoomInventory:state=>state},
 './stays':{stayKey:'stays'},
 './supabase-bridge':{mirrorHotelState:async()=>{},readOperationalRecordPrimary:async()=>({payload:{rooms:[{number:'101',capacity:3}],stays:[]},revision:1}),saveOperationalRecordPrimary:async()=>1},
 './admin-notifications':{emitAdminNotification:async notice=>{notices.push(notice)}},
 './booking-closures':{bookingClosureForStay:()=>null,isBookingDateClosed:()=>false}
};
const src=ts.transpileModule(readFileSync(new URL('../lib/channels.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',src)(id=>{if(!(id in stubs))throw Error('Unexpected import '+id);return stubs[id]},mod,mod.exports);
const channels=mod.exports;

let connection,reservations,calls;
function reset(overrides={}){
 connection={id:'booking-com',channel:'booking-com',provider:'channex',enabled:true,mode:'production',status:'connected',property_id:'prop-1',settings:{dryRun:false,autoImportReservations:true},...overrides};
 reservations=[];calls=[];notices.length=0;
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
globalThis.fetch=async(input,init={})=>{
 const url=String(input),method=init.method||'GET';
 calls.push({url,method,body:init.body});
 if(url.includes('/rest/v1/channel_connections'))return method==='GET'?json([connection]):new Response(null,{status:204});
 if(url.includes('/rest/v1/channel_reservations'))return method==='GET'?json(reservations):json([]);
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
