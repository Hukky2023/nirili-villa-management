import {roomNumbers,roomDetails,updateRoomInventory} from './rooms';
import {paidBillStatus} from './bill-payment';
import {excursionFolioBill} from './excursion-billing';
import {authDb} from './auth';
import {readBill} from './restaurant-server';
import {total} from './restaurant';
import {reconcileRestaurantRoomBills} from './pos-room-billing';
import {readOperationalRecordsPrimaryByPrefix} from './supabase-bridge';
export const stayKey='hotel-stays-v1';
export const money=(n:number)=>'$'+(n/100).toFixed(2);
const excursionResetMarker='excursion-bookings-cleared-2026-09-17';
const excursionResetCutoff='2026-09-17T18:53:00.000Z';
const guestExcursionRequestResetMarker='guest-excursion-seat-requests-cleared-2026-09-18';
const guestExcursionRequestResetCutoff='2026-09-17T19:59:00.000Z';
const excursionResetMarker20260919='excursion-bookings-cleared-2026-09-19-063749z';
const excursionResetCutoff20260919='2026-09-19T06:37:49.000Z';
const crewCleanupMarker='excursion-crew-cleanup-2026-09-20-dhaain-sifaah-v1';
const normalizeCrew=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
function maldivesToday(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(type:string)=>parts.find((part:any)=>part.type===type)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
async function keepOnlyDhaainAndSifaahCrew(state:any,revision:number){
 state.dataResets??=[];
 if(state.dataResets.includes(crewCleanupMarker))return revision;
 const allowed=new Set(['dhaain','sifaah']);
 const resources=state.excursionResources||{vessels:[],crew:[],gopros:[],drones:[]};
 const allCrew=Array.isArray(resources.crew)?resources.crew:[];
 const keepCrew=allCrew.filter((member:any)=>allowed.has(normalizeCrew(member.username))||allowed.has(normalizeCrew(member.name)));
 const keepIds=new Set(keepCrew.map((member:any)=>String(member.id)));
 const keepNames=new Set(keepCrew.map((member:any)=>normalizeCrew(member.name)).filter(Boolean));
 resources.crew=keepCrew.map((member:any)=>({...member,active:true,removed:false}));
 state.excursionResources=resources;

 const today=maldivesToday();
 for(const order of state.orders||[]){
  if(order?.kind!=='excursion')continue;
  const orderDate=String(order.schedule?.date||order.date||'');
  if(!orderDate||orderDate<today||!order.schedule)continue;
  if(Array.isArray(order.schedule.crewIds))order.schedule.crewIds=order.schedule.crewIds.map(String).filter((id:string)=>keepIds.has(id));
  if(Array.isArray(order.schedule.guideIds))order.schedule.guideIds=order.schedule.guideIds.map(String).filter((id:string)=>keepIds.has(id));
  if(Array.isArray(order.schedule.crew))order.schedule.crew=order.schedule.crew.filter((name:any)=>keepNames.has(normalizeCrew(name)));
 }

 const db=authDb();
 const scheduleRows=(await db.prepare("SELECT key,payload,revision FROM operation_records WHERE key LIKE 'excursion-schedule:%'").all<any>()).results||[];
 const writes:any[]=[];
 for(const row of scheduleRows){
  let schedule:any;try{schedule=JSON.parse(row.payload||'{}')}catch{continue}
  if(!schedule?.date||String(schedule.date)<today)continue;
  const before=JSON.stringify(schedule);
  if(Array.isArray(schedule.crewIds))schedule.crewIds=schedule.crewIds.map(String).filter((id:string)=>keepIds.has(id));
  if(Array.isArray(schedule.guideIds))schedule.guideIds=schedule.guideIds.map(String).filter((id:string)=>keepIds.has(id));
  if(Array.isArray(schedule.crew))schedule.crew=schedule.crew.filter((name:any)=>keepNames.has(normalizeCrew(name)));
  if(JSON.stringify(schedule)!==before){
   schedule.updatedAt=new Date().toISOString();
   schedule.crewCleanupApplied=true;
   writes.push(db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(schedule),'system:'+crewCleanupMarker,row.key,Number(row.revision)||1));
  }
 }

 const staff=(await db.prepare("SELECT id,username,permissions FROM accounts WHERE role='staff'").all<any>()).results||[];
 for(const account of staff){
  let permissions:string[]=[];try{permissions=JSON.parse(account.permissions||'[]')}catch{}
  const isKept=allowed.has(normalizeCrew(account.username));
  const next=isKept?[...new Set([...permissions,'crew_location'])]:permissions.filter((permission:string)=>permission!=='crew_location');
  if(JSON.stringify(next)!==JSON.stringify(permissions))writes.push(db.prepare("UPDATE accounts SET permissions=? WHERE id=? AND role='staff'").bind(JSON.stringify(next),account.id));
 }

 state.dataResets.push(crewCleanupMarker);
 const payload=JSON.stringify(state);
 const stateWrite=revision===0
  ?db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,payload,'system:'+crewCleanupMarker)
  :db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,'system:'+crewCleanupMarker,stayKey,revision);
 const results=await db.batch([stateWrite,...writes]);
 return results[0]?.meta?.changes?revision+1:revision;
}
export function seedStays(){return {rooms:roomNumbers.map((number,i)=>({number,...roomDetails,status:i===5?'Cleaning':i===9?'Maintenance':i<4?'Occupied':'Available',note:''})),stays:['Qiao Mingzhi','Liu Yutong','Marco Rossi','Victoria Chen'].map((guest,i)=>({id:'NV-'+(1260+i),guest,room:String(101+i),billRoom:String(101+i),checkIn:'2026-09-'+(12+i),checkOut:'2026-09-'+(15+i),meal:i===2?'Full Board':i===3?'Half Board':'Bed & Breakfast',source:'Direct',pax:2,status:'In House',base:[18000,24000,40000,32000][i],initialPaid:[18000,10000,40000,0][i],extensions:[] as any[],payments:[] as any[],history:[] as any[]}))};}
function removeOrderRefs(state:any,removedIds:Set<string>){
 for(const stay of state.stays||[]){
  if(stay.paidBills&&typeof stay.paidBills==='object')for(const key of Object.keys(stay.paidBills))if(key.startsWith('Excursions:')&&removedIds.has(key.slice('Excursions:'.length)))delete stay.paidBills[key];
 }
}
function clearExistingExcursions(state:any){
 state.dataResets??=[];
 if(state.dataResets.includes(excursionResetMarker))return false;
 const removedIds=new Set<string>((state.orders||[]).filter((o:any)=>o.kind==='excursion'&&(!o.createdAt||o.createdAt<=excursionResetCutoff)).map((o:any)=>o.id));
 state.orders=(state.orders||[]).filter((o:any)=>!removedIds.has(o.id));
 removeOrderRefs(state,removedIds);
 state.dataResets.push(excursionResetMarker);
 return true;
}
function clearPreviousGuestExcursionRequests(state:any){
 state.dataResets??=[];
 if(state.dataResets.includes(guestExcursionRequestResetMarker))return false;
 const removedIds=new Set<string>((state.orders||[]).filter((o:any)=>o.kind==='excursion'&&o.source==='Guest schedule'&&o.seatRequest===true&&(!o.createdAt||o.createdAt<=guestExcursionRequestResetCutoff)).map((o:any)=>o.id));
 state.orders=(state.orders||[]).filter((o:any)=>!removedIds.has(o.id));
 removeOrderRefs(state,removedIds);
 state.dataResets.push(guestExcursionRequestResetMarker);
 return true;
}
function clearAllExcursionBookingsThrough20260919(state:any){
 state.dataResets??=[];
 if(state.dataResets.includes(excursionResetMarker20260919))return false;
 const removedIds=new Set<string>((state.orders||[])
  .filter((o:any)=>o.kind==='excursion'&&(!o.createdAt||o.createdAt<=excursionResetCutoff20260919))
  .map((o:any)=>o.id));
 state.orders=(state.orders||[]).filter((o:any)=>!removedIds.has(o.id));
 removeOrderRefs(state,removedIds);
 state.dataResets.push(excursionResetMarker20260919);
 return true;
}
function billableOrder(o:any,s:any){return o.stayId===s.id&&o.status!=='Cancelled'&&o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined';}
export async function loadStays(){
 const row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(stayKey).first<any>();
 const state=row?JSON.parse(row.payload):seedStays();state.requests??=[];state.orders??=[];state.posOrders??=[];
 let revision=row?.revision||0;
 const clearedOldExcursions=clearExistingExcursions(state),clearedSeatRequests=clearPreviousGuestExcursionRequests(state),clearedExcursions20260919=clearAllExcursionBookingsThrough20260919(state);
 if(clearedOldExcursions||clearedSeatRequests||clearedExcursions20260919){
  const payload=JSON.stringify(state),marker=clearedExcursions20260919?excursionResetMarker20260919:clearedSeatRequests?guestExcursionRequestResetMarker:excursionResetMarker,saved=revision===0
   ?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,payload,'system:'+marker).run()
   :await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,'system:'+marker,stayKey,revision).run();
  if(saved.meta.changes)revision+=1;
 }
 revision=await keepOnlyDhaainAndSifaahCrew(state,revision);
 reconcileRestaurantRoomBills(state);updateRoomInventory(state);return {state,revision};
}
function usesDemoLegacyFolio(s:any){return ['NV-1260','NV-1261','NV-1262','NV-1263'].includes(String(s?.id||''))&&['101','102','103','104'].includes(String(s?.billRoom||''));}
async function folioOverrides(room:string){
 const p='folio:'+room+':';
 const [d1,primary]=await Promise.all([
  authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(p+'%').all<any>(),
  readOperationalRecordsPrimaryByPrefix(p).catch(()=>[])
 ]);
 const byKey=new Map<string,any>();
 for(const row of d1.results||[])byKey.set(String(row.key),{revision:Number(row.revision)||0,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload});
 for(const row of primary||[]){const key=String(row.key),current=byKey.get(key);if(!current||Number(row.revision||0)>=Number(current.revision||0))byKey.set(key,{revision:Number(row.revision)||0,payload:row.payload});}
 return [...byKey.values()].map(row=>row.payload).filter(Boolean);
}
export async function folioFor(s:any,orders?:any[]){if(!usesDemoLegacyFolio(s)){const all=orders??(await loadStays()).state.orders;let bills=[...(s.posBills||[]),{department:'Accommodation',id:s.id,items:[[s.meal+' · '+s.checkIn+' to '+s.checkOut,1,s.base/100,0]],status:'Posted',totalCents:s.base},...all.filter((o:any)=>billableOrder(o,s)).map((o:any)=>o.kind==='excursion'?excursionFolioBill(o):({department:o.kind==='food'?'Restaurant':'Transfer',id:o.id,items:[[o.name,o.quantity,o.cents/100,0]],status:o.status,totalCents:o.cents})),...s.extensions.map((e:any)=>({department:'Accommodation',id:e.id,items:[['Stay extension · '+e.from+' to '+e.to,e.nights,e.cents/100,0]],status:'Posted',totalCents:e.cents}))];
const overrides=await folioOverrides(String(s.billRoom||s.room));
const overrideKey=(b:any)=>String(b.department)+':'+String(b.id);
const byKey=new Map(overrides.map((b:any)=>[overrideKey(b),b]));
bills=bills.map((b:any)=>{const o:any=byKey.get(overrideKey(b));if(!o)return b;byKey.delete(overrideKey(b));return {...b,...o,totalCents:o.status==='Cancelled'?0:Math.round(Number(o.total||0)*100)};});
for(const o of byKey.values() as any){bills.push({...o,totalCents:o.status==='Cancelled'?0:Math.round(Number(o.total||0)*100)});}
const totalCents=bills.reduce((n:number,b:any)=>n+Number(b.totalCents||0),0),paidCents=s.initialPaid+s.payments.reduce((n:number,p:any)=>n+p.cents,0);return {bills:bills.map((b:any)=>paidBillStatus(s,b)),totalCents,paidCents,balanceCents:totalCents-paidCents};}const overrides=await folioOverrides(String(s.billRoom));
const bill=(department:string,id:string,items:any[])=>overrides.find((x:any)=>x.department===department&&x.id===id)||{department,id,items,status:'Posted'};
const bills=[bill('Accommodation',s.id,[[s.meal+' · '+s.checkIn+' to '+s.checkOut,1,s.base/100,0]]),...await Promise.all(['RES-1048','RES-1061'].map(async id=>({...await readBill(s.billRoom,id),department:'Restaurant'}))),bill('Transfer','TRF-0784',[['Airport → Dhiffushi shared speedboat',2,70,0]]),bill('Excursions','EXC-0921',[['Turtle Snorkeling',2,50,0]]),bill('Excursions','EXC-0934',[['Coral Garden + Sandbank',2,60,0]])].map((b:any)=>({...b,totalCents:b.status==='Cancelled'?0:Math.round(total({...b,items:b.items.map((i:any)=>[i[0],i[1],i[2],i[3]||0])})*100)}));
bills.push(...(s.posBills||[]));
const guestOrders=orders??(await loadStays()).state.orders;
bills.push(...guestOrders.filter((o:any)=>billableOrder(o,s)).map((o:any)=>o.kind==='excursion'?excursionFolioBill(o):({department:o.kind==='food'?'Restaurant':'Transfer',id:o.id,items:[[o.name,o.quantity,o.cents/100,0]],status:o.status,totalCents:o.cents})));
for(const e of s.extensions)bills.push({department:'Accommodation',id:e.id,items:[['Stay extension · '+e.from+' to '+e.to,e.nights,e.cents/100,0]],status:'Posted',totalCents:e.cents});
const totalCents=bills.reduce((n:number,b:any)=>n+b.totalCents,0),paidCents=s.initialPaid+s.payments.reduce((n:number,p:any)=>n+p.cents,0);return {bills:bills.map((b:any)=>paidBillStatus(s,b)),totalCents,paidCents,balanceCents:totalCents-paidCents};}
export async function stayView(){const {state,revision}=await loadStays();return {...state,revision,stays:await Promise.all(state.stays.map(async(s:any)=>({...s,folio:await folioFor(s,state.orders)})))};}
