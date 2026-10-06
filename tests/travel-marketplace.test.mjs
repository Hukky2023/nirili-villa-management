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
const CH=load('lib/transport-charter.ts');
const BR=load('lib/buggy-rides.ts');
const BO=load('lib/buggy-operator.ts');

const FUTURE='2030-06-03'; // a Monday
const coral={id:'OP-CORAL',name:'Coral Speed'},blue={id:'OP-BLUE',name:'Blue Line'};
const L=(n,per=4)=>T.defaultLayout(n,per);
// Single-hop input as older screens sent it (no stops or fare table).
const flat=({stops,fares,...x})=>x;
function sea(){
 const state=T.normalizeTransport({sailings:[],bookings:[]});
 const big=OP.saveBoat(state,coral,{name:'Coral 1',registration:'A-1',layout:L(10)});
 const small=OP.saveBoat(state,coral,{name:'Coral 2',layout:L(4)});
 const sailing=OP.saveOperatorSailing(state,coral,{from:'Velana Airport',to:'Dhiffushi',depart:'10:00',arrive:'11:00',boatId:big.id,fare:20000,roomFare:2500,days:[1,3,5]});
 const book=(adults=2,extra={},seats)=>{const b=T.createTransfer(state,{token:crypto.randomUUID(),name:'Guest '+adults,phone:'+447700900123',traveller:'Tourist',adults,children:0,infants:0,notes:'',expectedTotal:20000*adults,journeys:[{scheduleId:sailing.id,date:FUTURE,seats:seats||T.freeSeats(state,sailing,FUTURE,adults)}],...extra},'walk-transfer:x');state.bookings.push(b);return b;};
 return {state,big,small,sailing,book};
}
const ticket=(state,sailing,seats,adults=seats.length)=>T.createTransfer(state,{token:crypto.randomUUID(),name:'G',phone:'+447700900123',traveller:'Tourist',adults,children:0,infants:0,notes:'',expectedTotal:sailing.fare*adults,journeys:[{scheduleId:sailing.id,date:FUTURE,seats}]},'x');

test('departures run on a boat and tickets are confirmed on that boat at booking',()=>{
 const {state,big,sailing,book}=sea();
 assert.equal(sailing.capacity,10);
 assert.equal(T.runsOn(sailing,FUTURE),true);
 assert.equal(T.runsOn(sailing,'2030-06-04'),false);
 assert.throws(()=>T.createTransfer(state,{token:'t',name:'A',phone:'+447700900123',traveller:'Tourist',adults:1,children:0,infants:0,notes:'',expectedTotal:20000,journeys:[{scheduleId:sailing.id,date:'2030-06-04',seats:[1]}]},'x'),/does not run/);
 const b=book();
 assert.equal(b.journeys[0].operatorId,coral.id);
 assert.equal(b.journeys[0].operatorStatus,'Accepted');
 assert.equal(b.journeys[0].boatId,big.id);
 assert.equal(b.journeys[0].boatName,'Coral 1');
 assert.equal(b.journeys[0].roomFare,2500);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{from:'A',to:'B',depart:'12:00',arrive:'13:00',fare:1}),/Choose one of your boats/);
 assert.throws(()=>OP.saveOperatorSailing(state,blue,{from:'A',to:'B',depart:'12:00',arrive:'13:00',fare:1,boatId:big.id}),/Choose one of your boats/);
});

test('seat maps: operators draw seats, guests book the exact seats they chose',()=>{
 const {state,sailing}=sea();
 assert.throws(()=>OP.cleanLayout({rows:1,cols:3,cells:[1,0,1]}),/Seat 1 appears twice/);
 assert.throws(()=>OP.cleanLayout({rows:1,cols:2,cells:[0,0]}),/at least one seat/);
 assert.throws(()=>OP.cleanLayout({rows:2,cols:2,cells:[1,2]}),/incomplete/);
 // A 3+3 boat with seat 1 at the back right, like ODI's seat plans.
 const l=T.defaultLayout(12,6);
 assert.deepEqual([l.rows,l.cols],[2,7]);
 assert.deepEqual(l.cells.slice(7),[6,5,4,0,3,2,1]);
 const b=ticket(state,sailing,[7,8]);state.bookings.push(b);
 assert.deepEqual(b.journeys[0].seats,[7,8]);
 assert.throws(()=>ticket(state,sailing,[8,9]),/Seat 8 was just booked by someone else/);
 assert.throws(()=>ticket(state,sailing,[11]),/one seat per adult/);
 assert.equal(T.seatTaken(Error('Seat 8 was just booked by someone else. Choose another seat.')),true);
 // With no seats chosen the server seats the party together.
 assert.deepEqual(T.seatsForBooking(state,[{scheduleId:sailing.id,date:FUTURE}],2)[0].seats,[1,2]);
 assert.deepEqual(T.seatsForBooking(state,[{scheduleId:sailing.id,date:FUTURE,seats:[3,4]}],2)[0].seats,[3,4]);
 assert.throws(()=>T.seatsForBooking(state,[{scheduleId:sailing.id,date:FUTURE}],9),/Not enough seats/);
 // Guests see the boat's map and only seat numbers, never names.
 assert.deepEqual(T.publicBoats(state).map(b=>b.name),['Coral 1']);
 assert.deepEqual(Object.keys(T.seatAvailability(state)[0]).sort(),['date','from','pax','scheduleId','seats','to']);
});

