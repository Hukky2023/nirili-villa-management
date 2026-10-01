import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
  if(!id.startsWith('.')&&Object.hasOwn(stubs,id))return stubs[id];
  if(id.startsWith('.')&&Object.hasOwn(stubs,name))return stubs[name];
  if(!id.startsWith('.'))return require(id);
  const base=resolve(dirname(file),id);
  return load(existsSync(base+'.ts')?base+'.ts':base,stubs,cache);
 },mod,mod.exports);
 return mod.exports;
}
const sha=s=>createHash('sha256').update(s).digest('hex');

// Pure modules (no storage).
const T=load('lib/transport.ts');
const OP=load('lib/transport-operator.ts');
const BR=load('lib/buggy-rides.ts');
const BO=load('lib/buggy-operator.ts');

const FUTURE='2030-06-03'; // a Monday
const coral={id:'OP-CORAL',name:'Coral Speed'},blue={id:'OP-BLUE',name:'Blue Line'};
function sea(){
 const state=T.normalizeTransport({sailings:[],bookings:[]});
 const big=OP.saveBoat(state,coral,{name:'Coral 1',registration:'A-1',capacity:10});
 const small=OP.saveBoat(state,coral,{name:'Coral 2',capacity:4});
 const sailing=OP.saveOperatorSailing(state,coral,{from:'Velana Airport',to:'Dhiffushi',depart:'10:00',arrive:'11:00',capacity:12,fare:20000,roomFare:2500,days:[1,3,5]});
 const book=(adults=2,extra={})=>{const b=T.createTransfer(state,{token:crypto.randomUUID(),name:'Guest '+adults,phone:'+447700900123',traveller:'Tourist',adults,children:0,infants:0,notes:'',expectedTotal:20000*adults,journeys:[{scheduleId:sailing.id,date:FUTURE,seats:T.freeSeats(state,sailing,FUTURE,adults)}],...extra},'walk-transfer:x');state.bookings.push(b);return b;};
 return {state,big,small,sailing,book};
}

test('operator departures run only on their days and every ticket starts as New',()=>{
 const {state,sailing,book}=sea();
 assert.equal(T.runsOn(sailing,FUTURE),true);
 assert.equal(T.runsOn(sailing,'2030-06-04'),false);
 assert.throws(()=>T.createTransfer(state,{token:'t',name:'A',phone:'+447700900123',traveller:'Tourist',adults:1,children:0,infants:0,notes:'',expectedTotal:20000,journeys:[{scheduleId:sailing.id,date:'2030-06-04',seats:[1]}]},'x'),/does not run/);
 const b=book();
 assert.equal(b.journeys[0].operatorId,coral.id);
 assert.equal(b.journeys[0].operatorStatus,'New');
 assert.equal(b.journeys[0].roomFare,2500);
});

test('accepting puts a ticket on a boat without overfilling it or double-booking the boat',()=>{
 const {state,big,small,sailing,book}=sea();
 const a=book(5),b=book(2);
 assert.throws(()=>OP.acceptTicket(state,coral.id,a.id,0,small.id,'op'),/seats left/);
 OP.acceptTicket(state,coral.id,a.id,0,big.id,'op');
 assert.equal(a.journeys[0].operatorStatus,'Accepted');
 assert.equal(a.journeys[0].boatName,'Coral 1');
 OP.acceptTicket(state,coral.id,b.id,0,small.id,'op');
 // Same boat cannot run an overlapping departure.
 const other=OP.saveOperatorSailing(state,coral,{from:'Dhiffushi',to:'Velana Airport',depart:'10:30',arrive:'11:30',capacity:10,fare:20000});
 const c=T.createTransfer(state,{token:'c',name:'C',phone:'+447700900123',traveller:'Tourist',adults:1,children:0,infants:0,notes:'',expectedTotal:20000,journeys:[{scheduleId:other.id,date:FUTURE,seats:[1]}]},'x');state.bookings.push(c);
 assert.throws(()=>OP.acceptTicket(state,coral.id,c.id,0,big.id,'op'),/already on the 10:00 departure/);
 // Another operator can never touch these tickets.
 assert.throws(()=>OP.acceptTicket(state,blue.id,a.id,0,big.id,'op'),/Ticket not found/);
 assert.deepEqual(a.history.map(h=>h.action),['Accepted by operator']);
});

