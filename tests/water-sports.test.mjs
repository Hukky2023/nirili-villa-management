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

// Minimal in-memory stand-in for the D1 operation_records table.
function fakeD1(){
 const rows=new Map();
 const run=(sql,args)=>{
  if(sql.startsWith('INSERT OR IGNORE')){const [key,payload,by]=args;if(rows.has(key))return {meta:{changes:0}};rows.set(key,{key,payload,revision:1,updated_by:by});return {meta:{changes:1}};}
  if(sql.startsWith('UPDATE')){const [payload,by,key,rev]=args,row=rows.get(key);if(!row||row.revision!==rev)return {meta:{changes:0}};rows.set(key,{key,payload,revision:rev+1,updated_by:by});return {meta:{changes:1}};}
  throw Error('unexpected SQL '+sql);
 };
 const db={prepare:sql=>({bind:(...args)=>({
  run:async()=>run(sql,args),
  first:async()=>rows.get(args[0])||null,
  all:async()=>({results:[...rows.values()].filter(r=>r.key.startsWith(String(args[0]).replace(/%$/,'')))}),
 })})};
 return {db,rows};
}

function setup({user={role:'admin',userId:'U1',displayName:'Admin',permissions:[]}}={}){
 const d1=fakeD1(),notices=[],who={user};
 const stubs={
  '../../../lib/auth':{currentUser:async()=>who.user,sameOrigin:r=>r.headers.get('origin')==='https://nirilihotels.test',limit:async()=>true},
  './auth':{authDb:()=>d1.db},
  './supabase-bridge':{supabaseBridgeConfigured:()=>false,readOperationalRecordPrimary:async()=>null,readOperationalRecordsPrimary:async()=>[],saveOperationalRecordPrimary:async()=>0},
  '../../../lib/guest-catalog':{islandToday:()=>'2026-10-01'},
  '../../../lib/admin-notifications':{emitAdminNotification:async n=>{notices.push(n)}},
 };
 const lib=load('lib/water-sports.ts',stubs);
 const cache=new Map([[resolve(root,'lib/water-sports.ts'),lib]]);
 const pub=load('app/api/public-water-sports/route.ts',stubs,cache),staff=load('app/api/water-sports/route.ts',stubs,cache);
 const req=(method,body)=>new Request('https://nirilihotels.test/api/x',{method,headers:{origin:'https://nirilihotels.test','content-type':'application/json'},body:body&&JSON.stringify(body)});
 const booking=(extra={})=>({token:crypto.randomUUID(),activityId:'jet-ski',date:'2026-10-02',time:'10:00',participants:2,name:'Test Guest',phone:'+960 700 0001',hotel:'Nirili Villa',room:'101',...extra});
 return {lib,pub,staff,req,booking,notices,d1,who};
}

test('guests see the active activities; prices start as "on request"',async()=>{
 const {pub}=setup();
 const d=await (await pub.GET()).json();
 assert.equal(d.today,'2026-10-01');
 assert.deepEqual(d.activities.map(a=>a.id),['jet-ski','parasailing','banana-boat','tube-ride','kayak','paddleboard']);
 assert.ok(d.activities.every(a=>a.cents===0));
});

test('a website booking is stored as New and staff are notified',async()=>{
 const {pub,staff,req,booking,notices}=setup();
 const res=await pub.POST(req('POST',booking()));
 assert.equal(res.status,200);
 const {booking:b}=await res.json();
 assert.match(b.id,/^WS-[A-Z0-9]{6}$/);
 assert.equal(b.status,'New');
 assert.equal(notices[0].type,'water-sports');
 assert.match(notices[0].title,/water sports booking/i);
 const list=await (await staff.GET()).json();
 assert.equal(list.bookings.length,1);
 assert.equal(list.bookings[0].name,'Test Guest');
 assert.equal(list.bookings[0].source,'Website');
});

test('double submits do not create duplicates',async()=>{
 const {pub,staff,req,booking}=setup();
 const token=crypto.randomUUID();
 const a=await (await pub.POST(req('POST',booking({token})))).json(),b=await (await pub.POST(req('POST',booking({token})))).json();
 assert.equal(a.booking.id,b.booking.id);
 assert.equal((await (await staff.GET()).json()).bookings.length,1);
});