test('a boat is swapped for one trip only, keeping every booked seat',()=>{
 const {state,big,small,sailing,book}=sea();
 const a=book(2);
 OP.setTripBoat(state,coral,sailing.id,FUTURE,small.id,'op');
 assert.equal(T.tripBoat(state,sailing,FUTURE).id,small.id);
 assert.equal(T.tripBoat(state,sailing,'2030-06-05').id,big.id);
 assert.equal(a.journeys[0].boatName,'Coral 2');
 assert.equal(T.tripCapacity(state,sailing,FUTURE),4);
 // Seat 5 is not on the small boat, so a trip with seat 5 sold cannot move to it.
 OP.setTripBoat(state,coral,sailing.id,FUTURE,big.id,'op');
 assert.equal(sailing.boatOverrides[FUTURE],undefined);
 const far=ticket(state,sailing,[5]);state.bookings.push(far);
 assert.throws(()=>OP.setTripBoat(state,coral,sailing.id,FUTURE,small.id,'op'),/no seat 5/);
 // A boat cannot be on two overlapping trips.
 const other=OP.saveOperatorSailing(state,coral,{from:'Dhiffushi',to:'Velana Airport',depart:'10:30',arrive:'11:30',boatId:small.id,fare:20000});
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{from:'Dhiffushi',to:'Velana Airport',depart:'10:15',arrive:'11:15',boatId:small.id,fare:20000}),/already runs the 10:30/);
 assert.ok(other.id);
 assert.throws(()=>OP.setTripBoat(state,blue,sailing.id,FUTURE,small.id,'op'),/Departure not found/);
});

test('cancelling frees the seats and closes a walk-in booking; room transfers stay for reception',()=>{
 const {state,sailing,book}=sea();
 const a=book(2);
 assert.throws(()=>OP.declineTicket(state,coral.id,a.id,0,'','op'),/why/);
 OP.declineTicket(state,coral.id,a.id,0,'Engine repair','op');
 assert.equal(a.status,'Cancelled');
 assert.equal(a.journeys[0].cancelledByOperator,true);
 assert.equal(T.bookedPassengers(state,sailing.id,FUTURE),0);
 assert.deepEqual(T.occupied(state,sailing.id,FUTURE),[]);
 const r=book(2,{});r.stayId='S1';r.roomCents=5000;
 OP.declineTicket(state,coral.id,r.id,0,'Full','op');
 assert.equal(r.status,'Confirmed');
 assert.equal(r.journeys[0].operatorStatus,'Declined');
 assert.throws(()=>OP.declineTicket(state,blue.id,r.id,0,'x','op'),/Ticket not found/);
});

test('boarding, closing a trip, no-shows and the monthly statement',()=>{
 const {state,sailing,book}=sea();
 const a=book(2),b=book(1),room=book(2);room.stayId='S1';room.roomCents=5000;
 assert.throws(()=>OP.setBoarded(state,coral.id,a.id,0,2,'op','2030-06-02'),/day of departure/);
 OP.setBoarded(state,coral.id,a.id,0,2,'op',FUTURE);
 OP.setBoarded(state,coral.id,room.id,0,2,'op',FUTURE);
 assert.throws(()=>OP.setBoarded(state,coral.id,a.id,0,3,'op',FUTURE),/between 0 and 2/);
 const day=OP.operatorDay(state,coral.id,FUTURE)[0];
 assert.deepEqual([day.boatName,day.seats,day.sold,day.boarded,day.closed],['Coral 1',10,5,4,false]);
 assert.equal(OP.closeDeparture(state,coral.id,sailing.id,FUTURE,'op'),3);
 assert.equal(OP.operatorDay(state,coral.id,FUTURE)[0].closed,true);
 assert.equal(b.journeys[0].noShow,true);
 assert.equal(a.journeys[0].noShow,false);
 assert.throws(()=>OP.setBoarded(state,coral.id,a.id,0,1,'op',FUTURE),/closed/);
 const st=OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06');
 const later=book(1);
 assert.ok(later);
 assert.equal(OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06','2030-06-01').tickets,3);
 assert.equal(OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06','2030-06-01').upcoming,1);
 assert.equal(st.tickets,3);
 assert.equal(st.noShows,1);
 assert.equal(st.fareMvr,40000);             // the no-show paid nothing, so it is not collected
 assert.equal(st.commissionMvr,4000);        // 10% of the boarded guest-paid ticket only
 assert.equal(st.roomUsd,5000);              // 2 × $25 collected by Nirili on the room bill
 assert.equal(st.payableToOperatorUsd,4500);
});

test('operators cannot change a sold departure, remove a sold seat or retire a busy boat',()=>{
 const {state,big,small,sailing,book}=sea();
 book(2,{},[9,10]);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...flat(sailing),depart:'09:00'}),/upcoming bookings/);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...sailing,boatId:small.id}),/no seat 9, 10/);
 OP.saveOperatorSailing(state,coral,{...sailing,active:false});
 assert.equal(state.sailings.find(s=>s.id===sailing.id).active,false);
 OP.saveOperatorSailing(state,coral,{...sailing,active:true});
 assert.throws(()=>OP.saveBoat(state,coral,{...big,layout:L(8)}),/Seat 9, 10 is booked/);
 assert.throws(()=>OP.saveBoat(state,coral,{...big,active:false}),/upcoming bookings/);
 // Adding seats is fine and every departure on the boat sells them.
 OP.saveBoat(state,coral,{...big,layout:L(12)});
 assert.equal(state.sailings.find(s=>s.id===sailing.id).capacity,12);
 assert.throws(()=>OP.saveBoat(state,blue,{...big}),/Boat not found/);
 assert.throws(()=>OP.saveOperatorSailing(state,blue,{...sailing}),/Departure not found/);
});

