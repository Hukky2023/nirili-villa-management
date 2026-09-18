// Run: node --test tests/excursion-extra-vessels.test.mjs (Node >=22.13).
// Tests production preparation/save/seed code against real SQLite transactions.
// Authentication, the clock and unrelated room-login services are isolated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=fileURLToPath(new URL('../',import.meta.url));
const day='2026-09-19',stateKey='hotel-stays-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
function load(file,mocks={}){
 const source=readFileSync(root+file,'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true,fileName:file});
 assert.equal((output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 const exports={};
 vm.runInNewContext('(function(require,exports){'+output.outputText+'\n})',{crypto:webcrypto,TextEncoder,Date,console,Request,Response,URL})((id)=>{
  if(!(id in mocks))throw Error('Unexpected test dependency: '+id);return mocks[id];
 },exports);
 return exports;
}
const operations=load('lib/excursion-operations.ts');
const catalog={islandToday:()=>day,catalog:[]};
const resources={excursionResources:state=>state.excursionResources||{vessels:[],crew:[]}};
const extra=load('lib/excursion-extra-vessels.ts',{'./guest-catalog':catalog,'./excursion-workflow':resources,'./excursion-operations':operations});
class DB{
 constructor(){
  this.sql=new DatabaseSync(':memory:');this.beforeBatch=null;
  this.sql.exec('CREATE TABLE operation_records(key TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_by TEXT);');
 }
 prepare(sql){
  const db=this;let args=[];
  return {sql,bind(...values){args=values;return this;},get args(){return args;},
   async first(){return db.sql.prepare(sql).get(...args)||null;},
   async all(){return {results:db.sql.prepare(sql).all(...args)};},
   async run(){const result=db.sql.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};
 }
 async batch(writes){
  if(this.beforeBatch){const fn=this.beforeBatch;this.beforeBatch=null;fn();}
  this.sql.exec('BEGIN');
  try{const result=[];for(const write of writes)result.push(await write.run());this.sql.exec('COMMIT');return result;}
  catch(error){this.sql.exec('ROLLBACK');throw error;}
 }
 put(key,payload,revision=1){this.sql.prepare('INSERT OR REPLACE INTO operation_records VALUES(?,?,?,?)').run(key,JSON.stringify(payload),revision,'test');}
 row(key){return this.sql.prepare('SELECT * FROM operation_records WHERE key=?').get(key);}
 state(){return JSON.parse(this.row(stateKey).payload);}
 schedules(){return this.sql.prepare("SELECT payload FROM operation_records WHERE key LIKE 'excursion-schedule:%'").all().map(row=>JSON.parse(row.payload));}
}
function saveFor(db){return load('lib/stay-login.ts',{
 './auth':{authDb:()=>db},'./credential-store':{credentialStatement:()=>{throw Error('No credential write expected');}},
 './stays':{stayKey:stateKey},'./excursion-extra-vessels':extra
}).saveStayAccess;}
function defaultFor(db){return load('lib/excursion-default-schedule.ts',{
 './auth':{authDb:()=>db},'./guest-catalog':catalog,'./excursion-operations':operations,
 './excursion-extra-vessels':extra,'./stay-login':{saveStayAccess:saveFor(db)},
 './stays':{loadStays:async()=>({state:db.state(),revision:db.row(stateKey).revision})}
}).ensureStandardDailyExcursions;}
function fixture({legacy=false,quantity=6,capacity=8}={}){
 const db=new DB();
 const parent={id:'regular-2',date:day,time:'08:00',endTime:'09:30',name:'Turtle Snorkeling + Coral Garden Snorkeling',vesselId:'v1',capacity:6,priceCents:7000,crewIds:['c1','c2','c3'],guideIds:['c1','c2','c3'],status:'Open',sharedGroup:'original-group',standardDaily:true,standardDailyVersion:3,tripCode:'trip2'};
 const base={id:'EXC-BASE',kind:'excursion',date:day,scheduleId:parent.id,status:'Scheduled',approvalStatus:'Approved',quantity:4,cents:28000};
 const overflow={id:'EXC-EXTRA',kind:'excursion',date:day,time:'08:00',endTime:'09:30',scheduleId:parent.id,name:'Turtle Snorkeling',quantity,cents:15000,quotedCents:15000,unitPriceCents:2500,guest:'Test guest',room:'103',stayId:'NV-TEST',accountId:'room-account',adults:quantity,children:0,infants:0,phone:'+9601234567',guestNotified:true,approvalStatus:'Approved',status:'Scheduled',seatRequest:true,separateVessel:true,overflowVesselId:'v2',schedule:{date:day,time:'08:00',endTime:'09:30',vesselId:'v2',vessel:'EXTRA BOAT',crewIds:['c1','c2','c3'],crew:['One','Two','Three'],extraVessel:true},excursionPayments:[{cents:5000}],createdAt:day+'T00:00:00Z'};
 const state={orders:[base,clone(overflow)],stays:[{id:'NV-TEST',room:'103',paidBills:{'Excursions:EXC-EXTRA':15000}}],excursionResources:{vessels:[{id:'v1',name:'ORIGINAL BOAT',capacity:6,condition:'Available'},{id:'v2',name:'EXTRA BOAT',capacity,condition:'Available'}],crew:['c1','c2','c3'].map((id,index)=>({id,name:['One','Two','Three'][index],active:true}))}};
 const previous=clone(state);
 if(!legacy)Object.assign(previous.orders[1],{approvalStatus:'Pending',status:'Awaiting scheduling',separateVessel:false,cents:0});
 db.put(stateKey,previous,5);db.put('excursion-schedule:'+day+':'+parent.id,parent,2);
 return {db,state,parent,overflow,save:saveFor(db)};
}
const booked=(state,id)=>state.orders.filter(o=>o.scheduleId===id&&!o.separateVessel&&o.status!=='Cancelled'&&!['Pending','Declined','Cancelled'].includes(o.approvalStatus)).reduce((sum,o)=>sum+o.quantity,0);
const child=db=>db.schedules().find(s=>s.extraVesselTrip);

test('approval creates a real child trip and 6 of 8 seats are occupied, not 0 of 8',async()=>{
 const f=fixture();assert.equal(await f.save(f.state,5,'admin'),true);
 const trip=child(f.db),saved=f.db.state();
 assert.notEqual(trip.id,f.parent.id);assert.equal(trip.capacity,8);assert.equal(trip.status,'Open');
 assert.equal(booked(saved,trip.id),6);assert.equal(trip.capacity-booked(saved,trip.id),2);
 assert.equal(booked(saved,f.parent.id),4);assert.equal(f.db.row('excursion-schedule:'+day+':'+f.parent.id).revision,2);
 assert.equal(saved.orders[1].separateVessel,false);assert.equal(saved.orders[1].scheduleId,trip.id);
});
test('copies the combined itinerary, times and trip price, not the single-item order price',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const trip=child(f.db);
 for(const field of ['name','date','time','endTime','priceCents'])assert.equal(trip[field],f.parent[field]);
 assert.equal(trip.parentScheduleId,f.parent.id);assert.equal(trip.sharedGroup,'');assert.equal(trip.standardDaily,undefined);
 assert.equal(operations.scheduleCanServeRequest('Coral Garden Snorkeling',trip.name),true);
 assert.equal(operations.scheduleCanServeRequest('Turtle Snorkeling',trip.name),true);
});
test('never copies the original boat crew onto the extra boat',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const trip=child(f.db);
 assert.deepEqual(trip.crewIds,[]);assert.deepEqual(trip.guideIds,[]);assert.equal(trip.crewReplacementNeeded,true);
 assert.deepEqual(f.db.state().orders[1].schedule.crewIds,[]);
 assert.deepEqual(f.db.schedules().find(s=>s.id===f.parent.id).crewIds,['c1','c2','c3']);
});
test('preserves booking identity, room charges, payments and notifications',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const saved=f.db.state(),order=saved.orders[1];
 for(const field of ['id','name','quantity','adults','children','infants','cents','quotedCents','unitPriceCents','guest','room','stayId','accountId','phone','guestNotified','createdAt','excursionPayments'])assert.deepEqual(order[field],f.overflow[field],field);
 assert.deepEqual(saved.stays,f.state.stays);assert.equal(order.scheduleHistory.length,1);
});
test('admin-created overflow booking is promoted by the same atomic save',async()=>{
 const f=fixture();const previous=f.db.state();previous.orders.pop();f.db.put(stateKey,previous,5);
 f.state.orders[1].adminCreated=true;assert.equal(await f.save(f.state,5,'admin'),true);assert.ok(child(f.db));
});
test('already-approved legacy extra vessel becomes a separate row on refresh',async()=>{
 const f=fixture({legacy:true});f.db.put('excursion-standard-day:v3:'+day,{date:day},1);
 await defaultFor(f.db)(day);assert.ok(child(f.db));assert.equal(booked(f.db.state(),child(f.db).id),6);
});
test('repeated refresh does not duplicate trips or history',async()=>{
 const f=fixture({legacy:true});f.db.put('excursion-standard-day:v3:'+day,{date:day},1);const ensure=defaultFor(f.db);
 await ensure(day);const revision=f.db.row(stateKey).revision;await ensure(day);await ensure(day);
 assert.equal(f.db.schedules().length,2);assert.equal(f.db.state().orders[1].scheduleHistory.length,1);assert.equal(f.db.row(stateKey).revision,revision);
});
test('legacy bookings on the same extra vessel share a single capacity pool',async()=>{
 const f=fixture({legacy:true,quantity:3});f.state.orders.push({...clone(f.overflow),id:'EXC-SECOND',quantity:2});f.db.put(stateKey,f.state,5);
 await f.save(f.state,5,'migration');assert.equal(f.db.schedules().length,2);assert.equal(booked(f.db.state(),child(f.db).id),5);
});
test('different extra vessels create different trips with independent capacity',async()=>{
 const f=fixture({legacy:true,quantity:2});f.state.excursionResources.vessels.push({id:'v3',name:'THIRD',capacity:10,condition:'Available'});
 f.state.orders.push({...clone(f.overflow),id:'EXC-THIRD',quantity:3,overflowVesselId:'v3',schedule:{...f.overflow.schedule,vesselId:'v3'}});f.db.put(stateKey,f.state,5);
 await f.save(f.state,5,'migration');const trips=f.db.schedules().filter(s=>s.extraVesselTrip);assert.equal(trips.length,2);
 assert.deepEqual(trips.map(s=>[s.vesselId,booked(f.db.state(),s.id),s.capacity]).sort(),[['v2',2,8],['v3',3,10]]);
});
test('remaining seats can be filled without increasing the original boat count',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const trip=child(f.db),next=f.db.state();
 next.orders.push({id:'EXC-JOIN',kind:'excursion',scheduleId:trip.id,date:day,status:'Scheduled',approvalStatus:'Approved',quantity:2,cents:14000});
 assert.equal(await f.save(next,6,'guest'),true);assert.equal(booked(f.db.state(),trip.id),8);assert.equal(booked(f.db.state(),f.parent.id),4);
});
test('cancellation frees only the extra boat seats',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const next=f.db.state();next.orders[1].status='Cancelled';next.orders[1].cents=0;
 await f.save(next,6,'guest');assert.equal(booked(f.db.state(),child(f.db).id),0);assert.equal(booked(f.db.state(),f.parent.id),4);
});
test('new approval rejects a vessel too small for the group without changing database state',async()=>{
 const f=fixture({capacity:4});const before=f.db.row(stateKey).payload;
 await assert.rejects(f.save(f.state,5,'admin'),/capacity for 4/);assert.equal(f.db.row(stateKey).payload,before);assert.equal(f.db.schedules().length,1);
});
test('new approval requires a recorded vessel capacity',async()=>{
 const f=fixture();delete f.state.excursionResources.vessels[1].capacity;
 await assert.rejects(f.save(f.state,5,'admin'),/Set the passenger capacity/);assert.equal(f.db.schedules().length,1);
});
test('new approval refuses an unknown vessel',async()=>{
 const f=fixture();f.state.orders[1].overflowVesselId='unknown';await assert.rejects(f.save(f.state,5,'admin'),/valid extra vessel/);
});
test('new approval refuses an invalid end time',async()=>{
 const f=fixture();f.state.orders[1].schedule.endTime='07:00';await assert.rejects(f.save(f.state,5,'admin'),/departure and end time/);
});
test('new approval refuses a vessel occupied by an overlapping trip',async()=>{
 const f=fixture();f.db.put('excursion-schedule:'+day+':busy',{...f.parent,id:'busy',vesselId:'v2',time:'09:00',endTime:'10:00'});
 await assert.rejects(f.save(f.state,5,'admin'),/not available/);assert.equal(f.db.schedules().length,2);
});
test('adjacent non-overlapping trips do not block the extra vessel',async()=>{
 const f=fixture();f.db.put('excursion-schedule:'+day+':later',{...f.parent,id:'later',vesselId:'v2',time:'09:30',endTime:'11:00'});
 assert.equal(await f.save(f.state,5,'admin'),true);assert.equal(child(f.db).status,'Open');
});
test('maintenance vessel cannot receive a new approval',async()=>{
 const f=fixture();f.state.excursionResources.vessels[1].condition='Under maintenance';await assert.rejects(f.save(f.state,5,'admin'),/not available/);
});
test('legacy overlapping assignment is retained closed for review, not sold again',async()=>{
 const f=fixture({legacy:true});f.db.put('excursion-schedule:'+day+':busy',{...f.parent,id:'busy',vesselId:'v2'});
 await f.save(f.state,5,'migration');assert.equal(child(f.db).status,'Closed');assert.equal(booked(f.db.state(),child(f.db).id),6);
});
test('legacy over-capacity data does not inflate the physical vessel capacity',async()=>{
 const f=fixture({legacy:true,quantity:9,capacity:6});await f.save(f.state,5,'migration');assert.equal(child(f.db).capacity,6);assert.equal(child(f.db).status,'Closed');
});
test('private hire is not reopened for other guests',async()=>{
 const f=fixture({legacy:true});f.state.orders[1].privateBoatRequested=true;await f.save(f.state,5,'migration');assert.equal(child(f.db).privateTrip,true);assert.equal(child(f.db).status,'Closed');
});
for(const kind of ['Pending','Cancelled','Declined','Completed','Departed','past'])test(kind+' records are not reopened or migrated',async()=>{
 const f=fixture({legacy:true});const order=f.state.orders[1];
 if(['Pending','Declined'].includes(kind))order.approvalStatus=kind;else if(kind==='past')order.date='2026-09-18';else order.status=kind;
 f.db.put(stateKey,f.state,5);await f.save(f.state,5,'test');assert.equal(f.db.schedules().length,1);assert.equal(f.db.state().orders[1].scheduleId,f.parent.id);
});
test('a stale state revision creates neither an orphan trip nor duplicate passengers',async()=>{
 const f=fixture();f.db.put(stateKey,f.db.state(),6);assert.equal(await f.save(f.state,5,'admin'),false);assert.equal(f.db.schedules().length,1);assert.equal(f.db.state().orders[1].approvalStatus,'Pending');
});
test('a parent timetable revision race rejects the entire save',async()=>{
 const f=fixture();f.db.beforeBatch=()=>f.db.put('excursion-schedule:'+day+':'+f.parent.id,{...f.parent,time:'08:30'},3);
 assert.equal(await f.save(f.state,5,'admin'),false);assert.equal(f.db.schedules().length,1);assert.equal(f.db.state().orders[1].approvalStatus,'Pending');
});
test('a trip insertion failure rolls back the booking state update',async()=>{
 const f=fixture(),before=f.db.row(stateKey).payload;
 f.db.sql.exec("CREATE TRIGGER reject_extra BEFORE INSERT ON operation_records WHEN NEW.key LIKE 'excursion-schedule:%:extra-%' BEGIN SELECT RAISE(ABORT,'test insert failure'); END;");
 await assert.rejects(f.save(f.state,5,'admin'),/test insert failure/);assert.equal(f.db.row(stateKey).payload,before);
});
test('daily refresh retries a concurrent booking revision rather than duplicating rows',async()=>{
 const f=fixture({legacy:true});f.db.put('excursion-standard-day:v3:'+day,{date:day},1);
 f.db.beforeBatch=()=>f.db.put(stateKey,f.db.state(),6);await defaultFor(f.db)(day);assert.equal(f.db.schedules().length,2);assert.equal(booked(f.db.state(),child(f.db).id),6);
});
test('unrelated hotel state saves do not add excursion rows',async()=>{
 const f=fixture();f.state.orders=[];await f.save(f.state,5,'cashier');assert.equal(f.db.schedules().length,1);
});
test('incomplete legacy records do not block unrelated saves or invent capacity',async()=>{
 const f=fixture({legacy:true});delete f.state.excursionResources.vessels[1].capacity;f.db.put(stateKey,f.state,5);
 assert.equal(await f.save(f.state,5,'cashier'),true);assert.equal(f.db.schedules().length,1);
});
test('initial daily seed does not adopt an extra vessel as the regular repeated trip',async()=>{
 const f=fixture({legacy:true});await f.save(f.state,5,'migration');const trip=child(f.db);
 f.db.sql.prepare('DELETE FROM operation_records WHERE key=?').run('excursion-schedule:'+day+':'+f.parent.id);
 await defaultFor(f.db)(day);assert.equal(f.db.schedules().find(s=>s.id===trip.id).standardDaily,undefined);
 assert.equal(f.db.schedules().filter(s=>s.standardDaily).length,6);
});

