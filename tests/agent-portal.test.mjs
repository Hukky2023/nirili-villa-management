import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
// Loads TypeScript sources; any import whose module name (e.g. "stays") is stubbed gets the stub.
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

const sha=s=>createHash('sha256').update(s).digest('hex');
function fakeD1(){
 const rows=new Map();
 const run=(sql,args)=>{
  if(sql.startsWith('INSERT OR IGNORE')){const [key,payload,by]=args;if(rows.has(key))return {meta:{changes:0}};rows.set(key,{key,payload,revision:1,updated_by:by});return {meta:{changes:1}};}
  if(sql.startsWith('UPDATE')){const [payload,by,key,rev]=args,row=rows.get(key);if(!row||row.revision!==rev)return {meta:{changes:0}};rows.set(key,{key,payload,revision:rev+1,updated_by:by});return {meta:{changes:1}};}
  if(sql.startsWith('DELETE FROM operation_records WHERE key=?')){rows.delete(args[0]);return {meta:{changes:1}};}
  throw Error('unexpected SQL '+sql);
 };
 const db={prepare:sql=>({bind:(...args)=>({
  run:async()=>run(sql,args),
  first:async()=>rows.get(args[0])||null,
  all:async()=>({results:[...rows.values()].filter(r=>r.key.startsWith(String(args[0]).replace(/%$/,'')))}),
 })})};
 return {db,rows};
}

