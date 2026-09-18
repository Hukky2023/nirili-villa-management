import {authDb} from './auth';
import {catalog,islandToday} from './guest-catalog';
import {normalizeExcursionName,standardExcursionTrips} from './excursion-operations';

const schedulePrefix='excursion-schedule:';
const markerPrefix='excursion-standard-day:v3:';

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

export async function ensureStandardDailyExcursions(date:string){
 if(date<islandToday())return;
 const db=authDb(),markerKey=markerPrefix+date;
 const marker=await db.prepare('SELECT key FROM operation_records WHERE key=?').bind(markerKey).first<any>();
 if(marker)return;

 const [scheduleRows,stateRow]=await Promise.all([
  db.prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(schedulePrefix+date+':%').all<any>(),
  db.prepare("SELECT payload FROM operation_records WHERE key='hotel-stays-v1'").first<any>()
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
   await db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=?').bind(JSON.stringify(preserved),'system:standard-daily-v3',old._key).run();
  }else{
   await db.prepare('DELETE FROM operation_records WHERE key=?').bind(old._key).run();
  }
 }

 // Refresh rows after legacy cleanup.
 const freshRows=await db.prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(schedulePrefix+date+':%').all<any>();
 const fresh=(freshRows.results||[]).map((row:any)=>{try{return {...JSON.parse(row.payload),_key:row.key,_revision:Number(row.revision)||1}}catch{return null}}).filter(Boolean);

 for(const trip of standardDailyExcursions){
  const matching=fresh.find((row:any)=>row.time===trip.time&&(
   normalizeExcursionName(row.name)===normalizeExcursionName(trip.name)||
   (trip.code==='trip1'&&/fish\s*tank/i.test(row.name)&&/sand\s*bank|sandbank/i.test(row.name))||
   (trip.code==='trip2'&&/turtle/i.test(row.name)&&/coral/i.test(row.name))||
   (trip.code==='trip3'&&/sand\s*bank|sandbank/i.test(row.name)&&/turtle/i.test(row.name))||
   (trip.code==='trip4'&&/shark/i.test(row.name)&&/turtle/i.test(row.name))||
   (trip.code==='trip5'&&/clown\s*fish|clone\s*fish/i.test(row.name)&&/manta/i.test(row.name))||
   (trip.code==='trip6'&&/dolphin/i.test(row.name)&&/fishing/i.test(row.name))
  ));
  if(matching){
   const updated={...matching,name:trip.name,endTime:trip.endTime,sharedGroup:'',priceCents:matching.priceCents||trip.priceCents,standardDaily:true,standardDailyVersion:3,tripCode:trip.code,updatedAt:now};
   delete updated._key;delete updated._revision;
   await db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=?').bind(JSON.stringify(updated),'system:standard-daily-v3',matching._key).run();
   continue;
  }
  const id='std-v3-'+trip.code+'-'+slug(trip.name);
  const record={id,date,time:trip.time,endTime:trip.endTime,name:trip.name,capacity:6,priceCents:trip.priceCents,vesselId:'',crewIds:[],guideIds:[],status:'Open',notes:'',sharedGroup:'',standardDaily:true,standardDailyVersion:3,tripCode:trip.code,createdAt:now,updatedAt:now};
  await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(schedulePrefix+date+':'+id,JSON.stringify(record),'system:standard-daily-v3').run();
 }
 await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(markerKey,JSON.stringify({date,version:3,createdAt:now}),'system:standard-daily-v3').run();
}