test('declining frees the seats and closes a walk-in booking; room transfers stay for reception',()=>{
 const {state,sailing,book}=sea();
 const a=book(2);
 assert.throws(()=>OP.declineTicket(state,coral.id,a.id,0,'','op'),/why/);
 OP.declineTicket(state,coral.id,a.id,0,'Engine repair','op');
 assert.equal(a.status,'Cancelled');
 assert.equal(T.bookedPassengers(state,sailing.id,FUTURE),0);
 const r=book(2,{});r.stayId='S1';r.roomCents=5000;
 OP.declineTicket(state,coral.id,r.id,0,'Full','op');
 assert.equal(r.status,'Confirmed');
 assert.equal(r.journeys[0].operatorStatus,'Declined');
});

test('boarding, closing a departure, no-shows and the monthly statement',()=>{
 const {state,big,book}=sea();
 const a=book(2),b=book(1),room=book(2);room.stayId='S1';room.roomCents=5000;
 for(const t of [a,b,room])OP.acceptTicket(state,coral.id,t.id,0,big.id,'op');
 assert.throws(()=>OP.setBoarded(state,coral.id,a.id,0,2,'op','2030-06-02'),/day of departure/);
 OP.setBoarded(state,coral.id,a.id,0,2,'op',FUTURE);
 OP.setBoarded(state,coral.id,room.id,0,2,'op',FUTURE);
 assert.throws(()=>OP.setBoarded(state,coral.id,a.id,0,3,'op',FUTURE),/between 0 and 2/);
 assert.equal(OP.closeDeparture(state,coral.id,a.journeys[0].scheduleId,FUTURE,big.id,'op'),3);
 assert.equal(b.journeys[0].noShow,true);
 assert.equal(a.journeys[0].noShow,false);
 assert.throws(()=>OP.setBoarded(state,coral.id,a.id,0,1,'op',FUTURE),/closed/);
 const st=OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06');
 // Tickets that have not travelled yet are not on the statement.
 const later=book(1);OP.acceptTicket(state,coral.id,later.id,0,big.id,'op');
 assert.equal(OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06','2030-06-01').tickets,3);
 assert.equal(OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06','2030-06-01').upcoming,1);
 assert.equal(st.tickets,3);
 assert.equal(st.noShows,1);
 assert.equal(st.fareMvr,40000);             // the no-show paid nothing, so it is not collected
 assert.equal(st.commissionMvr,4000);        // 10% of the boarded guest-paid ticket only
 assert.equal(st.roomUsd,5000);              // 2 × $25 collected by Nirili on the room bill
 assert.equal(st.payableToOperatorUsd,4500);
});

test('operators cannot change a sold departure or shrink a boat below its passengers',()=>{
 const {state,big,sailing,book}=sea();
 const a=book(6);OP.acceptTicket(state,coral.id,a.id,0,big.id,'op');
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...sailing,depart:'09:00'}),/upcoming tickets/);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...sailing,capacity:5}),/already sold 6/);
 OP.saveOperatorSailing(state,coral,{...sailing,active:false});
 assert.equal(state.sailings.find(s=>s.id===sailing.id).active,false);
 assert.throws(()=>OP.saveBoat(state,coral,{...big,capacity:5}),/already has 6/);
 assert.throws(()=>OP.saveOperatorSailing(state,blue,{...sailing}),/Departure not found/);
});