const TODAY='2026-10-01',TRIP='2026-10-03',ORIGIN='https://partners.nirilihotels.test';
const MENU=[
 {id:'sandbank',kind:'excursion',name:'Sandbank Trip',cents:2500,pricingUnit:'guest',active:true},
];
function setup({staff={role:'admin',userId:'U1',displayName:'Admin',username:'admin',permissions:[]}}={}){
 const d1=fakeD1(),notices=[],emails=[],who={staff};
 const hotel={state:{orders:[],vessels:[],crew:[]},revision:1};
 const addTrip=(date,{id='T1',capacity=10,name='Sandbank Trip',time='09:00'}={})=>d1.rows.set('excursion-schedule:'+date+':'+id,{key:'excursion-schedule:'+date+':'+id,payload:JSON.stringify({id,date,time,endTime:'12:00',name,status:'Open',capacity,vesselId:'V1',crewIds:[]}),revision:1});
 const auth={
  authDb:()=>d1.db,digest:async s=>sha(s),
  hashPassword:async(p,salt='salt'+Math.random())=>({hash:sha(salt+p),salt}),
  verifyPassword:async(p,salt,expected)=>sha(salt+p)===expected,
  validPassword:p=>typeof p==='string'&&p.length>=8&&p.length<=128,
  limit:async()=>true,sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,
  currentUser:async()=>who.staff,
  hasPermission:(u,p)=>!!u&&(u.role==='admin'||(u.role==='staff'&&u.permissions.includes(p))),
 };
 const stubs={
  auth,
  'supabase-bridge':{supabaseBridgeConfigured:()=>false,readOperationalRecordPrimary:async()=>null,readOperationalRecordsPrimary:async()=>[],saveOperationalRecordPrimary:async()=>0},
  'guest-catalog':{islandToday:()=>TODAY,validDate:d=>/^\d{4}-\d{2}-\d{2}$/.test(d),excursionDeparturePassed:()=>false},
  stays:{loadStays:async()=>({state:structuredClone(hotel.state),revision:hotel.revision})},
  'stay-login':{saveStayAccess:async(state,revision)=>{if(revision!==hotel.revision)return false;hotel.state=structuredClone(state);hotel.revision++;return true;}},
  'excursion-default-schedule':{ensureStandardDailyExcursions:async()=>{}},
  'excursion-menu':{loadExcursionMenu:async()=>MENU},
  'excursion-email':{sendExternalExcursionBookedEmail:async m=>{emails.push(m);return {sent:true};}},
  'admin-notifications':{emitAdminNotification:async n=>{notices.push(n);}},
  'excursion-workflow':{excursionResources:()=>({vessels:[{id:'V1',name:'Nirili One'}],crew:[]})},
  'transport-store':{loadTransport:async()=>({state:{sailings:[],bookings:[],boats:[],charterRates:[],charters:[]},revision:1}),updateTransport:async(by,change)=>{const state={sailings:[],bookings:[],boats:[],charterRates:[],charters:[]};return {result:await change(state),state,revision:2};}},
 };
 const cache=new Map();
 const lib=load('lib/excursion-agents.ts',stubs,cache);
 const portal=load('app/api/agent-portal/bookings/route.ts',stubs,cache);
 const session=load('app/api/partner-portal/session/route.ts',stubs,cache);
 const admin=load('app/api/partners/route.ts',stubs,cache);
 const pub=load('app/api/public-excursions/route.ts',stubs,cache);
 const req=(path,method,body,cookie='')=>new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json',...(cookie?{cookie}:{})},body:body&&JSON.stringify(body)});
 const createAgent=async(extra={})=>{
  // Partner accounts take excursionDiscountPercent; older tests say discountPercent.
  const {discountPercent=10,...rest}=extra;
  const r=await admin.POST(req('/api/partners','POST',{name:'Island Breeze',contactName:'Ali',phone:'+960 777 1111',pickup:'Island Breeze GH',permissions:['excursions'],excursionDiscountPercent:discountPercent,username:'islandbreeze',password:'breeze-pass-1',...rest}));
  assert.equal(r.status,201,JSON.stringify(await r.clone().json()));
  return (await r.json()).partner;
 };
 const signIn=async(username='islandbreeze',password='breeze-pass-1')=>{
  const r=await session.POST(req('/api/partner-portal/session','POST',{username,password}));
  return {status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
 };
 const book=(cookie,extra={})=>portal.POST(req('/api/agent-portal/bookings','POST',{token:crypto.randomUUID(),menuItemId:'sandbank',date:TRIP,guestNames:['Anna Lee','Ben Lee'],guestCategories:['adult','adult'],agentReference:'IB-204',...extra},cookie));
 return {lib,portal,session,admin,pub,req,hotel,addTrip,createAgent,signIn,book,notices,emails,who,d1};
}

test('admin creates a partner; usernames are unique and passwords never leave the server',async()=>{
 const s=setup();
 const agent=await s.createAgent();
 assert.match(agent.id,/^PT-[A-Z0-9]{8}$/);
 assert.equal(agent.passwordHash,undefined);
 const dup=await s.admin.POST(s.req('/api/partners','POST',{name:'Other GH',permissions:['excursions'],username:'islandbreeze',password:'another-pass'}));
 assert.equal(dup.status,400);
 assert.match((await dup.json()).error,/already in use/);
 const list=await (await s.admin.GET(s.req('/api/partners','GET'))).json();
 assert.equal(list.partners.length,1);
 assert.ok(!JSON.stringify(list).includes('passwordHash')&&!JSON.stringify(list).includes('"salt"'));
});

test('only Admin creates partners; reception and agents cannot reach the admin API',async()=>{
 const s=setup({staff:{role:'staff',userId:'S1',permissions:['guesthouse_reception']}});
 assert.equal((await s.admin.GET(s.req('/api/partners','GET'))).status,403);
 assert.equal((await s.admin.POST(s.req('/api/partners','POST',{name:'X',username:'xxx',password:'xxxxxxxx'}))).status,403);
 s.who.staff={role:'staff',userId:'S2',permissions:['excursions_manager']};
 assert.equal((await s.admin.GET(s.req('/api/partners','GET'))).status,200);
 assert.equal((await s.admin.POST(s.req('/api/partners','POST',{name:'X',username:'xxx',password:'xxxxxxxx'}))).status,403);
 s.who.staff=null;
 assert.equal((await s.admin.GET(s.req('/api/partners','GET'))).status,403);
});

test('agents sign in with their own login; wrong passwords and signed-out requests are refused',async()=>{
 const s=setup();await s.createAgent();
 assert.equal((await s.signIn('islandbreeze','wrong-password')).status,401);
 assert.equal((await s.signIn('nobody','breeze-pass-1')).status,401);
 const {status,cookie}=await s.signIn();
 assert.equal(status,200);
 assert.match(cookie,/^nirili_partner_session=[a-f0-9]{64}$/);
 const me=await (await s.session.GET(s.req('/api/partner-portal/session','GET',null,cookie))).json();
 assert.equal(me.partner.name,'Island Breeze');
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET'))).status,401);
 assert.equal((await s.book('')).status,401);
});

test('an agent booking lands on a trip with free seats at the partner rate, with no guest email or manage link',async()=>{
 const s=setup();await s.createAgent();s.addTrip(TRIP);
 const {cookie}=await s.signIn();
 const r=await s.book(cookie);
 const d=await r.json();
 assert.equal(r.status,201,JSON.stringify(d));
 assert.equal(d.booking.status,'Confirmed');
 assert.equal(d.booking.time,'09:00');
 assert.equal(d.booking.manageUrl,'');
 const order=s.hotel.state.orders[0];
 assert.equal(order.source,'Agent portal');
 assert.equal(order.agentName,'Island Breeze');
 assert.equal(order.agentReference,'IB-204');
 assert.equal(order.publicQuotedCents,5000);
 assert.equal(order.quotedCents,4500);
 assert.equal(order.cents,4500);
 assert.equal(order.hotel,'Island Breeze GH');
 assert.equal(order.manageToken,'');
 assert.equal(s.emails.length,0);
 assert.equal(s.notices[0].title,'New agent excursion booking');
 assert.match(s.notices[0].detail,/^Island Breeze · Anna Lee/);
 const mine=await (await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,cookie))).json();
 assert.equal(mine.bookings.length,1);
 assert.equal(mine.bookings[0].status,'Confirmed');
 assert.equal(mine.bookings[0].netCents,4500);
 assert.equal(mine.items[0].netCents,2250);
});