test('a concurrent new timetable row forces a retry before the extra vessel is opened',async()=>{
 const f=fixture();f.db.beforeBatch=()=>f.db.put('excursion-schedule:'+day+':racing-trip',{...f.parent,id:'racing-trip',vesselId:'v2'});
 assert.equal(await f.save(f.state,5,'admin'),false);assert.equal(child(f.db),undefined);assert.equal(f.db.state().orders[1].approvalStatus,'Pending');
});
test('unmigratable legacy records do not increment the state revision on every refresh',async()=>{
 const f=fixture({legacy:true});delete f.state.excursionResources.vessels[1].capacity;f.db.put(stateKey,f.state,5);f.db.put('excursion-standard-day:v3:'+day,{date:day},1);
 const ensure=defaultFor(f.db);await ensure(day);await ensure(day);assert.equal(f.db.row(stateKey).revision,5);assert.equal(f.db.schedules().length,1);
});

// HTTP handler integration against the same SQLite store. Authentication and
// guide display are isolated; route validation, pricing and persistence are real.
const childPricing=load('lib/excursion-children.ts');
function routeFor(db){return load('app/api/excursion-schedules/route.ts',{
 '../../../lib/auth':{authDb:()=>db,currentUser:async()=>({role:'admin',userId:'admin',username:'admin'}),sameOrigin:()=>true,hasPermission:()=>true},
 '../../../lib/stays':{stayKey:stateKey,loadStays:async()=>({state:db.state(),revision:db.row(stateKey).revision})},
 '../../../lib/stay-login':{saveStayAccess:saveFor(db)},
 '../../../lib/excursion-children':childPricing,
 '../../../lib/excursion-default-schedule':{ensureStandardDailyExcursions:defaultFor(db)},
 '../../../lib/excursion-workflow':resources,
 '../../../lib/excursion-guides':{guideRuleFor:()=>({needsGuides:false})},
 '../../../lib/guest-catalog':{excursionDeparturePassed:()=>false},
 '../../../lib/excursion-services':{},
 '../../../lib/excursion-operations':operations
});}
const patch=body=>new Request('https://test.invalid/api/excursion-schedules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const walkin={action:'admin-booking',date:day,guestType:'walkin',guest:'Test guest',hotel:'Test hotel',phone:'+9601234567'};
test('approval HTTP handler returns the new trip ID, not the parent ID',async()=>{
 const f=fixture(),route=routeFor(f.db);
 const response=await route.PATCH(patch({requestId:'EXC-EXTRA',decision:'Approved',vesselId:'v2'}));
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 assert.equal(result.scheduleId,child(f.db).id);assert.equal(result.extraVesselTrip,true);
 assert.equal(booked(f.db.state(),result.scheduleId),6);
});
test('schedule GET returns a separate extra row with its real remaining seats',async()=>{
 const f=fixture({legacy:true});f.db.put('excursion-standard-day:v3:'+day,{date:day});
 const response=await routeFor(f.db).GET(new Request('https://test.invalid/api/excursion-schedules?date='+day));
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 const trip=result.schedules.find(s=>s.extraVesselTrip),original=result.schedules.find(s=>s.id===f.parent.id);
 assert.equal(trip.bookedPax,6);assert.equal(trip.remainingSeats,2);assert.equal(trip.isFull,false);
 assert.equal(original.bookedPax,4);assert.equal(original.extraVesselBookings.length,0);
});
test('Book guest HTTP handler can sell the last two extra-vessel seats',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const trip=child(f.db),route=routeFor(f.db);
 const response=await route.PATCH(patch({...walkin,scheduleId:trip.id,adults:2}));
 const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));
 assert.equal(result.booking.scheduleId,trip.id);assert.equal(result.booking.cents,14000);
 assert.equal(booked(f.db.state(),trip.id),8);assert.equal(booked(f.db.state(),f.parent.id),4);
});
test('Book guest rejects a full extra-vessel trip without assigning another vessel',async()=>{
 const f=fixture();await f.save(f.state,5,'admin');const trip=child(f.db),route=routeFor(f.db);
 assert.equal((await route.PATCH(patch({...walkin,scheduleId:trip.id,adults:2}))).status,201);
 const before=f.db.row(stateKey).payload;
 assert.equal((await route.PATCH(patch({...walkin,scheduleId:trip.id,adults:1}))).status,400);
 assert.equal(f.db.row(stateKey).payload,before);assert.equal(booked(f.db.state(),trip.id),8);
});
test('admin-booking HTTP handler creates an independently bookable extra trip',async()=>{
 const f=fixture(),route=routeFor(f.db);
 const response=await route.PATCH(patch({...walkin,scheduleId:f.parent.id,adults:3,vesselId:'v2'}));
 const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));
 assert.equal(result.booking.scheduleId,child(f.db).id);assert.equal(result.booking.extraVesselTrip,true);
 assert.equal(booked(f.db.state(),child(f.db).id),3);assert.equal(booked(f.db.state(),f.parent.id),4);
});
