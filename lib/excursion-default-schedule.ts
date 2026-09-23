import {authDb} from './auth';
import {loadStays} from './stays';
import {saveStayAccess} from './stay-login';
import {needsExtraVesselTrip} from './excursion-extra-vessels';
import {catalog,islandToday} from './guest-catalog';
import {fridayExcursionBlackout,normalizeExcursionName,standardExcursionTrips} from './excursion-operations';

const schedulePrefix='excursion-schedule:';
const markerPrefix='excursion-standard-day:v7:';

const slug=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const catalogIdPrice=(id:string)=>catalog.find((x:any)=>x.kind==='excursion'&&x.id===id)?.cents||0;
const sumPrices=(...ids:string[])=>ids.reduce((sum,id)=>sum+catalogIdPrice(id),0);

function priceForTrip(code:string){
 if(code==='trip1')return sumPrices('fishtank','sandbank');
 if(code==='trip2')return sumPrices('turtle','coral');
 if(code==='trip3')return sumPrices('sandbank','turtle');
 if(code==='trip4')return catalogIdPrice('shark-turtle')||sumPrices('shark','turtle');
 if(code==='trip5')return sumPrices('clownfish','manta');
 if(code==='trip6')return catalogIdPrice('dolphin-fishing-dinner')||sumPrices('dolphin','fishing');
 return 0;
}

export const standardDailyExcursions=standardExcursionTrips.map(trip=>({
 ...trip,
 sharedGroup:'',
 priceCents:priceForTrip(trip.code)
}));

