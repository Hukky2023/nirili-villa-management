import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const source=fs.readFileSync(new URL('../app/api/crew-trip-requests/route.ts',import.meta.url),'utf8');
const compiled=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
const members=['sifaah','dhaain','areef'].map(id=>({id,accountId:id,username:id,name:id}));
const trip=(id,overrides={})=>({id,date:'2026-09-30',time:'07:00',endTime:'10:30',name:'Fish Tank Snorkeling',status:'Open',crewIds:members.map(m=>m.id),...overrides});

async function loadTrips(schedules,username='sifaah',orders){
 const saved={excursionResources:{crew:members,vessels:[]},orders:orders??schedules.map(s=>({kind:'excursion',scheduleId:s.id,date:s.date,quantity:4,status:'Confirmed',approvalStatus:'Approved'}))};
 const db={prepare(sql){return {bind(value){this.value=value;return this;},async all(){return {results:this.value==='excursion-schedule:%'?schedules.map(s=>({key:'excursion-schedule:'+s.date+':'+s.id,payload:JSON.stringify(s),revision:1})):[]};},async first(){return {payload:JSON.stringify(saved)};}};}};
 const context=vm.createContext({Response,Date,Map,Set,JSON,Number,String,Array,Error,authDb:()=>db,currentUser:async()=>({userId:username,username,role:'staff'}),hasPermission:(_u,p)=>p==='crew_location',excursionResources:s=>s.excursionResources,islandToday:()=> '2026-09-30',excursionDeparturePassed:(date,time)=>date<'2026-09-30'||date==='2026-09-30'&&time<='07:33'});
 vm.runInContext(compiled,context);
 const response=await vm.runInContext('GET()',context);
 assert.equal(response.status,200);
 return (await response.json()).trips;
}
for(const member of members)test(member.id+' sees the 07:00 Fish Tank trip at 07:33 without a Departed update',async()=>{
 const trips=await loadTrips([trip('fish')],member.id);
 assert.equal(trips.length,1);
 assert.equal(trips[0].tripNames[0],'Fish Tank Snorkeling');
 assert.equal(trips[0].pax,4);
});
test('late status updates do not hide today’s assigned trips even after their scheduled end',async()=>{
 const trips=await loadTrips([trip('early',{time:'05:00',endTime:'07:00',tripStatus:'Excursion scheduled'})]);
 assert.equal(trips.length,1);
});
test('future and departed trips remain visible; completed, cancelled, past and unassigned trips stay excluded',async()=>{
 const schedules=[
  trip('future',{date:'2026-10-01'}),
  trip('departed',{tripStatus:'Departed'}),
  trip('completed',{tripStatus:'Completed'}),
  trip('arrived',{tripStatus:'Arrived & Completed'}),
  trip('cancelled',{status:'Cancelled'}),
  trip('past',{date:'2026-09-29'}),
  trip('other',{crewIds:['another-crew']}),
 ];
 const trips=await loadTrips(schedules);
 assert.deepEqual(trips.flatMap(t=>t.scheduleIds).sort(),['departed','future']);
});
test('trips without confirmed passengers remain excluded',async()=>{
 const schedules=[trip('fish')];
 for(const orders of [[],[{kind:'excursion',scheduleId:'fish',date:'2026-09-30',quantity:4,approvalStatus:'Pending'}],[{kind:'excursion',scheduleId:'fish',date:'2026-09-30',quantity:4,status:'Cancelled'}]]){
  assert.equal((await loadTrips(schedules,'sifaah',orders)).length,0);
 }
});
