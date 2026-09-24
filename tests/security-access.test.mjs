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