async function seedStandardDailyExcursions(date:string){
 if(date<islandToday())return;
 const db=authDb(),markerKey=markerPrefix+date;
 const marker=await db.prepare('SELECT key FROM operation_records WHERE key=?').bind(markerKey).first<any>();
 if(marker)return;

 const [scheduleRows,stateRow]=await Promise.all([
  db.prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(schedulePrefix+date+':%').all<any>(),
  db.prepare("SELECT payload,revision FROM operation_records WHERE key='hotel-stays-v1'").first<any>()
 ]);
 const existing=(scheduleRows.results||[]).map((row:any)=>{try{return {...JSON.parse(row.payload),_key:row.key,_revision:Number(row.revision)||1}}catch{return null}}).filter(Boolean);
 let state:any={};try{state=stateRow?JSON.parse(stateRow.payload||'{}'):{};}catch{}
 const orders=Array.isArray(state.orders)?state.orders:[];
 const now=new Date().toISOString();

 // Migrate old standard rows. Unused legacy rows are removed; rows with bookings are
 // retained closed so existing guest history is never detached from its trip.
 for(const old of existing.filter((row:any)=>row.standardDaily===true&&!row.standardDailyVersion)){
  const canonical=standardDailyExcursions.find(trip=>trip.time===old.time&&(
   normalizeExcursionName(trip.name)===normalizeExcursionName(old.name)||
   (trip.code==='trip1'&&/fish\s*tank/i.test(old.name)&&/sand\s*bank|sandbank/i.test(old.name))||
   (trip.code==='trip2'&&/turtle/i.test(old.name)&&/coral/i.test(old.name))||
   (trip.code==='trip3'&&/sand\s*bank|sandbank/i.test(old.name)&&/turtle/i.test(old.name))||
   (trip.code==='trip4'&&/shark/i.test(old.name)&&/turtle/i.test(old.name))||
   (trip.code==='trip5'&&/clown\s*fish|clone\s*fish/i.test(old.name)&&/manta/i.test(old.name))||
   (trip.code==='trip6'&&/dolphin/i.test(old.name)&&/fishing/i.test(old.name))
  ));
  if(canonical)continue;
  const linked=orders.some((order:any)=>order.kind==='excursion'&&order.status!=='Cancelled'&&order.scheduleId===old.id&&(order.date||order.schedule?.date)===date);
  if(linked){
   const preserved={...old,status:'Closed',legacyStandard:true,notes:[old.notes,'Legacy schedule retained for existing bookings.'].filter(Boolean).join(' '),updatedAt:now};
   await db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=?').bind(JSON.stringify(preserved),'system:standard-daily-v7',old._key).run();
  }else{
   await db.prepare('DELETE FROM operation_records WHERE key=?').bind(old._key).run();
  }
 }

 // Refresh rows after legacy cleanup.
 const freshRows=await db.prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(schedulePrefix+date+':%').all<any>();
 const fresh=(freshRows.results||[]).map((row:any)=>{try{return {...JSON.parse(row.payload),_key:row.key,_revision:Number(row.revision)||1}}catch{return null}}).filter(Boolean);

 // Friday 11:00–13:30 is a hard no-excursion window.
 // Remove every auto-created trip that overlaps it. If bookings are already
 // attached, keep the bookings but return them to Awaiting Scheduling so Admin
 // can recreate them at an allowed Friday time.
 if(new Date(date+'T00:00:00Z').getUTCDay()===5){
  const blocked=fresh.filter((item:any)=>item.standardDaily===true&&fridayExcursionBlackout(date,item.time,item.endTime));
  if(blocked.length){
   const statements:any[]=[];
   let stateChanged=false;
   for(const row of blocked){
    const linkedOrders=orders.filter((order:any)=>order.kind==='excursion'&&order.status!=='Cancelled'&&order.scheduleId===row.id&&(order.date||order.schedule?.date)===date);
    for(const order of linkedOrders){
     order.previousFridaySchedule={id:row.id,date,time:row.time,endTime:row.endTime,name:row.name};
     order.status='Awaiting Scheduling';
     order.approvalStatus='Pending';
     order.unscheduledRequest=true;
     order.seatRequest=false;
     order.adminScheduled=false;
     order.autoConfirmed=false;
     order.guestNotified=false;
     order.preferredTime='';
     order.preferredEndTime='';
     order.rescheduleReason='Friday 11:00–13:30 excursion blackout';
     delete order.scheduleId;
     delete order.schedule;
     delete order.time;
     delete order.endTime;
     delete order.vesselId;
     delete order.overflowVesselId;
     stateChanged=true;
    }
    statements.push(db.prepare('DELETE FROM operation_records WHERE key=?').bind(row._key));
   }
   if(stateChanged&&stateRow){
    statements.push(
     db.prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key='hotel-stays-v1' AND revision=?")
      .bind(JSON.stringify(state),'system:friday-excursion-reschedule',Number(stateRow.revision)||0)
    );
   }
   const results=await db.batch(statements);
   if(stateChanged&&stateRow&&!results[results.length-1]?.meta?.changes)throw Error('Excursion bookings changed while applying the Friday blackout. Please refresh and try again.');
  }
 }

 for(const trip of standardDailyExcursions){
  if(fridayExcursionBlackout(date,trip.time,trip.endTime))continue;
  const matching=fresh.find((row:any)=>!row.extraVesselTrip&&!row.privateTrip&&row.time===trip.time&&(
   normalizeExcursionName(row.name)===normalizeExcursionName(trip.name)||
   (trip.code==='trip1'&&/fish\s*tank/i.test(row.name)&&/sand\s*bank|sandbank/i.test(row.name))||
   (trip.code==='trip2'&&/turtle/i.test(row.name)&&/coral/i.test(row.name))||
   (trip.code==='trip3'&&/sand\s*bank|sandbank/i.test(row.name)&&/turtle/i.test(row.name))||
   (trip.code==='trip4'&&/shark/i.test(row.name)&&/turtle/i.test(row.name))||
   (trip.code==='trip5'&&/clown\s*fish|clone\s*fish/i.test(row.name)&&/manta/i.test(row.name))||
   (trip.code==='trip6'&&/dolphin/i.test(row.name)&&/fishing/i.test(row.name))
  ));
  if(matching){
   const updated={...matching,name:trip.name,endTime:trip.endTime,sharedGroup:'',priceCents:matching.priceCents||trip.priceCents,standardDaily:true,standardDailyVersion:7,tripCode:trip.code,updatedAt:now};
   delete updated._key;delete updated._revision;
   await db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=?').bind(JSON.stringify(updated),'system:standard-daily-v7',matching._key).run();
   continue;
  }
  const id='std-v7-'+trip.code+'-'+slug(trip.name);
  const record={id,date,time:trip.time,endTime:trip.endTime,name:trip.name,capacity:6,priceCents:trip.priceCents,vesselId:'',crewIds:[],guideIds:[],status:'Open',notes:'',sharedGroup:'',standardDaily:true,standardDailyVersion:7,tripCode:trip.code,createdAt:now,updatedAt:now};
  await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(schedulePrefix+date+':'+id,JSON.stringify(record),'system:standard-daily-v7').run();
 }
 await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(markerKey,JSON.stringify({date,version:7,createdAt:now}),'system:standard-daily-v7').run();
}

/** Also upgrade already-approved extra vessels, even when the daily seed marker
 * exists. Deterministic trip IDs and the guarded save prevent duplicate rows. */
export async function ensureStandardDailyExcursions(date:string){
 await seedStandardDailyExcursions(date);
 if(date<islandToday())return;
 for(let attempt=0;attempt<3;attempt++){
  const {state,revision}=await loadStays();
  if(!(state.orders||[]).some((order:any)=>needsExtraVesselTrip(order,date)))return;
  if(await saveStayAccess(state,revision,'system:extra-vessel-trips',null,[],[],[],{extraVesselsOnly:true}))return;
 }
 throw Error('Excursion bookings changed during refresh. Please try again.');
}