test('tickets booked before trip boats confirm onto the trip boat',()=>{
 const {state,big,sailing}=sea();
 const old=ticket(state,sailing,[1]);old.journeys[0].operatorStatus='New';delete old.journeys[0].boatId;delete old.journeys[0].boatName;state.bookings.push(old);
 const next=T.normalizeTransport(structuredClone(state));
 assert.equal(next.bookings[0].journeys[0].operatorStatus,'Accepted');
 assert.equal(next.bookings[0].journeys[0].boatId,big.id);
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
 const session=load('app/api/partner-portal/session/route.ts',stubs,cache);
 const boats=load('app/api/operator-portal/speedboats/route.ts',stubs,cache);
 const buggy=load('app/api/operator-portal/buggy/route.ts',stubs,cache);
 const admin=load('app/api/partners/route.ts',stubs,cache);
 const walkin=load('app/api/walkin-transfers/route.ts',stubs,cache);
 const crewApi=load('app/api/operator-portal/crew/route.ts',stubs,cache);
 const ORIGIN='https://operators.nirilihotels.test';
 const req=(path,method,body,cookie='')=>new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json',...(cookie?{cookie}:{})},body:body&&JSON.stringify(body)});
 // Older tests describe operators by services; partner accounts use permissions.
 const perms=x=>{const {services,...rest}=x||{};return services?{...rest,permissions:services.map(v=>v==='boat'?'boats':'buggies')}:rest;};
 const create=async extra=>{const r=await admin.POST(req('/api/partners','POST',{name:'Coral Speed',phone:'+960 777 1111',permissions:['boats'],commissionPercent:10,username:'coralspeed',password:'coral-pass-1',...perms(extra)}));assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return (await r.json()).partner;};
 const signIn=async(username,password)=>{const r=await session.POST(req('/api/partner-portal/session','POST',{username,password}));return {status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
 return {sea,hotel,notices,who,admin,session,boats,buggy,walkin,crewApi,req,create,signIn,ops};
}

test('admin creates operators; operators sign in to their own portal only',async()=>{
 const s=apis();
 const op=await s.create();
 assert.equal(op.passwordHash,undefined);
 assert.equal((await s.admin.POST(s.req('/api/partners','POST',{name:'X',phone:'+9607771111',permissions:['boats'],username:'coralspeed',password:'whatever1'}))).status,400);
 assert.equal((await s.admin.POST(s.req('/api/partners','POST',{name:'X',phone:'+9607771111',permissions:[],username:'other',password:'whatever1'}))).status,400);
 assert.equal((await s.signIn('coralspeed','wrong-pass')).status,401);
 const {status,cookie}=await s.signIn('coralspeed','coral-pass-1');
 assert.equal(status,200);
 assert.match(cookie,/^nirili_partner_session=[a-f0-9]{64}$/);
 assert.equal((await s.boats.GET(s.req('/api/operator-portal/speedboats','GET',null,cookie))).status,200);
 // A speedboat-only operator has no buggy portal; staff cannot use the operator API.
 assert.equal((await s.buggy.GET(s.req('/api/operator-portal/buggy','GET',null,cookie))).status,401);
 assert.equal((await s.boats.GET(s.req('/api/operator-portal/speedboats','GET'))).status,401);
 s.who.staff={role:'staff',userId:'S1',permissions:['guesthouse_reception']};
 assert.equal((await s.admin.GET(s.req('/api/partners','GET'))).status,403);
});

test('a decline notifies Nirili so the guest can be rebooked',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',body,cookie));
 const boat=await (await post({action:'save-boat',boat:{name:'Coral 1',layout:T.defaultLayout(12)}})).json();
 const d=await (await post({action:'save-sailing',sailing:{from:'Dhiffushi',to:'Velana Airport',depart:'07:00',arrive:'08:00',boatId:boat.boats[0].id,fare:20000}})).json();
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

test('through the API an operator draws a boat, publishes a departure, sees bookings and swaps the boat for a day',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{...body,viewDate:FUTURE},cookie));
 assert.equal((await post({action:'save-boat',boat:{name:'No map'}})).status,400);
 let d=await (await post({action:'save-boat',boat:{name:'Coral 1',layout:T.defaultLayout(10)}})).json();
 const boatId=d.boats[0].id;
 assert.equal(d.boats[0].capacity,10);
 d=await (await post({action:'save-boat',boat:{name:'Coral 2',layout:T.defaultLayout(6,6)}})).json();
 const spare=d.boats[1].id;
 d=await (await post({action:'save-sailing',sailing:{from:'Velana Airport',to:'Dhiffushi',depart:'10:00',arrive:'11:00',boatId,fare:20000}})).json();
 const sailing=d.sailings[0];
 assert.equal(sailing.operatorName,'Coral Speed');
 assert.equal(sailing.capacity,10);
 // A guest books seats 3 and 4 on the public site.
 const b=T.createTransfer(s.sea.state,{token:'g1',name:'Guest',phone:'+447700900123',traveller:'Tourist',adults:2,children:0,infants:0,notes:'',expectedTotal:40000,journeys:[{scheduleId:sailing.id,date:FUTURE,seats:[3,4]}]},'walk-transfer:x');
 s.sea.state.bookings.push(b);
 d=await (await s.boats.GET(s.req('/api/operator-portal/speedboats?date='+FUTURE,'GET',null,cookie))).json();
 assert.equal(d.inbox,undefined);
 assert.equal(d.bookings.length,1);
 assert.deepEqual(d.bookings[0].tickets[0].seats,[3,4]);
 const day=d.day[0];
 assert.equal(day.boatName,'Coral 1');
 assert.deepEqual(day.taken,[3,4]);
 assert.equal(day.tickets[0].status,'Accepted');
 assert.equal(day.tickets[0].phone,'+447700900123');
 d=await (await post({action:'trip-boat',scheduleId:sailing.id,date:FUTURE,boatId:spare})).json();
 assert.equal(d.day[0].boatName,'Coral 2');
 assert.equal(d.day[0].swapped,true);
 assert.equal(d.day[0].layout.cols,7);
 // Another operator sees nothing and cannot act on it.
 await s.create({name:'Blue Line',username:'blueline',phone:'+9607772222'});
 const other=(await s.signIn('blueline','coral-pass-1')).cookie;
 const theirs=await (await s.boats.GET(s.req('/api/operator-portal/speedboats?date='+FUTURE,'GET',null,other))).json();
 assert.equal(theirs.day.length,0);
 assert.equal(theirs.bookings.length,0);
 assert.equal((await s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{action:'cancel',bookingId:b.id,index:0,reason:'x'},other))).status,400);
 assert.equal((await s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{action:'trip-boat',scheduleId:sailing.id,date:FUTURE,boatId:spare},other))).status,400);
 // Staff see upcoming tickets per operator.
 const ops=await (await s.admin.GET(s.req('/api/partners','GET'))).json();
 assert.equal(ops.partners.find(o=>o.username==='coralspeed').upcomingTickets,1);
});

