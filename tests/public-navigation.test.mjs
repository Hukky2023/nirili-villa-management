import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
function load(path,cache=new Map()){
 const file=resolve(root,path);
 if(cache.has(file))return cache.get(file);
 const mod={exports:{}};cache.set(file,mod.exports);
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',source)(id=>{
  if(!id.startsWith('.'))return require(id);
  const base=resolve(dirname(file),id);
  return load(existsSync(base+'.ts')?base+'.ts':base,cache);
 },mod,mod.exports);
 return mod.exports;
}
const {proxy}=load('proxy.ts');

function visit(host,path,method='GET'){
 return proxy(new Request('https://'+host+path,{method,headers:{host}}));
}
const rewrite=r=>r.headers.get('x-middleware-rewrite')&&new URL(r.headers.get('x-middleware-rewrite')).pathname;
const location=r=>r.headers.get('location');
const passes=r=>r.headers.get('x-middleware-next')==='1';

test('each service subdomain serves its own page at the root',()=>{
 assert.equal(rewrite(visit('stay.nirilihotels.com','/')),'/book');
 assert.equal(rewrite(visit('tours.nirilihotels.com','/')),'/book/excursions');
 assert.equal(rewrite(visit('dine.nirilihotels.com','/')),'/book/restaurant');
 assert.equal(rewrite(visit('transfers.nirilihotels.com','/')),'/book/transfers');
 assert.equal(rewrite(visit('my.nirilihotels.com','/')),'/stay');
 assert.equal(rewrite(visit('watersports.nirilihotels.com','/')),'/book/water-sports');
});

test('service sub-pages and their APIs stay on the service host',()=>{
 assert.ok(passes(visit('tours.nirilihotels.com','/book/excursions/manage')));
 assert.ok(passes(visit('tours.nirilihotels.com','/book/excursions/details/turtle')));
 assert.ok(passes(visit('tours.nirilihotels.com','/api/public-excursions','POST')));
 assert.ok(passes(visit('dine.nirilihotels.com','/api/restaurant-guest')));
 assert.ok(passes(visit('transfers.nirilihotels.com','/api/walkin-transfers','POST')));
 assert.ok(passes(visit('my.nirilihotels.com','/api/guest-auth/login','POST')));
 assert.ok(passes(visit('watersports.nirilihotels.com','/api/public-water-sports','POST')));
 assert.equal(visit('watersports.nirilihotels.com','/api/water-sports').status,404);
 assert.ok(passes(visit('stay.nirilihotels.com','/book/manage')));
 assert.equal(visit('tours.nirilihotels.com','/api/property-catalog').status,404);
 assert.equal(visit('my.nirilihotels.com','/api/dashboard').status,404);
});

test('a service home and other services’ paths redirect to their canonical address',()=>{
 assert.equal(location(visit('tours.nirilihotels.com','/book/excursions?excursion=turtle')),'https://tours.nirilihotels.com/?excursion=turtle');
 assert.equal(location(visit('my.nirilihotels.com','/stay?mode=setup')),'https://my.nirilihotels.com/?mode=setup');
 assert.equal(location(visit('tours.nirilihotels.com','/book/restaurant')),'https://dine.nirilihotels.com/');
 assert.equal(location(visit('stay.nirilihotels.com','/book/excursions')),'https://tours.nirilihotels.com/');
 assert.equal(location(visit('stay.nirilihotels.com','/book')),'https://stay.nirilihotels.com/');
 assert.equal(location(visit('dine.nirilihotels.com','/book')),'https://stay.nirilihotels.com/');
});

test('ride serves the public Nirili Ride page and its API',()=>{
 assert.equal(rewrite(visit('ride.nirilihotels.com','/')),'/book/ride');
 assert.ok(passes(visit('ride.nirilihotels.com','/api/public-ride','POST')));
 assert.equal(location(visit('ride.nirilihotels.com','/book/ride')),'https://ride.nirilihotels.com/');
 assert.equal(location(visit('ride.nirilihotels.com','/stay')),'https://my.nirilihotels.com/');
 assert.equal(visit('ride.nirilihotels.com','/api/buggy-management').status,404);
});