function land(){
 const state={buggyFleet:[{id:'house',name:'Nirili 1',capacity:4,status:'Available'}],buggyBookings:[],buggyTripHistory:[],stays:[]};
 const owner={id:'OP-RIDE',name:'Island Rides',buggyOnline:true},rival={id:'OP-OTHER',name:'Other',buggyOnline:true};
 const mine=BO.saveOwnerBuggy(state,owner,{name:'IR-1',capacity:4,driver:'Ali'});
 const theirs=BO.saveOwnerBuggy(state,rival,{name:'OT-1',capacity:4});
 const request=(extra={})=>BR.addPublicRide(state,{token:crypto.randomUUID(),name:'Rider',phone:'+9607000001',location:'Harbour',destination:'Beach',quantity:2,notes:'',date:'2030-06-03',pickupTime:'10:00',fareCents:500,createdBy:'test',...extra});
 return {state,owner,rival,mine,theirs,request};
}

test('automatic dispatch uses only Nirili buggies; owner buggies wait for their owner',()=>{
 const {state,request}=land();
 const first=request();
 assert.equal(first.buggyId,'house');
 const second=request();
 assert.equal(second.buggyId,undefined);
 assert.equal(second.buggyStatus,'Requested');
 assert.deepEqual(BO.openRideRequests(state,'2030-06-03').map(r=>r.id),[second.id]);
});

test('the first online owner to accept gets the ride, and only they can drive it',()=>{
 const {state,owner,rival,mine,theirs,request}=land();
 request();const ride=request();
 assert.throws(()=>BO.acceptRide(state,{...owner,buggyOnline:false},ride.id,mine.id),/Go online/);
 assert.throws(()=>BO.acceptRide(state,owner,ride.id,theirs.id),/one of your buggies/);
 BO.acceptRide(state,owner,ride.id,mine.id);
 assert.equal(ride.operatorId,owner.id);
 assert.equal(mine.status,'Assigned');
 assert.throws(()=>BO.acceptRide(state,rival,ride.id,theirs.id),/already taken/);
 assert.throws(()=>BO.advanceRide(state,rival,ride.id,'on-the-way'),/not found/);
 assert.throws(()=>BO.advanceRide(state,owner,ride.id,'arrived'),/Start the pickup/);
 for(const step of ['on-the-way','arrived','boarded','complete'])BO.advanceRide(state,owner,ride.id,step);
 assert.equal(ride.buggyStatus,'Completed');
 assert.equal(mine.status,'Available');
 const st=BO.buggyStatement(state,{id:owner.id,commissionPercent:20},'2030-06');
 assert.equal(st.rides,1);
 assert.equal(st.collectedByOwner,500);
 assert.equal(st.commissionOwed,100);
});

test('an owner can hand a ride back to the queue before pickup',()=>{
 const {state,owner,mine,request}=land();
 request();const ride=request();
 BO.acceptRide(state,owner,ride.id,mine.id);
 BO.advanceRide(state,owner,ride.id,'release');
 assert.equal(ride.buggyId,undefined);
 assert.equal(ride.buggyStatus,'Requested');
 assert.equal(mine.status,'Available');
});