test('the public site shows seat maps and books the seats the guest chose',async()=>{
 const s=apis();
 const op=await s.create();
 s.sea.state.boats.push({id:'B1',operatorId:op.id,name:'Altec 1',registration:'',capacity:4,active:true,layout:T.defaultLayout(4),createdAt:'',updatedAt:''});
 s.sea.state.sailings.push({id:'S1',boat:'Altec',operatorId:op.id,operatorName:'Altec',from:'Velana Airport',to:'Dhiffushi',depart:'16:30',arrive:'17:15',capacity:4,fare:46000,active:true,boatId:'B1'});
 const ask=(body)=>s.walkin.POST(new Request('https://transfers.nirilihotels.test/api/walkin-transfers',{method:'POST',headers:{origin:'https://transfers.nirilihotels.test','content-type':'application/json'},body:JSON.stringify({action:'book',payment:'later',traveller:'Tourist',children:0,infants:0,notes:'',...body})}));
 const view=await (await s.walkin.GET()).json();
 assert.deepEqual(view.boats.map(b=>[b.id,b.layout.cells.filter(n=>n>0).length]),[['B1',4]]);
 const first=await ask({token:crypto.randomUUID(),name:'First',phone:'+447700900123',adults:2,expectedTotal:92000,journeys:[{scheduleId:'S1',date:FUTURE,seats:[3,4]}]});
 assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
 // Someone with an out-of-date page picked seat 4 too: they get the fresh map to choose again.
 const clash=await ask({token:crypto.randomUUID(),name:'Second',phone:'+447700900123',adults:1,expectedTotal:46000,journeys:[{scheduleId:'S1',date:FUTURE,seats:[4]}]});
 assert.equal(clash.status,409);
 const fresh=await clash.json();
 assert.match(fresh.error,/Seat 4 was just booked/);
 assert.deepEqual(fresh.availability.flatMap(a=>a.seats),[3,4]);
 // No seats chosen: the server seats them.
 const auto=await ask({token:crypto.randomUUID(),name:'Third',phone:'+447700900123',adults:2,expectedTotal:92000,journeys:[{scheduleId:'S1',date:FUTURE}]});
 assert.equal(auto.status,200);
 assert.deepEqual(s.sea.state.bookings.map(b=>b.journeys[0].seats),[[3,4],[1,2]]);
 const full=await ask({token:crypto.randomUUID(),name:'Fourth',phone:'+447700900123',adults:1,expectedTotal:46000,journeys:[{scheduleId:'S1',date:FUTURE}]});
 assert.equal(full.status,400);
 assert.match((await full.json()).error,/Not enough seats/);
});

test('an operator can cancel a ticket before boarding; Nirili is told and the seats are freed',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{...body,viewDate:FUTURE},cookie));
 let d=await (await post({action:'save-boat',boat:{name:'Coral 1',layout:T.defaultLayout(10)}})).json();
 const boatId=d.boats[0].id;
 d=await (await post({action:'save-sailing',sailing:{from:'Velana Airport',to:'Dhiffushi',depart:'16:30',arrive:'17:15',boatId,fare:46000}})).json();
 const sailingId=d.sailings[0].id;
 const book=name=>{const b=T.createTransfer(s.sea.state,{token:crypto.randomUUID(),name,phone:'+447700900123',traveller:'Tourist',adults:2,children:0,infants:0,notes:'',expectedTotal:92000,journeys:[{scheduleId:sailingId,date:FUTURE,seats:T.freeSeats(s.sea.state,s.sea.state.sailings[0],FUTURE,2)}]},'walk-transfer:x');s.sea.state.bookings.push(b);return b;};
 const a=book('Guest A');
 assert.equal((await post({action:'cancel',bookingId:a.id,index:0,reason:''})).status,400);
 assert.equal((await post({action:'cancel',bookingId:a.id,index:0,reason:'Guest asked to cancel'})).status,200);
 const saved=s.sea.state.bookings.find(b=>b.id===a.id);
 assert.equal(saved.status,'Cancelled');
 assert.equal(saved.journeys[0].cancelledByOperator,true);
 assert.equal(T.bookedPassengers(s.sea.state,sailingId,FUTURE),0);
 assert.equal(s.notices.at(-1).title,'Speedboat ticket cancelled by operator');
 assert.deepEqual(saved.history.map(h=>h.action),['Cancelled by operator']);
 // Once passengers have boarded, the ticket can no longer be cancelled.
 const b=book('Guest B');
 OP.setBoarded(s.sea.state,s.sea.state.boats[0].operatorId,b.id,0,1,'op',FUTURE);
 const late=await post({action:'cancel',bookingId:b.id,index:0,reason:'Changed plans'});
 assert.equal(late.status,400);
 assert.match((await late.json()).error,/already boarded/);
 // Closing works per trip.
 assert.equal((await post({action:'close',scheduleId:sailingId,date:FUTURE})).status,200);
 assert.ok(s.sea.state.bookings.find(x=>x.id===b.id).journeys[0].departedAt);
});