test('double submits do not create duplicate agent bookings',async()=>{
 const s=setup();await s.createAgent();s.addTrip(TRIP);
 const {cookie}=await s.signIn(),token=crypto.randomUUID();
 const a=await (await s.book(cookie,{token})).json(),b=await (await s.book(cookie,{token})).json();
 assert.equal(a.booking.id,b.booking.id);
 assert.equal(s.hotel.state.orders.length,1);
});

test('partners set to staff approval always wait in Pending, even with free seats',async()=>{
 const s=setup();await s.createAgent({autoConfirm:false});s.addTrip(TRIP);
 const {cookie}=await s.signIn();
 const d=await (await s.book(cookie)).json();
 assert.equal(d.booking.status,'Pending');
 assert.equal(s.hotel.state.orders[0].approvalStatus,'Pending');
 assert.equal(s.hotel.state.orders[0].quotedCents,4500);
});

test('a full trip sends the agent booking to staff instead of overbooking',async()=>{
 const s=setup();await s.createAgent();s.addTrip(TRIP,{capacity:1});
 const {cookie}=await s.signIn();
 assert.equal((await (await s.book(cookie)).json()).booking.status,'Pending');
});

test('agents see and cancel only their own bookings',async()=>{
 const s=setup();await s.createAgent();await s.createAgent({name:'Coral View',username:'coralview',password:'coral-pass-1'});
 const a=(await s.signIn()).cookie,b=(await s.signIn('coralview','coral-pass-1')).cookie;
 const ref=(await (await s.book(a)).json()).booking.id;
 assert.equal((await (await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,b))).json()).bookings.length,0);
 const r=await s.portal.PATCH(s.req('/api/agent-portal/bookings','PATCH',{action:'cancel',ref},b));
 assert.equal(r.status,400);
 assert.equal(s.hotel.state.orders[0].status!=='Cancelled',true);
});

test('pending bookings cancel at once; confirmed ones become a request staff decide on',async()=>{
 const s=setup();await s.createAgent();
 const {cookie}=await s.signIn();
 const pending=(await (await s.book(cookie)).json()).booking.id;
 let r=await (await s.portal.PATCH(s.req('/api/agent-portal/bookings','PATCH',{action:'cancel',ref:pending,reason:'Guest left early'},cookie))).json();
 assert.equal(r.mode,'cancelled');
 assert.equal(r.bookings.find(b=>b.ref===pending).status,'Cancelled');

 s.addTrip(TRIP);
 const confirmed=(await (await s.book(cookie)).json()).booking.id;
 r=await (await s.portal.PATCH(s.req('/api/agent-portal/bookings','PATCH',{action:'cancel',ref:confirmed,reason:'Weather worry'},cookie))).json();
 assert.equal(r.mode,'requested');
 assert.equal(r.bookings.find(b=>b.ref===confirmed).cancelRequested,true);
 const order=()=>s.hotel.state.orders.find(o=>o.id===confirmed);
 assert.equal(order().approvalStatus,'Approved');
 assert.equal((await s.portal.PATCH(s.req('/api/agent-portal/bookings','PATCH',{action:'cancel',ref:confirmed},cookie))).status,400);

 const list=await (await s.admin.GET(s.req('/api/partners','GET'))).json();
 assert.deepEqual(list.partners[0].excursionStatement.cancelRequests,[confirmed]);
 assert.equal((await s.admin.PATCH(s.req('/api/partners','PATCH',{action:'resolve-cancel',ref:confirmed,approve:true}))).status,200);
 assert.equal(order().status,'Cancelled');
 assert.equal(order().cents,0);
 assert.equal(order().agentCancelRequest,undefined);
});