test('old booking.nirilihotels.com links are forwarded to the new subdomains',()=>{
 const forwarded=(path,to)=>{const r=visit('booking.nirilihotels.com',path);assert.equal(r.status,308,path);assert.equal(location(r),to,path);};
 forwarded('/','https://stay.nirilihotels.com/');
 forwarded('/book','https://stay.nirilihotels.com/');
 forwarded('/book/manage','https://stay.nirilihotels.com/book/manage');
 forwarded('/book/excursions','https://tours.nirilihotels.com/');
 forwarded('/book/excursions?excursion=shark','https://tours.nirilihotels.com/?excursion=shark');
 forwarded('/book/excursions/manage','https://tours.nirilihotels.com/book/excursions/manage');
 forwarded('/book/restaurant','https://dine.nirilihotels.com/');
 forwarded('/book/transfers','https://transfers.nirilihotels.com/');
 forwarded('/home','https://nirilihotels.com/');
 forwarded('/hotel','https://nirilihotels.com/');
 // Guests signed in on the old host keep their portal session and push notifications.
 assert.ok(passes(visit('booking.nirilihotels.com','/stay')));
 assert.ok(passes(visit('booking.nirilihotels.com','/api/guest-services')));
});

test('friendly alias subdomains forward to the guest sites, never the staff app',()=>{
 const alias=(host,path,to)=>{const r=visit(host,path);assert.equal(r.status,308,host+path);assert.equal(location(r),to,host+path);};
 alias('excursions.nirilihotels.com','/','https://tours.nirilihotels.com/');
 alias('excursions.nirilihotels.com','/book/excursions/manage','https://tours.nirilihotels.com/book/excursions/manage');
 alias('restaurant.nirilihotels.com','/','https://dine.nirilihotels.com/');
 alias('travels.nirilihotels.com','/','https://nirilihotels.com/#travel');
});

test('the main domain offers short links to every service',()=>{
 const short=(path,to)=>{const r=visit('nirilihotels.com',path);assert.equal(r.status,302,path);assert.equal(location(r),to,path);};
 short('/tours','https://tours.nirilihotels.com/');
 short('/Menu/','https://dine.nirilihotels.com/');
 short('/stay','https://stay.nirilihotels.com/');
 short('/transfers','https://transfers.nirilihotels.com/');
 short('/ride','https://ride.nirilihotels.com/');
 short('/my','https://my.nirilihotels.com/');
 short('/watersports','https://watersports.nirilihotels.com/');
 assert.equal(rewrite(visit('nirilihotels.com','/')),'/hotel');
 assert.equal(location(visit('nirilihotels.com','/hotel/excursions')),'https://tours.nirilihotels.com/');
 assert.equal(location(visit('nirilihotels.com','/hotel/excursions/turtle')),'https://tours.nirilihotels.com/book/excursions/details/turtle');
 assert.ok(passes(visit('tours.nirilihotels.com','/book/excursions/details/turtle')));
 assert.equal(visit('nirilihotels.com','/api/dashboard').status,404);
});

test('agents serves the partner portal; its APIs stay on that host only',()=>{
 assert.equal(rewrite(visit('agents.nirilihotels.com','/')),'/book/agents');
 assert.ok(passes(visit('agents.nirilihotels.com','/api/agent-portal/session','POST')));
 assert.ok(passes(visit('agents.nirilihotels.com','/api/agent-portal/bookings')));
 assert.equal(visit('tours.nirilihotels.com','/api/agent-portal/bookings').status,404);
 assert.equal(visit('agents.nirilihotels.com','/api/excursion-agents').status,404);
 assert.equal(visit('agents.nirilihotels.com','/api/dashboard').status,404);
 assert.equal(location(visit('agents.nirilihotels.com','/book/agents')),'https://agents.nirilihotels.com/');
 assert.equal(location(visit('nirilihotels.com','/partners')),'https://agents.nirilihotels.com/');
 assert.equal(visit('agents.nirilihotels.com','/').headers.get('cache-control'),'private, no-store, max-age=0');
});

test('find-my-booking is served on the guest sites, not the main hotel domain',()=>{
 assert.ok(passes(visit('stay.nirilihotels.com','/api/public-booking/find','POST')));
 assert.ok(passes(visit('tours.nirilihotels.com','/api/public-booking/find','POST')));
 assert.equal(visit('nirilihotels.com','/api/public-booking/find','POST').status,404);
});