test('crew are assigned per departure or per trip, and changing one day leaves the others',()=>{
 const {state,sailing}=sea();
 const crew=new Set(['CREW-A','CREW-B']);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...sailing,crewIds:['CREW-X']},crew),/your own active crew/);
 OP.saveOperatorSailing(state,coral,{...sailing,crewIds:['CREW-A']},crew);
 const s=state.sailings.find(x=>x.id===sailing.id);
 assert.deepEqual(OP.tripCrew(s,FUTURE),['CREW-A']);
 OP.setTripCrew(state,coral,sailing.id,FUTURE,['CREW-B'],crew);
 assert.deepEqual(OP.tripCrew(s,FUTURE),['CREW-B']);
 assert.deepEqual(OP.tripCrew(s,'2030-06-05'),['CREW-A']);
 assert.deepEqual(OP.crewTrips(state,coral.id,'CREW-A','2030-06-03','2030-06-07').map(t=>t.date),['2030-06-05','2030-06-07']);
 assert.equal(OP.crewOnTrip(state,coral.id,'CREW-B',sailing.id,FUTURE),true);
 assert.equal(OP.crewOnTrip(state,blue.id,'CREW-B',sailing.id,FUTURE),false);
 OP.setTripCrew(state,coral,sailing.id,FUTURE,null,crew,true);
 assert.deepEqual(OP.tripCrew(s,FUTURE),['CREW-A']);
 // Editing the departure without crew ids keeps its crew.
 OP.saveOperatorSailing(state,coral,{...s,crewIds:undefined},crew);
 assert.deepEqual(state.sailings.find(x=>x.id===sailing.id).crewIds,['CREW-A']);
 assert.throws(()=>OP.setTripCrew(state,blue,sailing.id,FUTURE,[],crew),/Departure not found/);
});

test('operators create crew logins; crew see and board only their own trips',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{...body,viewDate:FUTURE},cookie));
 assert.equal((await post({action:'save-crew',crew:{name:'Clash',username:'coralspeed',password:'crew-pass-1'}})).status,400);
 let d=await (await post({action:'save-crew',crew:{name:'Ali',role:'Captain',username:'ali.captain',password:'crew-pass-1'}})).json();
 d=await (await post({action:'save-crew',crew:{name:'Hassan',username:'hassan',password:'crew-pass-2'}})).json();
 assert.equal(d.crew.length,2);
 assert.equal(d.crew[0].passwordHash,undefined);
 const ali=d.crew.find(c=>c.name==='Ali').id,hassan=d.crew.find(c=>c.name==='Hassan').id;
 d=await (await post({action:'save-boat',boat:{name:'Coral 1',layout:T.defaultLayout(10)}})).json();
 d=await (await post({action:'save-sailing',sailing:{from:'Velana Airport',to:'Dhiffushi',depart:'10:00',arrive:'11:00',boatId:d.boats[0].id,fare:20000,crewIds:[ali]}})).json();
 const sailingId=d.sailings[0].id;
 assert.deepEqual(d.sailings[0].crewIds,[ali]);
 const b=T.createTransfer(s.sea.state,{token:'c1',name:'Guest',phone:'+447700900123',traveller:'Tourist',adults:2,children:0,infants:0,notes:'',expectedTotal:40000,journeys:[{scheduleId:sailingId,date:FUTURE,seats:[1,2]}]},'walk-transfer:x');
 s.sea.state.bookings.push(b);
 // Crew sign in on the same page and get a crew session, not an operator one.
 const login=await s.session.POST(s.req('/api/partner-portal/session','POST',{username:'ali.captain',password:'crew-pass-1'}));
 assert.equal(login.status,200);
 assert.equal((await login.json()).crew.operatorName,'Coral Speed');
 const aliCookie=(login.headers.get('set-cookie')||'').split(';')[0];
 assert.match(aliCookie,/^nirili_crew_session=/);
 const hassanCookie=((await s.session.POST(s.req('/api/partner-portal/session','POST',{username:'hassan',password:'crew-pass-2'}))).headers.get('set-cookie')||'').split(';')[0];
 const crewGet=c=>s.crewApi.GET(s.req('/api/operator-portal/crew?date='+FUTURE,'GET',null,c));
 const crewPost=(c,body)=>s.crewApi.POST(s.req('/api/operator-portal/crew','POST',{...body,viewDate:FUTURE},c));
 let view=await (await crewGet(aliCookie)).json();
 assert.equal(view.day.length,1);
 assert.deepEqual(view.day[0].tickets[0].seats,[1,2]);
 assert.equal((await (await crewGet(hassanCookie)).json()).day.length,0);
 // Crew cannot use the operator API.
 assert.equal((await s.boats.GET(s.req('/api/operator-portal/speedboats','GET',null,aliCookie))).status,401);
 const board=c=>crewPost(c,{action:'board',bookingId:b.id,index:0,boarded:2});
 assert.match((await (await board(hassanCookie)).json()).error,/not on one of your trips/);
 assert.match((await (await board(aliCookie)).json()).error,/day of departure/);
 assert.match((await (await crewPost(aliCookie,{action:'close',scheduleId:sailingId,date:FUTURE})).json()).error,/day it leaves/);
 assert.match((await (await crewPost(aliCookie,{action:'cancel',bookingId:b.id,index:0,reason:'x'})).json()).error,/board guests and close/);
 // The operator moves this one trip to Hassan.
 d=await (await post({action:'trip-crew',scheduleId:sailingId,date:FUTURE,crewIds:[hassan]})).json();
 assert.deepEqual(d.day[0].crewIds,[hassan]);
 assert.equal(d.day[0].crewChanged,true);
 assert.equal((await (await crewGet(aliCookie)).json()).day.length,0);
 assert.equal((await (await crewGet(hassanCookie)).json()).day.length,1);
 assert.equal((await post({action:'trip-crew',scheduleId:sailingId,date:FUTURE,crewIds:['CREW-NOPE']})).status,400);
 // Pausing a crew login ends their access at once.
 await post({action:'save-crew',crew:{...d.crew.find(c=>c.id===hassan),active:false}});
 assert.equal((await crewGet(hassanCookie)).status,401);
 assert.equal((await s.session.POST(s.req('/api/partner-portal/session','POST',{username:'hassan',password:'crew-pass-2'}))).status,401);
 // Staff see the operator's crew.
 const ops=await (await s.admin.GET(s.req('/api/partners','GET'))).json();
 assert.deepEqual(ops.partners[0].crew.map(c=>[c.name,c.active]),[['Ali',true],['Hassan',false]]);
 // Pausing the operator locks out its crew too.
 const op=ops.partners[0];
 await s.admin.PATCH(s.req('/api/partners','PATCH',{id:op.id,revision:op.revision,active:false}));
 assert.equal((await crewGet(aliCookie)).status,401);
});

