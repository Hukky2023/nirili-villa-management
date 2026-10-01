import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
function load(path,stubs={},cache=new Map()){
 const file=resolve(root,path);
 if(cache.has(file))return cache.get(file);
 const mod={exports:{}};cache.set(file,mod.exports);
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',source)(id=>{
  const name=basename(id).replace(/\.ts$/,'');
  if(id.startsWith('.')&&Object.hasOwn(stubs,name))return stubs[name];
  if(!id.startsWith('.'))return require(id);
  const base=resolve(dirname(file),id);
  return load(existsSync(base+'.ts')?base+'.ts':base,stubs,cache);
 },mod,mod.exports);
 return mod.exports;
}

const T=c=>c.repeat(48);
const STATE={
 requests:[{id:'REQ-AB12CD34',guest:'Rania',email:'Rania@Example.com',checkIn:'2026-11-01',checkOut:'2026-11-04',manageToken:T('a')}],
 stays:[{id:'NV-2001',requestId:'REQ-77777777',guest:'Omar',email:'omar@example.com',checkIn:'2026-12-01',checkOut:'2026-12-03',manageToken:T('b')}],
 orders:[
  {kind:'excursion',source:'External guest website',id:'EXC-11112222',name:'Dolphin Watching',date:'2026-10-10',guest:'Lena',email:'lena@example.com',manageToken:T('c')},
  {kind:'excursion',source:'External guest website',id:'EXC-33334444',packageGroupId:'PKG-55556666',packageName:'Special Package',date:'2026-10-11',guest:'Lena',email:'lena@example.com',manageToken:T('d')},
  {kind:'excursion',source:'External guest website',id:'EXC-33337777',packageGroupId:'PKG-55556666',packageName:'Special Package',date:'2026-10-12',guest:'Lena',email:'lena@example.com',manageToken:T('d')},
  {kind:'excursion',source:'Agent portal',id:'EXC-99990000',name:'Sandbank Trip',date:'2026-10-10',guest:'Agent guest',email:'lena@example.com',manageToken:''},
 ],
};

function setup(){
 const emails=[],limits={ok:true};
 const stubs={
  auth:{sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,limit:async()=>limits.ok},
  'supabase-bridge':{readOperationalRecordPrimary:async()=>({payload:structuredClone(STATE),revision:1})},
  stays:{loadStays:async()=>({state:structuredClone(STATE),revision:1})},
  'booking-email':{sendManageLinkEmail:async m=>{emails.push(m);return {sent:true};}},
 };
 const lookup=load('lib/booking-lookup.ts');
 const route=load('app/api/public-booking/find/route.ts',stubs);
 const ask=(body,origin='https://stay.nirilihotels.test')=>route.POST(new Request('https://stay.nirilihotels.test/api/public-booking/find',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 return {lookup,route,ask,emails,limits};
}

test('finds room bookings by request or stay number, ignoring case and spaces',()=>{
 const {lookup}=setup();
 const a=lookup.findManageLinks(STATE,' req-ab12cd34 ','rania@example.com ');
 assert.equal(a.length,1);
 assert.equal(a[0].kind,'stay');
 assert.match(a[0].url,/^https:\/\/stay\.nirilihotels\.com\/book\/manage#a{48}$/);
 assert.equal(lookup.findManageLinks(STATE,'NV-2001','omar@example.com').length,1);
 assert.equal(lookup.findManageLinks(STATE,'REQ-77777777','omar@example.com').length,1);
});

test('finds tours-website excursions and Special Packages, one link per package',()=>{
 const {lookup}=setup();
 const exc=lookup.findManageLinks(STATE,'EXC-11112222','lena@example.com');
 assert.equal(exc.length,1);
 assert.match(exc[0].url,/^https:\/\/tours\.nirilihotels\.com\/book\/excursions\/manage#c{48}$/);
 const pkg=lookup.findManageLinks(STATE,'PKG-55556666','lena@example.com');
 assert.equal(pkg.length,1);
 assert.equal(pkg[0].reference,'PKG-55556666');
});

test('a reference alone, or with the wrong email, finds nothing; agent bookings are not exposed',()=>{
 const {lookup}=setup();
 assert.equal(lookup.findManageLinks(STATE,'REQ-AB12CD34','someone@else.com').length,0);
 assert.equal(lookup.findManageLinks(STATE,'REQ-AB12CD34','').length,0);
 assert.equal(lookup.findManageLinks(STATE,'EXC-99990000','lena@example.com').length,0);
});

test('the link is emailed only to the address on the booking, and the reply never reveals a match',async()=>{
 const {ask,emails}=setup();
 const hit=await ask({reference:'REQ-AB12CD34',email:'rania@example.com'});
 const miss=await ask({reference:'REQ-AB12CD34',email:'attacker@example.com'});
 assert.equal(hit.status,200);assert.equal(miss.status,200);
 assert.deepEqual(await hit.json(),await miss.json());
 assert.equal(emails.length,1);
 assert.equal(emails[0].email,'rania@example.com');
 assert.equal(emails[0].links.length,1);
});

test('rejects bad input, cross-site posts and too many attempts',async()=>{
 const {ask,limits,emails}=setup();
 assert.equal((await ask({reference:'x',email:'rania@example.com'})).status,400);
 assert.equal((await ask({reference:'REQ-AB12CD34',email:'nope'})).status,400);
 assert.equal((await ask({reference:'REQ-AB12CD34',email:'rania@example.com'},'https://evil.example')).status,403);
 limits.ok=false;
 assert.equal((await ask({reference:'REQ-AB12CD34',email:'rania@example.com'})).status,429);
 assert.equal(emails.length,0);
});
