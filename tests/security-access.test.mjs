import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const result=ts.transpileModule(source,{fileName:path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 const module={exports:{}};
 new Function('require','module','exports',result.outputText)(name=>{if(!(name in mocks))throw Error('Unexpected import '+name);return mocks[name]},module,module.exports);
 return module.exports;
}
const staff={id:'staff-test',username:'crew-test',name:'Test crew',role:'staff',permissions:'["crew_location"]',active:1};
function sessionHarness({configured=true,primary=null,failure=false}={}){
 let mirrorReads=0,mirrorWrites=0;
 const db={prepare(sql){return {bind(){return this},async first(){if(sql.includes('JOIN account_sessions')){mirrorReads++;return staff;}return {key:'already-applied'}},async run(){mirrorWrites++;return {meta:{changes:1}}}}}};
 const api=load('lib/auth.ts',{
  './tab-session':{sessionCookieName:async()=>'session',currentTab:async()=>''},
  'cloudflare:workers':{env:{DB:db}},'next/headers':{cookies:async()=>({get:()=>({value:'test-token'})})},
  './supabase-bridge':{supabaseBridgeConfigured:()=>configured,readLegacySessionAccount:async()=>{if(failure)throw Error('offline');return primary},upsertLegacySession:async()=>{if(failure)throw Error('offline');return configured}}
 });
 return {api,reads:()=>mirrorReads,writes:()=>mirrorWrites};
}
test('revoked primary sessions cannot be resurrected from a stale D1 mirror',async()=>{
 const h=sessionHarness();assert.equal(await h.api.currentUser(),null);assert.equal(h.reads(),0);
});
test('primary session lookup outage denies access rather than using stale roles',async()=>{
 const h=sessionHarness({failure:true});assert.equal(await h.api.currentUser(),null);assert.equal(h.reads(),0);
});
test('valid primary staff session retains its current permissions',async()=>{
 const h=sessionHarness({primary:staff});assert.deepEqual((await h.api.currentUser()).permissions,['crew_location']);assert.equal(h.reads(),0);
});
test('guest sessions also fail closed when revoked or unavailable',async()=>{
 for(const failure of [false,true]){const h=sessionHarness({failure});assert.equal(await h.api.currentGuestUser(),null);assert.equal(h.reads(),0)}
});
test('D1-only deployments retain their supported login path',async()=>{
 const h=sessionHarness({configured:false});assert.equal((await h.api.currentUser()).userId,staff.id);assert.equal(h.reads(),1);
});
test('primary session creation failure cannot issue a mirror-only login',async()=>{
 const h=sessionHarness({failure:true});await assert.rejects(h.api.issueSession(staff.id));await assert.rejects(h.api.issueGuestSession('guest-test'));assert.equal(h.writes(),0);
});
function loginHarness(outcome){
 let fallback=0,issued=0;
 const api=load('app/api/auth/login/route.ts',{
  '../../../../lib/transport-access':{transportPortalAllowed:()=>true,isTransportAgent:()=>false},
  '../../../../lib/tab-session':{withTab:x=>x},
  '../../../../lib/pos-access':{restaurantOnly:()=>false,canPOS:()=>false,canKitchen:()=>false,canTakePayment:()=>false},
  '../../../../lib/auth':{sameOrigin:()=>true,limit:async()=>true,roomLoginActive:async()=>true,publicUser:r=>({userId:r.id,role:r.role,permissions:['crew_location']}),issueSession:async()=>{issued++;return 'cookie'},bootstrap:async()=>{fallback++},authDb:()=>{fallback++;throw Error('unexpected mirror')},verifyPassword:async()=>true},
  '../../../../lib/supabase-bridge':{supabaseBridgeConfigured:()=>true,authenticateSupabaseEmployee:async()=>{if(outcome instanceof Error)throw outcome;return outcome}}
 });
 return {api,stats:()=>({fallback,issued})};
}
const loginRequest=()=>new Request('https://example.test/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'crew-test',password:'test-password',portal:'direct'})});
test('rejected primary password never falls back or rewrites primary credentials',async()=>{
 const h=loginHarness(null);assert.equal((await h.api.POST(loginRequest())).status,401);assert.deepEqual(h.stats(),{fallback:0,issued:0});
});
test('primary authentication failure does not activate the legacy login fallback',async()=>{
 const h=loginHarness(new Error('offline'));assert.equal((await h.api.POST(loginRequest())).status,503);assert.deepEqual(h.stats(),{fallback:0,issued:0});
});
test('valid primary login still issues a session',async()=>{
 const h=loginHarness({account:staff});assert.equal((await h.api.POST(loginRequest())).status,200);assert.deepEqual(h.stats(),{fallback:0,issued:1});
});
function accountHarness({failure=false,role='admin'}={}){
 const events=[];
 const db={prepare(){return {bind(){return this},async first(){return {id:staff.id,role:'staff',active:1}}}},async batch(){events.push('D1');return [{meta:{changes:1}}]}};
 const api=load('app/api/user-account/route.ts',{
  '../../../lib/auth':{currentUser:async()=>({role,userId:'admin-test',username:'admin-test'}),sameOrigin:()=>true,authDb:()=>db},
  '../../../lib/account-history':{preserveAccountHistoryStatement:async()=>({})},
  '../../../lib/supabase-bridge':{deactivateSupabaseAccount:async()=>{events.push('disable-primary');if(failure)throw Error('offline')},deleteLegacySessionsForAccount:async()=>events.push('revoke-primary-sessions')}
 });return {api,events};
}
const accountRequest=method=>new Request('https://example.test/api/user-account',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({id:staff.id})});
for(const method of ['POST','DELETE']){
 test(method+' account action revokes primary access before changing the mirror',async()=>{
  const h=accountHarness();assert.equal((await h.api[method](accountRequest(method))).status,200);assert.deepEqual(h.events,['disable-primary','revoke-primary-sessions','D1']);
 });
 test(method+' account action reports failure when primary revocation fails',async()=>{
  const h=accountHarness({failure:true});assert.equal((await h.api[method](accountRequest(method))).status,503);assert.deepEqual(h.events,['disable-primary']);
 });
}
test('staff cannot invoke admin account management',async()=>{
 const h=accountHarness({role:'staff'});assert.equal((await h.api.POST(accountRequest('POST'))).status,403);assert.deepEqual(h.events,[]);
});
test('crew, driver, and excursion-only accounts cannot read room folios',async()=>{
 for(const permissions of [['crew_location'],['buggy_driver'],['excursions_manager'],[]]){
  const actor={role:'staff',permissions};
  const api=load('app/api/folio/route.ts',{
   '../../../lib/pos-access':{restaurantOnly:()=>false},'../../../lib/discounts':{},
   '../../../lib/auth':{currentUser:async()=>actor,hasPermission:(u,p)=>u?.role==='admin'||u?.permissions?.includes(p),authDb:()=>{throw Error('must not read data')}},
   '../../../lib/stays':{},'../../../lib/excursion-billing':{},'../../../lib/transfer-billing':{},'../../../lib/supabase-bridge':{}
  });
  assert.equal((await api.GET(new Request('https://example.test/api/folio?room=101'))).status,403);
 }
});

const permissionAuth={hasPermission:(u,p)=>u?.role==='admin'||u?.permissions?.includes(p)};
const projection=load('lib/staff-data.ts',{'./auth':permissionAuth});
const payload={revision:7,rooms:[{number:'101',capacity:3,status:'Occupied',privateNote:'private'}],requests:[{manageToken:'secret'}],bookingChanges:[{private:'private'}],stays:[{id:'NV-1',guest:'Test',room:'101',whatsapp:'+9600000000',manageToken:'secret',passport:'private',folio:{balance:99}}],orders:[{id:'exc',kind:'excursion',guest:'Test',cents:2500},{id:'food',kind:'food',cents:1000},{id:'transfer',kind:'transfer'}],catalog:[{kind:'excursion'},{kind:'food'},{kind:'transfer'}]};
test('excursion staff retain booking and contact workflow without hotel tokens or unrelated bills',()=>{
 const d=projection.staffData({role:'staff',permissions:['excursions_manager']},payload);
 assert.equal(d.stays[0].whatsapp,'+9600000000');assert.equal(d.stays[0].room,'101');assert.equal(d.orders[0].cents,2500);
 assert.deepEqual(d.orders.map(x=>x.id),['exc']);assert.equal(JSON.stringify(d).includes('secret'),false);assert.equal(JSON.stringify(d).includes('private'),false);assert.equal(d.stays[0].folio,undefined);
 assert.equal(payload.stays[0].manageToken,'secret');
});
test('transfer staff see transfers, while billing retains balances without bearer tokens',()=>{
 const d=projection.staffData({role:'staff',permissions:['edit_transfers']},payload);assert.deepEqual(d.orders.map(x=>x.id),['transfer']);
 const bills=projection.staffData({role:'staff',permissions:['edit_bills']},payload);assert.equal(bills.stays[0].folio.balance,99);assert.equal(bills.stays[0].manageToken,undefined);
});
test('admin and reception retain complete booking management workflow',()=>{
 for(const user of [{role:'admin',permissions:[]},{role:'staff',permissions:['guesthouse_reception']}])assert.deepEqual(projection.staffData(user,payload),payload);
});
test('unassigned staff receive no service orders',()=>assert.deepEqual(projection.staffData({role:'staff',permissions:[]},payload).orders,[]));
const push=load('lib/web-push.ts',{'./auth':{}});
test('push destinations allow browser providers and reject private hosts and deceptive URLs',()=>{
 for(const u of ['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test','https://wns2-by3p.notify.windows.com/test'])assert.equal(push.validPushEndpoint(u),true,u);
 for(const u of ['https://127.0.0.1/test','https://localhost/test','https://169.254.169.254/test','https://fcm.googleapis.com.evil.example/test','https://evil.example/?host=fcm.googleapis.com','https://user:pass@fcm.googleapis.com/test','http://fcm.googleapis.com/test','https://fcm.googleapis.com:8443/test'])assert.equal(push.validPushEndpoint(u),false,u);
});
const bridge=load('lib/supabase-bridge.ts',{'cloudflare:workers':{env:{}},'./pos-room-billing':{}});
test('unmapped primary accounts retain password login without accepting wrong or inactive credentials',async()=>{
 const salt='test-salt',key=await crypto.subtle.importKey('raw',new TextEncoder().encode('valid-test-password'),'PBKDF2',false,['deriveBits']);
 const hash=Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256)).toString('hex');
 const row={salt,password_hash:hash,active:true};
 assert.equal(await bridge.verifyPrimaryPassword(row,'valid-test-password'),true);assert.equal(await bridge.verifyPrimaryPassword(row,'wrong-password'),false);assert.equal(await bridge.verifyPrimaryPassword({...row,active:false},'valid-test-password'),false);
});
test('staff credential storage deletes recoverable passwords instead of encrypting them',async()=>{
 let sql='',args=[];const c=load('lib/credential-store.ts',{'cloudflare:workers':{env:{}},'./auth':{authDb:()=>({prepare:q=>(sql=q,{bind:(...a)=>(args=a,{})})})},'./credential-crypto':{sealCredential:()=>{throw Error('Must not encrypt staff password')}},'./supabase-bridge':{}});
 await c.credentialStatement('staff-test','hash','staff-password','admin');assert.match(sql,/DELETE/);assert.deepEqual(args,['credential:staff-test']);assert.equal(await c.readCredential('staff-test','hash'),null);
});
test('bulk backfill inserts missing accounts without overwriting primary security state',async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(url,init)=>{sent={url,init};return new Response('',{status:200});};
 try{
  const api=load('lib/supabase-bridge.ts',{'cloudflare:workers':{env:{SUPABASE_SECRET_KEY:'test-placeholder'}},'./pos-room-billing':{}});
  await api.mirrorLegacyAccounts([{id:'test',username:'test',name:'test',role:'staff',active:1}]);
  assert.equal(new Headers(sent.init.headers).get('Prefer'),'resolution=ignore-duplicates,return=minimal');
 }finally{globalThis.fetch=original;}
});
test('logout reports failed primary revocation instead of falsely reporting success',async()=>{
 const route=load('app/api/auth/logout/route.ts',{
  '../../../../lib/tab-session':{sessionCookieName:async()=>'session',currentTab:async()=>'',withTab:x=>x},
  'next/headers':{cookies:async()=>({get:()=>({value:'test-token'})})},
  '../../../../lib/auth':{sameOrigin:()=>true,digest:async()=> 'hash'},
  '../../../../lib/supabase-bridge':{deleteLegacySession:async()=>{throw Error('offline')}}
 });
 const response=await route.POST(new Request('https://example.invalid/api/auth/logout',{method:'POST'}));assert.equal(response.status,503);assert.equal(response.headers.get('Set-Cookie'),null);
});