test('locals pay the local fare; expats too when the operator allows it',()=>{
 const {state,sailing}=sea();
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...flat(sailing),localFare:-1}),/valid local fare/);
 OP.saveOperatorSailing(state,coral,{...flat(sailing),localFare:12000});
 const s=state.sailings.find(x=>x.id===sailing.id);
 assert.deepEqual([T.fareFor(s,'Tourist'),T.fareFor(s,'Local'),T.fareFor(s,'Expat')],[20000,12000,20000]);
 assert.equal(T.hasLocalFare(s),true);
 const book=(traveller,expectedTotal,seats)=>T.createTransfer(state,{token:crypto.randomUUID(),name:'G',phone:'+9607000000',traveller,adults:1,children:1,infants:0,notes:'',expectedTotal,journeys:[{scheduleId:sailing.id,date:FUTURE,seats}]},'x');
 // One adult and one child (half fare).
 const local=book('Local',18000,[1,2]);
 assert.equal(local.total,18000);
 assert.equal(local.journeys[0].fare,12000);
 assert.throws(()=>book('Local',30000,[3,4]),/fare changed/);
 assert.equal(book('Expat',30000,[3,4]).total,30000); // no expat fare yet: tourist fare
 assert.throws(()=>book('Martian',30000,[3,4]),/passenger type/);
 // Fares can change on a departure with bookings; sold tickets keep their fare.
 state.bookings.push(local);
 OP.saveOperatorSailing(state,coral,{...flat(s),localFare:10000,expatFare:15000});
 assert.deepEqual(['Tourist','Local','Expat'].map(t=>T.fareFor(state.sailings.find(x=>x.id===sailing.id),t)),[20000,10000,15000]);
 // Older departures that gave expats the local fare keep doing so.
 assert.equal(T.fareFor({fare:20000,localFare:9000,expatLocal:true},'Expat'),9000);
 OP.saveOperatorSailing(state,coral,{...flat(s),localFare:10000,expatFare:'',expatLocal:true});
 assert.equal(state.sailings.find(x=>x.id===sailing.id).expatFare,10000);
 assert.equal(local.journeys[0].fare,12000);
 // Without a local fare everyone pays the tourist fare.
 OP.saveOperatorSailing(state,coral,{...flat(s),localFare:''});
 assert.equal(T.fareFor(state.sailings.find(x=>x.id===sailing.id),'Local'),20000);
});