test('pausing a partner or changing the password ends their sessions immediately',async()=>{
 const s=setup();const agent=await s.createAgent();
 let {cookie}=await s.signIn();
 const rev=async()=>(await (await s.admin.GET(s.req('/api/partners','GET'))).json()).partners[0].revision;
 assert.equal((await s.admin.PATCH(s.req('/api/partners','PATCH',{id:agent.id,revision:await rev(),password:'new-pass-123'}))).status,200);
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,cookie))).status,401);
 assert.equal((await s.signIn()).status,401);
 cookie=(await s.signIn('islandbreeze','new-pass-123')).cookie;
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,cookie))).status,200);
 assert.equal((await s.admin.PATCH(s.req('/api/partners','PATCH',{id:agent.id,revision:await rev(),active:false}))).status,200);
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,cookie))).status,401);
 assert.equal((await s.signIn('islandbreeze','new-pass-123')).status,401);
 // A stale screen cannot overwrite a newer change.
 assert.equal((await s.admin.PATCH(s.req('/api/partners','PATCH',{id:agent.id,revision:1,active:true}))).status,409);
});

test('signing out revokes the session',async()=>{
 const s=setup();await s.createAgent();
 const {cookie}=await s.signIn();
 await s.session.DELETE(s.req('/api/partner-portal/session','DELETE',null,cookie));
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,cookie))).status,401);
});

test('the monthly statement totals what each partner owes and has paid for confirmed trips',async()=>{
 const s=setup();await s.createAgent();s.addTrip(TRIP);
 const {cookie}=await s.signIn();
 await s.book(cookie);
 await s.book(cookie,{guestNames:['Cara','Dan','Eve'],guestCategories:['adult','adult','child']});
 s.hotel.state.orders[0].excursionPayments=[{cents:4500}];
 const d=await (await s.admin.GET(s.req('/api/excursion-agents?month=2026-10','GET'))).json();
 const st=d.partners[0].excursionStatement;
 assert.equal(st.bookings,2);
 assert.equal(st.guests,5);
 assert.equal(st.owedCents,4500+5625);
 assert.equal(st.paidCents,4500);
 assert.equal(st.balanceCents,5625);
 const other=await (await s.admin.GET(s.req('/api/excursion-agents?month=2026-11','GET'))).json();
 assert.equal(other.partners[0].excursionStatement.owedCents,0);
});

test('agent bookings validate input; guest contact is optional but must be valid',async()=>{
 const s=setup();await s.createAgent();
 const {cookie}=await s.signIn();
 assert.equal((await s.book(cookie,{date:'2026-09-30'})).status,400);
 assert.equal((await s.book(cookie,{menuItemId:'submarine'})).status,400);
 assert.equal((await s.book(cookie,{phone:'7771234'})).status,400);
 assert.equal((await s.book(cookie,{guestNames:['Anna',''],guestCategories:['adult','adult']})).status,400);
 assert.equal((await s.book(cookie,{phone:'+447700900123'})).status,201);
 const cross=new Request(ORIGIN+'/api/agent-portal/bookings',{method:'POST',headers:{origin:'https://evil.example',cookie},body:'{}'});
 assert.equal((await s.portal.POST(cross)).status,403);
});