// ---- APIs with in-memory storage.
function fakeD1(){
 const rows=new Map();
 const run=(sql,args)=>{
  if(sql.startsWith('INSERT OR IGNORE')){const [key,payload,by]=args;if(rows.has(key))return {meta:{changes:0}};rows.set(key,{key,payload,revision:1,updated_by:by});return {meta:{changes:1}};}
  if(sql.startsWith('UPDATE')){const [payload,by,key,rev]=args,row=rows.get(key);if(!row||row.revision!==rev)return {meta:{changes:0}};rows.set(key,{key,payload,revision:rev+1,updated_by:by});return {meta:{changes:1}};}
  throw Error('unexpected SQL '+sql);
 };
 return {rows,db:{prepare:sql=>({bind:(...args)=>({run:async()=>run(sql,args),first:async()=>rows.get(args[0])||null,all:async()=>({results:[...rows.values()].filter(r=>r.key.startsWith(String(args[0]).replace(/%$/,'')))})})})}};
}
function apis(){
 const d1=fakeD1(),notices=[],who={staff:{role:'admin',userId:'U1',displayName:'Admin',permissions:[]}};
 const sea={state:T.normalizeTransport({sailings:[],bookings:[]}),revision:1};
 const hotel={state:{stays:[],orders:[],buggyFleet:[],buggyBookings:[],buggyTripHistory:[],buggySettings:{guestRideFareCents:500}},revision:1};
 const stubs={
  auth:{authDb:()=>d1.db,digest:async s=>sha(s),hashPassword:async(p,salt='salt'+Math.random())=>({hash:sha(salt+p),salt}),verifyPassword:async(p,salt,e)=>sha(salt+p)===e,validPassword:p=>typeof p==='string'&&p.length>=8,limit:async()=>true,sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,currentUser:async()=>who.staff,hasPermission:(u,p)=>!!u&&(u.role==='admin'||u.permissions?.includes(p))},
  'supabase-bridge':{supabaseBridgeConfigured:()=>false,readOperationalRecordPrimary:async()=>null,readOperationalRecordsPrimary:async()=>[],saveOperationalRecordPrimary:async()=>0},
  'transport-store':{loadTransport:async()=>({state:structuredClone(sea.state),revision:sea.revision}),saveTransport:async(state,revision)=>{if(revision!==sea.revision)return 0;sea.state=structuredClone(state);return ++sea.revision;},
   updateTransport:async(by,change)=>{const state=structuredClone(sea.state);const result=await change(state);sea.state=state;sea.revision++;return {result,state,revision:sea.revision};}},
  stays:{loadStays:async()=>({state:structuredClone(hotel.state),revision:hotel.revision})},
  'stay-login':{saveStayAccess:async(state,revision)=>{if(revision!==hotel.revision)return false;hotel.state=structuredClone(state);hotel.revision++;return true;}},
  'guest-catalog':{islandToday:()=>'2030-06-03',validDate:d=>/^\d{4}-\d{2}-\d{2}$/.test(d)},
  'admin-notifications':{emitAdminNotification:async n=>{notices.push(n);}},
  'web-push':{sendGuestPushForRide:async()=>{}},
  'next/headers':{cookies:async()=>({get:()=>({value:'a'.repeat(64)})})},
  'tab-session':{sessionCookieName:async n=>n},
 };
 const cache=new Map();
 const ops=load('lib/travel-operators.ts',stubs,cache);
 const session=load('app/api/operator-portal/session/route.ts',stubs,cache);
 const boats=load('app/api/operator-portal/speedboats/route.ts',stubs,cache);
 const buggy=load('app/api/operator-portal/buggy/route.ts',stubs,cache);
 const admin=load('app/api/travel-operators/route.ts',stubs,cache);
 const walkin=load('app/api/walkin-transfers/route.ts',stubs,cache);
 const ORIGIN='https://operators.nirilihotels.test';
 const req=(path,method,body,cookie='')=>new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json',...(cookie?{cookie}:{})},body:body&&JSON.stringify(body)});
 const create=async extra=>{const r=await admin.POST(req('/api/travel-operators','POST',{name:'Coral Speed',phone:'+960 777 1111',services:['boat'],commissionPercent:10,username:'coralspeed',password:'coral-pass-1',...extra}));assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return (await r.json()).operator;};
 const signIn=async(username,password)=>{const r=await session.POST(req('/api/operator-portal/session','POST',{username,password}));return {status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 return {sea,hotel,notices,who,admin,session,boats,buggy,walkin,req,create,signIn,ops};
}

test('admin creates operators; operators sign in to their own portal only',async()=>{
 const s=apis();
 const op=await s.create();
 assert.equal(op.passwordHash,undefined);
 assert.equal((await s.admin.POST(s.req('/api/travel-operators','POST',{name:'X',phone:'+9607771111',services:['boat'],username:'coralspeed',password:'whatever1'}))).status,400);
 assert.equal((await s.admin.POST(s.req('/api/travel-operators','POST',{name:'X',phone:'+9607771111',services:[],username:'other',password:'whatever1'}))).status,400);
 assert.equal((await s.signIn('coralspeed','wrong-pass')).status,401);
 const {status,cookie}=await s.signIn('coralspeed','coral-pass-1');
 assert.equal(status,200);
 assert.match(cookie,/^nirili_operator_session=[a-f0-9]{64}$/);
 assert.equal((await s.boats.GET(s.req('/api/operator-portal/speedboats','GET',null,cookie))).status,200);
 // A speedboat-only operator has no buggy portal; staff cannot use the operator API.
 assert.equal((await s.buggy.GET(s.req('/api/operator-portal/buggy','GET',null,cookie))).status,401);
 assert.equal((await s.boats.GET(s.req('/api/operator-portal/speedboats','GET'))).status,401);
 s.who.staff={role:'staff',userId:'S1',permissions:['guesthouse_reception']};
 assert.equal((await s.admin.GET(s.req('/api/travel-operators','GET'))).status,403);
});

test('through the API an operator publishes, accepts, boards and sees guest contacts only after accepting',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{...body,viewDate:FUTURE},cookie));
 let d=await (await post({action:'save-boat',boat:{name:'Coral 1',capacity:10}})).json();
 const boatId=d.boats[0].id;
 d=await (await post({action:'save-sailing',sailing:{from:'Velana Airport',to:'Dhiffushi',depart:'10:00',arrive:'11:00',capacity:12,fare:20000}})).json();
 const sailing=d.sailings[0];
 assert.equal(sailing.operatorName,'Coral Speed');
 // A guest books on the public site.
 const b=T.createTransfer(s.sea.state,{token:'g1',name:'Guest',phone:'+447700900123',traveller:'Tourist',adults:2,children:0,infants:0,notes:'',expectedTotal:40000,journeys:[{scheduleId:sailing.id,date:FUTURE,seats:[1,2]}]},'walk-transfer:x');
 s.sea.state.bookings.push(b);
 d=await (await s.boats.GET(s.req('/api/operator-portal/speedboats?date='+FUTURE,'GET',null,cookie))).json();
 assert.equal(d.inbox.length,1);
 assert.equal(d.inbox[0].phone,'');
 d=await (await post({action:'accept',bookingId:b.id,index:0,boatId})).json();
 assert.equal(d.inbox.length,0);
 const ticket=d.day[0].tickets[0];
 assert.equal(ticket.status,'Accepted');
 assert.equal(ticket.phone,'+447700900123');
 // Another operator sees nothing and cannot act on it.
 await s.create({name:'Blue Line',username:'blueline',phone:'+9607772222'});
 const other=(await s.signIn('blueline','coral-pass-1')).cookie;
 const theirs=await (await s.boats.GET(s.req('/api/operator-portal/speedboats?date='+FUTURE,'GET',null,other))).json();
 assert.equal(theirs.day.length,0);
 assert.equal((await s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{action:'decline',bookingId:b.id,index:0,reason:'x'},other))).status,400);
});