test('private charters: operators price routes, guests request, operators confirm with a free boat',()=>{
 const {state,big,small,sailing}=sea();
 assert.throws(()=>CH.saveCharterRate(state,coral,{from:'A',to:'A',price:100,blockMin:60}),/starts and where it goes/);
 assert.throws(()=>CH.saveCharterRate(state,coral,{from:'Velana Airport',to:'Dhiffushi',price:500000,blockMin:120,boatIds:['BOAT-X']}),/own fleet/);
 const rate=CH.saveCharterRate(state,coral,{from:'Velana Airport',to:'Dhiffushi',price:500000,blockMin:120});
 assert.deepEqual(T.ports(state),['Dhiffushi','Velana Airport']);
 assert.equal(CH.publicCharterRates(state)[0].maxPax,10);
 // At 10:30 on a Monday the big boat runs the 10:00 departure, so only the small one is free.
 assert.equal(CH.searchCharters(state,{from:'velana airport',to:'Dhiffushi',date:FUTURE,time:'10:30',pax:4}).length,1);
 assert.equal(CH.searchCharters(state,{from:'Velana Airport',to:'Dhiffushi',date:FUTURE,time:'10:30',pax:6}).length,0);
 assert.equal(CH.searchCharters(state,{from:'Velana Airport',to:'Dhiffushi',date:FUTURE,time:'14:00',pax:6})[0].price,500000);
 const ask=extra=>CH.requestCharter(state,{rateId:rate.id,date:FUTURE,time:'14:00',pax:6,name:'Group',phone:'+9607000000',expectedPrice:500000,token:'t',...extra},'walk-transfer:x');
 assert.throws(()=>ask({expectedPrice:1}),/price changed/);
 assert.throws(()=>ask({pax:20}),/No boat is free/);
 const c=ask();
 assert.equal(c.status,'Requested');
 assert.throws(()=>CH.confirmCharter(state,coral.id,c.id,small.id,'op'),/has 4 seats/);
 assert.throws(()=>CH.confirmCharter(state,blue.id,c.id,big.id,'op'),/Charter not found/);
 CH.confirmCharter(state,coral.id,c.id,big.id,'op');
 assert.equal(c.boatName,'Coral 1');
 // The boat is now busy: no second charter, no one-day swap onto that time, no new departure.
 assert.equal(CH.searchCharters(state,{from:'Velana Airport',to:'Dhiffushi',date:FUTURE,time:'15:00',pax:6}).length,0);
 assert.match(CH.boatBusy(state,big.id,FUTURE,'15:00',30),/14:00 charter/);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{from:'Dhiffushi',to:'Velana Airport',depart:'14:30',arrive:'15:30',boatId:big.id,fare:1}),/confirmed charter/);
 assert.throws(()=>OP.saveBoat(state,coral,{...big,active:false}),/confirmed charters/);
 // Completing counts it on the statement with commission.
 assert.throws(()=>CH.completeCharter(state,coral.id,c.id,'op','2030-06-02'),/day it runs/);
 CH.completeCharter(state,coral.id,c.id,'op',FUTURE);
 const st=OP.operatorStatement(state,{id:coral.id,commissionPercent:10},'2030-06');
 assert.equal(st.charters.length,1);
 assert.equal(st.charterCommissionMvr,50000);
 assert.equal(st.commissionMvr,50000);
 // Declining needs a reason.
 const d=ask({token:'u'});
 assert.throws(()=>CH.declineCharter(state,coral.id,d.id,'','op'),/why/);
 assert.equal(CH.declineCharter(state,coral.id,d.id,'Weather','op').status,'Declined');
 assert.ok(sailing);
});

test('the public site lists ports and vessels, searches charters and sends requests',async()=>{
 const s=apis();
 await s.create();
 const {cookie}=await s.signIn('coralspeed','coral-pass-1');
 const post=body=>s.boats.POST(s.req('/api/operator-portal/speedboats','POST',{...body,viewDate:FUTURE},cookie));
 let d=await (await post({action:'save-boat',boat:{name:'Coral 1',layout:T.defaultLayout(10)}})).json();
 d=await (await post({action:'save-charter-rate',rate:{from:'Velana Airport',to:'Maafushi',price:800000,blockMin:120}})).json();
 assert.equal(d.charterRates.length,1);
 const ask=body=>s.walkin.POST(new Request('https://transfers.nirilihotels.test/api/walkin-transfers',{method:'POST',headers:{origin:'https://transfers.nirilihotels.test','content-type':'application/json'},body:JSON.stringify(body)}));
 const view=await (await s.walkin.GET()).json();
 assert.deepEqual(view.ports,['Maafushi','Velana Airport']);
 assert.deepEqual(view.stats,{vessels:1,operators:1});
 const offers=(await (await ask({action:'charter-search',from:'Velana Airport',to:'Maafushi',date:FUTURE,time:'09:00',pax:8})).json()).offers;
 assert.equal(offers[0].operatorName,'Coral Speed');
 const sent=await ask({action:'charter',token:'c1',rateId:offers[0].rateId,date:FUTURE,time:'09:00',pax:8,name:'Big Group',phone:'+447700900123',expectedPrice:800000});
 assert.equal(sent.status,200,JSON.stringify(await sent.clone().json()));
 const body=await sent.json();
 assert.match(body.charter.id,/^CH-/);
 assert.equal(body.charters[0].status,'Requested');
 assert.equal(s.notices.at(-1).title,'New charter request');
 // The operator sees it with the guest's number and confirms it.
 d=await (await post({action:'charter-confirm',id:body.charter.id,boatId:d.boats[0].id})).json();
 assert.equal(d.charters[0].status,'Confirmed');
 assert.equal(d.charters[0].phone,'+447700900123');
});