test('the public tours website books exactly as before',async()=>{
 const s=setup();s.addTrip(TRIP);
 const r=await s.pub.POST(s.req('/api/public-excursions','POST',{token:crypto.randomUUID(),menuItemId:'sandbank',date:TRIP,guest:'Guest One',phone:'+447700900123',email:'one@example.com',hotel:'Some GH',guestNames:['Guest One'],guestCategories:['adult']}));
 const d=await r.json();
 assert.equal(r.status,201,JSON.stringify(d));
 assert.equal(d.booking.status,'Confirmed');
 assert.match(d.booking.manageUrl,/manage/);
 const order=s.hotel.state.orders[0];
 assert.equal(order.source,'External guest website');
 assert.equal(order.quotedCents,2500);
 assert.equal(order.agentId,undefined);
 assert.equal(s.emails.length,1);
 assert.equal(s.notices[0].title,'New excursion booking');
 // The public site still requires guest email and WhatsApp.
 assert.equal((await s.pub.POST(s.req('/api/public-excursions','POST',{token:crypto.randomUUID(),menuItemId:'sandbank',date:TRIP,guest:'G',hotel:'H',guestNames:['G'],guestCategories:['adult']}))).status,400);
});

test('a partner only reaches the parts of the portal Nirili enabled for them',async()=>{
 const s=setup();s.addTrip(TRIP);
 await s.createAgent({username:'boatsonly',name:'Coral Speed',permissions:['boats'],password:'boats-pass-1'});
 const boats=(await s.signIn('boatsonly','boats-pass-1')).cookie;
 assert.match(boats,/^nirili_partner_session=/);
 // Running trips does not allow booking excursions for guests.
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,boats))).status,401);
 assert.equal((await s.book(boats)).status,401);
 const me=await (await s.session.GET(s.req('/api/partner-portal/session','GET',null,boats))).json();
 assert.deepEqual(me.partner.permissions,['boats']);
 await s.createAgent();
 const ok=(await s.signIn()).cookie;
 assert.equal((await s.portal.GET(s.req('/api/agent-portal/bookings','GET',null,ok))).status,200);
 assert.equal((await s.book(ok)).status,201);
});

test('partner details are validated: something to do, and a WhatsApp number for operators',async()=>{
 const s=setup();
 const post=body=>s.admin.POST(s.req('/api/partners','POST',{name:'X',username:'xpartner',password:'x-pass-123',...body}));
 assert.match((await (await post({permissions:[]})).json()).error,/Tick at least one/);
 assert.match((await (await post({permissions:['boats'],phone:''})).json()).error,/WhatsApp number for a partner who runs trips/);
 assert.match((await (await post({permissions:['excursions'],excursionDiscountPercent:80})).json()).error,/between 0% and 50%/);
 assert.equal((await post({permissions:['rooms','excursions'],roomDiscountPercent:15})).status,201);
});

test('the clean-up removes the old separate test logins and keeps the new partners',async()=>{
 const s=setup();
 const partner=await s.createAgent();
 for(const key of ['excursion-agent:AG-1','excursion-agent-username:old','travel-operator:OP-1','travel-operator-session:abc','tour-operator:TO-1'])s.d1.rows.set(key,{key,payload:'{}',revision:1});
 s.d1.rows.set('travel-crew:CREW-OLD',{key:'travel-crew:CREW-OLD',payload:JSON.stringify({id:'CREW-OLD',operatorId:'OP-1'}),revision:1});
 s.d1.rows.set('travel-crew:CREW-NEW',{key:'travel-crew:CREW-NEW',payload:JSON.stringify({id:'CREW-NEW',operatorId:partner.id}),revision:1});
 // Staff other than Admin cannot run it.
 s.who.staff={role:'staff',userId:'S2',permissions:['excursions_manager']};
 assert.equal((await s.admin.POST(s.req('/api/partners','POST',{action:'purge-legacy'}))).status,403);
 s.who.staff={role:'admin',userId:'U1',permissions:[]};
 const r=await s.admin.POST(s.req('/api/partners','POST',{action:'purge-legacy'}));
 assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
 assert.equal((await r.json()).accounts,6);
 assert.deepEqual([...s.d1.rows.keys()].filter(k=>/^(excursion-agent|travel-operator|tour-operator|travel-crew)/.test(k)),['travel-crew:CREW-NEW']);
 assert.ok(s.d1.rows.has('partner:'+partner.id));
 assert.equal((await s.signIn()).status,200);
});