test('rejects bad bookings and cross-site posts',async()=>{
 const {pub,req,booking}=setup();
 assert.equal((await pub.POST(req('POST',booking({activityId:'submarine'})))).status,400);
 assert.equal((await pub.POST(req('POST',booking({date:'2026-09-30'})))).status,400);
 assert.equal((await pub.POST(req('POST',booking({phone:'7000001'})))).status,400);
 assert.equal((await pub.POST(req('POST',booking({participants:0})))).status,400);
 const cross=new Request('https://nirilihotels.test/api/x',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'});
 assert.equal((await pub.POST(cross)).status,403);
});

test('staff forward to the partner, record the confirmation and complete the booking',async()=>{
 const {pub,staff,req,booking}=setup();
 await staff.PUT(req('PUT',{revision:0,settings:{partner:{name:'Blue Lagoon Watersports',whatsapp:'+960 777 1234'},activities:setup().lib.defaultSettings().activities}}));
 const {booking:b}=await (await pub.POST(req('POST',booking()))).json();
 let row=(await (await staff.GET()).json()).bookings[0];
 assert.match(row.partnerWhatsappLink,/^https:\/\/wa\.me\/9607771234\?text=/);
 assert.match(decodeURIComponent(row.partnerWhatsappLink),/Ref: WS-/);
 assert.match(row.partnerMessage,/Guest WhatsApp: \+9607000001/);
 const step=async body=>{const r=await staff.PATCH(req('PATCH',{id:b.id,revision:row.revision,...body}));const d=await r.json();if(r.ok)row=d.booking;return {status:r.status,d};};
 assert.equal((await step({action:'complete'})).status,400);
 assert.equal((await step({action:'forward'})).d.booking.status,'Forwarded');
 assert.equal(row.partnerName,'Blue Lagoon Watersports');
 const confirmed=(await step({action:'confirm',partnerReference:'BL-77',time:'14:30'})).d.booking;
 assert.equal(confirmed.status,'Confirmed');assert.equal(confirmed.time,'14:30');assert.equal(confirmed.partnerReference,'BL-77');
 assert.equal((await step({action:'complete'})).d.booking.status,'Completed');
 assert.equal((await step({action:'cancel'})).status,400);
 assert.deepEqual(row.history.map(h=>h.action),['Booked','Forwarded to partner','Confirmed by partner','Completed']);
});

test('a stale screen cannot overwrite a newer change',async()=>{
 const {pub,staff,req,booking}=setup();
 const {booking:b}=await (await pub.POST(req('POST',booking()))).json();
 const row=(await (await staff.GET()).json()).bookings[0];
 assert.equal((await staff.PATCH(req('PATCH',{id:b.id,revision:row.revision,action:'forward'}))).status,200);
 assert.equal((await staff.PATCH(req('PATCH',{id:b.id,revision:row.revision,action:'cancel'}))).status,409);
});

test('only Admin edits settings; reception can manage bookings; other staff cannot',async()=>{
 const s=setup({user:{role:'staff',userId:'S1',permissions:['guesthouse_reception']}});
 assert.equal((await s.staff.GET()).status,200);
 assert.equal((await s.staff.PUT(s.req('PUT',{revision:0,settings:{}}))).status,403);
 s.who.user={role:'staff',userId:'S2',permissions:['kitchen_pos']};
 assert.equal((await s.staff.GET()).status,403);
 s.who.user={role:'guest',userId:'G1',permissions:[]};
 assert.equal((await s.staff.GET()).status,403);
});

test('prices set by Admin give guests an estimate per person or per ride',()=>{
 const {lib}=setup();
 const settings=lib.cleanSettings({partner:{},activities:[{id:'jet-ski',name:'Jet Ski',cents:6000,pricingUnit:'ride',maxPeople:2},{id:'parasailing',name:'Parasailing',cents:5000,pricingUnit:'person',maxPeople:2}]});
 const base={token:crypto.randomUUID(),date:'2026-10-02',name:'A',phone:'+9607000001'};
 assert.equal(lib.buildBooking({...base,activityId:'jet-ski',participants:3},settings,'2026-10-01').quotedCents,12000);
 assert.equal(lib.buildBooking({...base,activityId:'parasailing',participants:3},settings,'2026-10-01').quotedCents,15000);
 assert.throws(()=>lib.cleanSettings({partner:{whatsapp:'12345'}}),/country code/);
});
