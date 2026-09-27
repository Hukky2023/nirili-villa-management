import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
function load(path,stubs={},cache=new Map()){
 const file=resolve(root,path);
 if(cache.has(file))return cache.get(file);
 const module={exports:{}};cache.set(file,module.exports);
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',source)(id=>{
  if(Object.hasOwn(stubs,id))return stubs[id];
  if(id.endsWith('.css'))return {};
  if(id.startsWith('.'))return load(resolve(dirname(file),id)+(id.endsWith('.ts')?'':'.ts'),stubs,cache);
  return require(id);
 },module,module.exports);
 return module.exports;
}
const {updateRoomInventory}=load('lib/rooms.ts');
const {changePropertyCatalog,propertyCatalog,transferServices}=load('lib/property-catalog.ts');
const {nightly}=load('lib/guest-catalog.ts');
const {scheduleCatalogPrice}=load('lib/excursion-catalog-pricing.ts');
const {youtubeEmbed,cleanYouTubeUrl}=load('lib/youtube.ts');
const {chooseAutoAssignmentCandidate}=load('lib/excursion-operations.ts');

test('admin room additions, edits and removal survive inventory reload without changing historical stays',()=>{
 const state={rooms:[],stays:[{id:'OLD',room:'101',status:'Checked Out',base:6000}],orders:[]};
 updateRoomInventory(state);assert.equal(state.rooms.length,14);
 changePropertyCatalog(state,{action:'save-room',room:{number:'401',type:'Garden Room',bed:'Twin beds',capacity:2}},'Admin');
 updateRoomInventory(state);assert.equal(state.rooms.length,15);assert.equal(state.rooms.find(r=>r.number==='401').bed,'Twin beds');
 changePropertyCatalog(state,{action:'save-room',originalNumber:'401',room:{number:'401',type:'Garden View',bed:'Double bed',capacity:2}},'Admin');
 updateRoomInventory(state);assert.equal(state.rooms.find(r=>r.number==='401').type,'Garden View');
 changePropertyCatalog(state,{action:'remove-room',number:'101'},'Admin');
 updateRoomInventory(state);assert.equal(state.rooms.some(r=>r.number==='101'),false);assert.equal(state.stays[0].base,6000);assert.equal(state.stays[0].room,'101');
});
test('active reservations block room removal and unsafe capacity reductions',()=>{
 const state={rooms:[],stays:[{room:'101',status:'Confirmed',pax:3}]};updateRoomInventory(state);
 assert.throws(()=>changePropertyCatalog(state,{action:'remove-room',number:'101'},'Admin'),/active bookings/);
 assert.throws(()=>changePropertyCatalog(state,{action:'save-room',originalNumber:'101',room:{number:'101',type:'Room',bed:'Bed',capacity:2}},'Admin'),/reducing/);
 assert.throws(()=>changePropertyCatalog(state,{action:'save-room',room:{number:'101',type:'Room',bed:'Bed',capacity:3}},'Admin'),/already exists/);
});
test('room prices update new quotes including zero prices and preserve confirmed charges',()=>{
 const state={rooms:[],stays:[{base:12000,rateCents:6000,status:'Confirmed'}]};
 const rates={'Bed & Breakfast':[0,8500,9900],'Half Board':[9000,10000,11000],'Full Board':[12000,15000,18000]};
 changePropertyCatalog(state,{action:'save-rates',rates},'Admin');
 assert.equal(nightly('Bed & Breakfast',1,state.roomRates),0);assert.equal(nightly('Full Board',3,state.roomRates),18000);
 assert.equal(state.stays[0].base,12000);assert.equal(state.stays[0].rateCents,6000);
 assert.throws(()=>changePropertyCatalog(state,{action:'save-rates',rates:{...rates,'Full Board':[-1,0,0]}},'Admin'),/nightly rate/);
});
test('transfer price edits and removals affect the guest catalog while existing orders remain intact',()=>{
 const state={rooms:[],stays:[],orders:[{id:'OLD',name:'Airport → Dhiffushi',cents:7000}]};
 changePropertyCatalog(state,{action:'save-service',id:'airport-arrival',service:{name:'Airport pickup',cents:3000,detail:'Arrival'}},'Admin');
 assert.equal(transferServices(state).find(i=>i.id==='airport-arrival').cents,3000);
 for(const item of [...transferServices(state)])changePropertyCatalog(state,{action:'remove-service',id:item.id},'Admin');
 assert.deepEqual(transferServices(state),[]);assert.equal(state.orders[0].cents,7000);
});
test('timetable uses current catalog rates and blocks removed activities without treating zero as missing',()=>{
 const menu=[{id:'turtle',name:'Turtle encounter',scheduleName:'Turtle Snorkeling',category:'single',cents:4500,active:true},{id:'coral',name:'Coral Garden',scheduleName:'Coral Garden Snorkeling',category:'single',cents:0,active:true}];
 assert.equal(scheduleCatalogPrice({name:'Turtle Snorkeling',priceCents:2500},menu),4500);
 assert.equal(scheduleCatalogPrice({name:'Turtle Snorkeling + Coral Garden Snorkeling'},menu),4500);
 menu[0].active=false;
 assert.equal(scheduleCatalogPrice({name:'Turtle Snorkeling',priceCents:2500},menu),null);
 assert.equal(scheduleCatalogPrice({name:'Turtle Snorkeling + Coral Garden Snorkeling'},menu),null);
 assert.equal(scheduleCatalogPrice({name:'Coral Garden Snorkeling'},menu),0);
});
test('renamed excursions keep matching their operating trips',()=>{
 const chosen=chooseAutoAssignmentCandidate({id:'O',kind:'excursion',name:'Ocean discovery',scheduleName:'Turtle Snorkeling',date:'2027-01-01',quantity:2},[{id:'S',date:'2027-01-01',name:'Turtle Snorkeling + Coral Garden Snorkeling',time:'08:00',status:'Open',capacity:10}],[]);
 assert.equal(chosen.schedule.id,'S');
});
test('video URLs accept YouTube formats and reject other sites and unsafe protocols',()=>{
 const id='dQw4w9WgXcQ';
 for(const url of ['https://youtu.be/'+id,'https://www.youtube.com/watch?v='+id,'https://youtube.com/shorts/'+id])assert.equal(youtubeEmbed(url),'https://www.youtube-nocookie.com/embed/'+id);
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.example/watch?v='+id,'https://youtube.com/@channel','https://example.com/video'])assert.throws(()=>cleanYouTubeUrl(url),/valid YouTube/);
 assert.equal(cleanYouTubeUrl(''),'');
});