test('a decline notifies Nirili so the guest can be rebooked',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',body,cookie));
 const d=await (await post({action:'save-sailing',sailing:{from:'Dhiffushi',to:'Velana Airport',depart:'07:00',arrive:'08:00',capacity:12,fare:20000}})).json();
 const b=T.createTransfer(s.sea.state,{token:'g2',name:'Guest',phone:'+447700900123',traveller:'Tourist',adults:1,children:0,infants:0,notes:'',expectedTotal:20000,journeys:[{scheduleId:d.sailings[0].id,date:FUTURE,seats:[1]}]},'walk-transfer:x');
 s.sea.state.bookings.push(b);
 assert.equal((await post({action:'decline',bookingId:b.id,index:0,reason:'Weather warning'})).status,200);
 assert.equal(s.notices[0].title,'Speedboat ticket declined');
 assert.match(s.notices[0].detail,/Weather warning/);
});

test('buggy owners go online, see waiting rides without phone numbers, and take them',async()=>{
 const s=apis();
 await s.create({name:'Island Rides',username:'islandrides',services:['buggy'],commissionPercent:15});
 const {cookie}=await s.signIn('islandrides','coral-pass-1');
 const post=body=>s.buggy.POST(s.req('/api/operator-portal/buggy','POST',body,cookie));
 let d=await (await post({action:'save-buggy',buggy:{name:'IR-1',capacity:4,driver:'Ali'}})).json();
 const buggyId=d.buggies[0].id;
 BR.addPublicRide(s.hotel.state,{token:crypto.randomUUID(),name:'Rider',phone:'+9607000001',location:'Harbour',destination:'Beach',quantity:2,notes:'',date:'2030-06-03',pickupTime:'10:00',fareCents:500,createdBy:'test'});
 d=await (await s.buggy.GET(s.req('/api/operator-portal/buggy','GET',null,cookie))).json();
 assert.equal(d.open.length,0,'offline owners see no requests');
 d=await (await post({action:'online',online:true})).json();
 assert.equal(d.online,true);
 assert.equal(d.open.length,1);
 assert.equal(d.open[0].phone,'');
 d=await (await post({action:'accept',rideId:d.open[0].id,buggyId})).json();
 assert.equal(d.active.length,1);
 assert.equal(d.active[0].phone,'+9607000001');
 d=await (await post({action:'advance',rideId:d.active[0].id,step:'on-the-way'})).json();
 assert.equal(d.active[0].status,'Driver on the way');
});

