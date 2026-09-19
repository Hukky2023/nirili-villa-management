import {roomNumbers,roomDetails,updateRoomInventory} from './rooms';
import {paidBillStatus} from './bill-payment';
import {authDb} from './auth';
import {readBill} from './restaurant-server';
import {total} from './restaurant';
export const stayKey='hotel-stays-v1';
export const money=(n:number)=>'$'+(n/100).toFixed(2);
const excursionResetMarker='excursion-bookings-cleared-2026-09-17';
const excursionResetCutoff='2026-09-17T18:53:00.000Z';
const guestExcursionRequestResetMarker='guest-excursion-seat-requests-cleared-2026-09-18';
const guestExcursionRequestResetCutoff='2026-09-17T19:59:00.000Z';
const excursionResetMarker20260919='excursion-bookings-cleared-2026-09-19-063749z';
const excursionResetCutoff20260919='2026-09-19T06:37:49.000Z';
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
 const state=row?JSON.parse(row.payload):seedStays();state.requests??=[];state.orders??=[];
 let revision=row?.revision||0;
 const clearedOldExcursions=clearExistingExcursions(state),clearedSeatRequests=clearPreviousGuestExcursionRequests(state),clearedExcursions20260919=clearAllExcursionBookingsThrough20260919(state);
 if(clearedOldExcursions||clearedSeatRequests||clearedExcursions20260919){
  const payload=JSON.stringify(state),marker=clearedExcursions20260919?excursionResetMarker20260919:clearedSeatRequests?guestExcursionRequestResetMarker:excursionResetMarker,saved=revision===0
   ?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,payload,'system:'+marker).run()
   :await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,'system:'+marker,stayKey,revision).run();
  if(saved.meta.changes)revision+=1;
 }
 updateRoomInventory(state);return {state,revision};
}
export async function folioFor(s:any,orders?:any[]){if(s.legacyFolio===false||(s.accountId&&!s.legacyFolio)){const all=orders??(await loadStays()).state.orders;const bills=[...(s.posBills||[]),{department:'Accommodation',id:s.id,items:[[s.meal+' · '+s.checkIn+' to '+s.checkOut,1,s.base/100,0]],status:'Posted',totalCents:s.base},...all.filter((o:any)=>billableOrder(o,s)).map((o:any)=>({department:o.kind==='food'?'Restaurant':o.kind==='transfer'?'Transfer':'Excursions',id:o.id,items:[[o.name,o.quantity,o.cents/100,0]],status:o.status,totalCents:o.cents})),...s.extensions.map((e:any)=>({department:'Accommodation',id:e.id,items:[['Stay extension · '+e.from+' to '+e.to,e.nights,e.cents/100,0]],status:'Posted',totalCents:e.cents}))];const totalCents=bills.reduce((n:number,b:any)=>n+b.totalCents,0),paidCents=s.initialPaid+s.payments.reduce((n:number,p:any)=>n+p.cents,0);return {bills:bills.map((b:any)=>paidBillStatus(s,b)),totalCents,paidCents,balanceCents:totalCents-paidCents};}const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind('folio:'+s.billRoom+':%').all<any>();const overrides=rows.results.map((x:any)=>JSON.parse(x.payload));
const bill=(department:string,id:string,items:any[])=>overrides.find((x:any)=>x.department===department&&x.id===id)||{department,id,items,status:'Posted'};
const bills=[bill('Accommodation',s.id,[[s.meal+' · '+s.checkIn+' to '+s.checkOut,1,s.base/100,0]]),...await Promise.all(['RES-1048','RES-1061'].map(async id=>({...await readBill(s.billRoom,id),department:'Restaurant'}))),bill('Transfer','TRF-0784',[['Airport → Dhiffushi shared speedboat',2,70,0]]),bill('Excursions','EXC-0921',[['Turtle Snorkeling',2,50,0]]),bill('Excursions','EXC-0934',[['Coral Garden + Sandbank',2,60,0]])].map((b:any)=>({...b,totalCents:b.status==='Cancelled'?0:Math.round(total({...b,items:b.items.map((i:any)=>[i[0],i[1],i[2],i[3]||0])})*100)}));
bills.push(...(s.posBills||[]));
const guestOrders=orders??(await loadStays()).state.orders;
bills.push(...guestOrders.filter((o:any)=>billableOrder(o,s)).map((o:any)=>({department:o.kind==='food'?'Restaurant':o.kind==='transfer'?'Transfer':'Excursions',id:o.id,items:[[o.name,o.quantity,o.cents/100,0]],status:o.status,totalCents:o.cents})));
for(const e of s.extensions)bills.push({department:'Accommodation',id:e.id,items:[['Stay extension · '+e.from+' to '+e.to,e.nights,e.cents/100,0]],status:'Posted',totalCents:e.cents});
const totalCents=bills.reduce((n:number,b:any)=>n+b.totalCents,0),paidCents=s.initialPaid+s.payments.reduce((n:number,p:any)=>n+p.cents,0);return {bills:bills.map((b:any)=>paidBillStatus(s,b)),totalCents,paidCents,balanceCents:totalCents-paidCents};}
export async function stayView(){const {state,revision}=await loadStays();return {...state,revision,stays:await Promise.all(state.stays.map(async(s:any)=>({...s,folio:await folioFor(s,state.orders)})))};}