function apiHarness(role='admin'){
 let state={rooms:[],stays:[]},revision=5,writes=0,conflict=false;
 const user=role?{role,username:'Admin',userId:'U'}:null;
 const route=load('app/api/property-catalog/route.ts',{
  '../../../lib/auth':{currentUser:async()=>user,sameOrigin:r=>r.headers.get('origin')==='https://management.test'},
  '../../../lib/stays':{stayKey:'hotel-stays-v1',loadStays:async()=>({state:structuredClone(state),revision})},
  '../../../lib/supabase-bridge':{readOperationalRecordPrimary:async()=>({payload:structuredClone(state),revision})},
  '../../../lib/stay-login':{saveStayAccess:async(next,expected)=>{if(conflict||revision!==expected)return false;state=next;revision++;writes++;return true;}},
  '../../../lib/channels':{autoPushBookingComAvailability:async()=>{}}
 });
 const request=(body,origin='https://management.test')=>new Request('https://management.test/api/property-catalog',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {route,request,get writes(){return writes},set conflict(value){conflict=value}};
}
test('catalog API rejects guests, staff, anonymous and cross-origin writes',async()=>{
 for(const role of ['guest','staff',null]){const h=apiHarness(role);assert.equal((await h.route.GET()).status,403);assert.equal((await h.route.POST(h.request({revision:5}))).status,403);assert.equal(h.writes,0);}
 const h=apiHarness();assert.equal((await h.route.POST(h.request({revision:5},'https://other.test'))).status,403);assert.equal(h.writes,0);
});
test('admin saves are persistent and stale revisions never overwrite another change',async()=>{
 const h=apiHarness(),body={action:'save-room',revision:5,room:{number:'401',type:'Garden',bed:'Double',capacity:2}};
 assert.equal((await h.route.POST(h.request(body))).status,200);
 assert.equal((await (await h.route.GET()).json()).rooms.some(room=>room.number==='401'),true);
 assert.equal((await h.route.POST(h.request(body))).status,409);assert.equal(h.writes,1);
 h.conflict=true;assert.equal((await h.route.POST(h.request({...body,revision:6,room:{...body.room,number:'402'}}))).status,409);assert.equal(h.writes,1);
});

test('main website renders the saved video and description without prices or management instructions',async()=>{
 const page=load('app/hotel/excursions/[id]/page.tsx',{
  '../../../../lib/excursion-menu':{loadExcursionMenu:async()=>[{id:'turtle',name:'Turtle Encounter',group:'Single Excursions',detail:'Short text',longDetail:'Saved description',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ',cents:4500,galleryUrls:[]}]},
  '../../../website-chat':{default:()=>null,__esModule:true},
  'next/navigation':{notFound:()=>{throw Error('404')}}
 }).default;
 const {renderToStaticMarkup}=require('react-dom/server');
 const html=renderToStaticMarkup(await page({params:Promise.resolve({id:'turtle'})}));
 assert.match(html,/youtube-nocookie.com\/embed\/dQw4w9WgXcQ/);assert.match(html,/Saved description/);assert.match(html,/booking.nirilihotels.com/);
 assert.doesNotMatch(html,/\$45|management system|detail-price/);
 assert.ok(html.indexOf('<iframe')<html.indexOf('Saved description'));
 await assert.rejects(()=>page({params:Promise.resolve({id:'removed'})}),/404/);
});

test('excursion edits persist custom names, details, prices and video; removal survives reload',async()=>{
 const rows=new Map();let user={role:'admin',userId:'U',permissions:[]};
 const auth={
  currentUser:async()=>user,
  hasPermission:(actor,permission)=>actor?.role==='admin'||actor?.permissions?.includes(permission),
  sameOrigin:()=>true,
  authDb:()=>({prepare:()=>({bind:()=>({first:async()=>null,run:async()=>({meta:{changes:1}}),all:async()=>({results:[]})})})})
 };
 const bridge={readOperationalRecordsPrimary:async()=>[...rows.values()],readOperationalRecordPrimary:async key=>rows.get(key)||null,saveOperationalRecordPrimary:async(key,payload,expected)=>{const current=rows.get(key)?.revision||0;if(current!==expected)return 0;rows.set(key,{key,payload,revision:current+1});return current+1;}};
 const menu=load('lib/excursion-menu.ts',{'./auth':auth,'./supabase-bridge':bridge});
 const api=load('app/api/excursion-menu/route.ts',{'../../../lib/auth':auth,'../../../lib/supabase-bridge':bridge,'../../../lib/excursion-menu':menu});
 const request=body=>new Request('https://management.test/api/excursion-menu',{method:'PUT',body:JSON.stringify(body)});
 const original=(await menu.loadExcursionMenu()).find(item=>item.id==='shark-turtle');
 const changed={...original,name:'Reef Adventure',detail:'Custom trip description',longDetail:'Full website details',cents:12500,youtubeUrl:'https://youtu.be/dQw4w9WgXcQ',revision:0};
 assert.equal((await api.PUT(request(changed))).status,200);
 const saved=(await menu.loadExcursionMenu()).find(item=>item.id===original.id);
 assert.equal(saved.name,'Reef Adventure');assert.equal(saved.detail,'Custom trip description');assert.equal(saved.cents,12500);assert.equal(saved.scheduleName,original.name);assert.equal(saved.youtubeUrl,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal((await api.PUT(request(changed))).status,409);
 user={role:'staff',userId:'S',permissions:['edit_excursions']};
 assert.equal((await api.PUT(request({...saved,active:false}))).status,403);
 user={role:'admin',userId:'U',permissions:[]};
 assert.equal((await api.PUT(request({...saved,active:false}))).status,200);
 assert.equal((await menu.loadExcursionMenu()).some(item=>item.id===saved.id),false);
 assert.equal(scheduleCatalogPrice({name:original.name},await menu.loadExcursionMenu(true)),null);
});

test('hotel domain serves public pages and photo reads while blocking catalog edits and photo uploads',()=>{
 const {proxy}=load('proxy.ts');
 function visit(path,method='GET'){return proxy(new Request('https://nirilihotels.com'+path,{method,headers:{host:'nirilihotels.com'}}));}
 assert.equal(visit('/hotel/excursions/turtle').headers.get('x-middleware-next'),'1');
 assert.equal(visit('/api/menu-images/12345678-1234-1234-1234-123456789012').headers.get('x-middleware-next'),'1');
 assert.equal(visit('/api/menu-images/12345678-1234-1234-1234-123456789012','POST').status,404);
 assert.equal(visit('/api/menu-images','POST').status,404);
 assert.equal(visit('/api/property-catalog').status,404);
 assert.equal(visit('/api/excursion-menu','PUT').status,404);
});