test('staff cannot edit or dispatch an owner’s buggy from buggy management',()=>{
 const src=readFileSync(resolve(root,'app/api/buggy-management/route.ts'),'utf8');
 assert.match(src,/The owner manages it and accepts rides in the operator portal/);
});

test('a guest with an out-of-date page still books: the server picks free seats from the latest data',async()=>{
 const s=apis();
 s.sea.state.sailings.push({id:'S1',boat:'Altec',operatorId:'OP-A',operatorName:'Altec',from:'Velana Airport',to:'Dhiffushi',depart:'16:30',arrive:'17:15',capacity:3,fare:46000,active:true});
 const ask=(body)=>s.walkin.POST(new Request('https://transfers.nirilihotels.test/api/walkin-transfers',{method:'POST',headers:{origin:'https://transfers.nirilihotels.test','content-type':'application/json'},body:JSON.stringify({action:'book',payment:'later',traveller:'Tourist',children:0,infants:0,notes:'',...body})}));
 // Both pages were loaded at revision 1 and both chose seats 1–2.
 const first=await ask({revision:1,token:crypto.randomUUID(),name:'First',phone:'+447700900123',adults:2,expectedTotal:92000,journeys:[{scheduleId:'S1',date:FUTURE,seats:[1,2]}]});
 assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
 const second=await ask({revision:1,token:crypto.randomUUID(),name:'Second',phone:'+447700900123',adults:1,expectedTotal:46000,journeys:[{scheduleId:'S1',date:FUTURE,seats:[1]}]});
 assert.equal(second.status,200,JSON.stringify(await second.clone().json()));
 assert.deepEqual(s.sea.state.bookings.map(b=>b.journeys[0].seats),[[1,2],[3]]);
 // A real lack of seats is still refused.
 const third=await ask({revision:1,token:crypto.randomUUID(),name:'Third',phone:'+447700900123',adults:1,expectedTotal:46000,journeys:[{scheduleId:'S1',date:FUTURE,seats:[1]}]});
 assert.equal(third.status,400);
 assert.match((await third.json()).error,/Not enough seats/);
});