test('routes with stops: guests book any stretch and a seat is sold again after its guest gets off',()=>{
 const {state,big}=sea();
 const stops=[{port:'Dhiffushi',depart:'08:00'},{port:'Velana Airport',arrive:'08:40',depart:'08:45'},{port:"Male'",arrive:'08:55'}];
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{stops:[stops[0],{port:'Velana Airport',arrive:'07:00',depart:'07:10'},stops[2]],fares:[{from:0,to:2,fare:1}],boatId:big.id}),/must reach Velana Airport after it leaves Dhiffushi/);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{stops:[stops[0],stops[1],{port:'dhiffushi',arrive:'09:00'}],fares:[{from:0,to:2,fare:1}],boatId:big.id}),/only be one stop/);
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{stops,fares:[{from:0,to:1,fare:''}],boatId:big.id}),/at least one part/);
 const route=OP.saveOperatorSailing(state,coral,{stops,fares:[{from:0,to:1,fare:30000,localFare:15000,roomFare:2500},{from:0,to:2,fare:35000},{from:1,to:2,fare:5000}],boatId:big.id});
 assert.deepEqual([route.from,route.to,route.depart,route.arrive,route.fare],['Dhiffushi',"Male'",'08:00','08:55',35000]);
 assert.deepEqual(T.legsOf(route).map(l=>[l.from,l.to,l.depart,l.arrive,l.fare]),[['Dhiffushi','Velana Airport','08:00','08:40',30000],['Dhiffushi',"Male'",'08:00','08:55',35000],['Velana Airport',"Male'",'08:45','08:55',5000]]);
 assert.equal(T.findLeg(route,'dhiffushi','velana airport').fromStop,0);
 assert.deepEqual(T.ports(state).filter(p=>p==="Male'"),["Male'"]);
 const book=(fromStop,toStop,seats,traveller='Tourist')=>{const leg=T.legOf(route,fromStop,toStop);const b=T.createTransfer(state,{token:crypto.randomUUID(),name:'G',phone:'+9607000000',traveller,adults:seats.length,children:0,infants:0,notes:'',expectedTotal:T.fareFor(leg,traveller)*seats.length,journeys:[{scheduleId:route.id,fromStop,toStop,date:FUTURE,seats}]},'x');state.bookings.push(b);return b;};
 // Seat 1: Dhiffushi → Airport, then sold again Airport → Malé.
 const a=book(0,1,[1],'Local');
 assert.deepEqual([a.journeys[0].from,a.journeys[0].to,a.journeys[0].depart,a.journeys[0].arrive,a.journeys[0].fare],['Dhiffushi','Velana Airport','08:00','08:40',15000]);
 const b=book(1,2,[1]);
 assert.equal(b.total,5000);
 assert.throws(()=>book(0,2,[1]),/Seat 1 was just booked/);
 assert.throws(()=>T.createTransfer(state,{token:'z',name:'G',phone:'+9607000000',traveller:'Tourist',adults:1,children:0,infants:0,notes:'',expectedTotal:0,journeys:[{scheduleId:route.id,fromStop:1,toStop:0,date:FUTURE,seats:[2]}]},'x'),/where you get on and off/);
 assert.deepEqual(T.freeSeats(state,T.legOf(route,0,2),FUTURE,1),[2]);
 assert.deepEqual(T.freeSeats(state,T.legOf(route,1,2),FUTURE,1),[2]);
 assert.deepEqual(T.seatsForBooking(state,[{scheduleId:route.id,fromStop:0,toStop:1,date:FUTURE}],2)[0].seats,[2,3]);
 // The operator sees each stretch's load; the busiest decides how full the trip is.
 const day=OP.operatorDay(state,coral.id,FUTURE).find(d=>d.scheduleId===route.id);
 assert.deepEqual(day.load.map(l=>l.seats),[1,1]);
 assert.equal(day.sold,1);
 assert.deepEqual(day.tickets.map(t=>t.journey.fromStop),[0,1]);
 // With tickets sold, stops and times are fixed but fares can change.
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{...route,stops:[stops[0],{...stops[1],depart:'08:50'},stops[2]]}),/upcoming bookings/);
 OP.saveOperatorSailing(state,coral,{...route,fares:[{from:0,to:1,fare:32000},{from:1,to:2,fare:5000}]});
 assert.equal(T.legOf(state.sailings.find(s=>s.id===route.id),0,2),null);
 assert.equal(a.journeys[0].fare,15000);
 // The boat is busy for the whole route.
 assert.throws(()=>OP.saveOperatorSailing(state,coral,{from:'Dhiffushi',to:'Velana Airport',depart:'08:50',arrive:'09:30',fare:1,boatId:big.id}),/already runs the 08:00/);
});

test('the public site books a stretch of a route with stops',async()=>{
 const s=apis();
 const op=await s.create();
 s.sea.state.boats.push({id:'B1',operatorId:op.id,name:'Altec 1',registration:'',capacity:4,active:true,layout:T.defaultLayout(4),createdAt:'',updatedAt:''});
 s.sea.state.sailings.push({id:'R1',boat:'Altec',operatorId:op.id,operatorName:'Altec',from:"Male'",to:'Dhiffushi',depart:'11:20',arrive:'12:00',capacity:4,fare:46000,active:true,boatId:'B1',
  stops:[{port:"Male'",depart:'11:20'},{port:'Velana Airport',arrive:'11:25',depart:'11:30'},{port:'Dhiffushi',arrive:'12:00'}],fares:[{from:0,to:2,fare:46000},{from:1,to:2,fare:40000},{from:0,to:1,fare:3000}]});
 const ask=(body)=>s.walkin.POST(new Request('https://transfers.nirilihotels.test/api/walkin-transfers',{method:'POST',headers:{origin:'https://transfers.nirilihotels.test','content-type':'application/json'},body:JSON.stringify({action:'book',payment:'later',traveller:'Tourist',children:0,infants:0,notes:'',name:'G',phone:'+447700900123',...body})}));
 const view=await (await s.walkin.GET()).json();
 assert.deepEqual(view.ports,['Dhiffushi',"Male'",'Velana Airport']);
 // Malé → Airport on seats 1–2, then the same seats from the Airport to Dhiffushi.
 assert.equal((await ask({token:'a',adults:2,expectedTotal:6000,journeys:[{scheduleId:'R1',fromStop:0,toStop:1,date:FUTURE,seats:[1,2]}]})).status,200);
 const second=await ask({token:'b',adults:2,expectedTotal:80000,journeys:[{scheduleId:'R1',fromStop:1,toStop:2,date:FUTURE,seats:[1,2]}]});
 assert.equal(second.status,200,JSON.stringify(await second.clone().json()));
 const clash=await ask({token:'c',adults:1,expectedTotal:46000,journeys:[{scheduleId:'R1',fromStop:0,toStop:2,date:FUTURE,seats:[2]}]});
 assert.equal(clash.status,409);
 const avail=(await clash.json()).availability;
 assert.deepEqual(avail.map(a=>[a.from,a.to]),[[0,1],[1,2]]);
});
