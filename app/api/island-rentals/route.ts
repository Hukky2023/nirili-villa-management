import {sameOrigin} from '../../../lib/auth';
import {loadTransport,updateTransport} from '../../../lib/transport-store';
import {operatorFromRequest,offers} from '../../../lib/travel-operators';

export const runtime='edge';
const headers={'Cache-Control':'no-store'};
type Unit={id:string;operatorId:string;operatorName:string;name:string;kind:'cycle'|'bicycle';qty:number;rateMvr:number;rates?:Record<string,number>;active:boolean;description:string};
type Rental={id:string;unitId:string;operatorId:string;name:string;contact:string;start:string;end:string;qty:number;amountMvr:number;status:'Requested'|'Confirmed'|'Cancelled'|'Completed';created:string};
type RentalLedger={units:Unit[];bookings:Rental[]};
const read=(s:any):RentalLedger=>{const v=s.islandRentals||{};return {units:Array.isArray(v.units)?v.units:[],bookings:Array.isArray(v.bookings)?v.bookings:[]}};
const dateOk=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const text=(v:any,n=120)=>String(v??'').trim().slice(0,n);
const available=(unit:Unit,rentals:Rental[],start:string,end:string)=>Math.max(0,unit.qty-rentals.filter(r=>r.unitId===unit.id&&['Requested','Confirmed'].includes(r.status)&&r.start<=end&&r.end>=start).reduce((n,r)=>n+r.qty,0));
const json=(data:any,status=200)=>Response.json(data,{status,headers});
const sameRequest=(r:Request)=>{const origin=r.headers.get('origin');return !origin||origin===new URL(r.url).origin};
export async function GET(r:Request){
 try{
  const {state}=await loadTransport(),ledger=read(state),u=new URL(r.url);
  const start=u.searchParams.get('start')||'',end=u.searchParams.get('end')||start;
  if(start&&(!dateOk(start)||!dateOk(end)||end<start||Date.parse(end)-Date.parse(start)>31*86400000))return json({error:'Invalid rental dates.'},400);
  const units=ledger.units.filter(x=>x.active).map(x=>({id:x.id,name:x.name,kind:x.kind,operatorName:x.operatorName,rateMvr:x.rateMvr,rates:x.rates||{'1d':x.rateMvr},description:x.description,available:start?available(x,ledger.bookings,start,end):x.qty}));
  return json({units,connected:true});
 }catch{return json({error:'Rental inventory unavailable.'},503)}
}
export async function POST(r:Request){
 if(!sameOrigin(r)||Number(r.headers.get('content-length')||0)>12000)return json({error:'Invalid request.'},403);
 let b:any;try{b=await r.json()}catch{return json({error:'Invalid payload'},400)}
 if(!b||typeof b!=='object')return json({error:'Invalid request'},400);
 if(b.action==='book'){
  const unitId=text(b.unitId,90),start=text(b.start,10),end=text(b.end,10),qty=Number(b.qty),name=text(b.name,100),contact=text(b.contact,150);
  if(!dateOk(start)||!dateOk(end)||end<start||Date.parse(end)-Date.parse(start)>31*86400000||start<new Date().toISOString().slice(0,10)||!Number.isInteger(qty)||qty<1||qty>10||name.length<2||contact.length<5)return json({error:'Check the rental dates, quantity, name and contact.'},400);
  try{
   const {result}=await updateTransport('public:island-rental',(s:any)=>{
    const v=read(s),unit=v.units.find(x=>x.id===unitId&&x.active);
    if(!unit)throw Error('This rental is unavailable.');
    if(available(unit,v.bookings,start,end)<qty)throw Error('Not enough vehicles available for these dates.');
    const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
    const booking:Rental={id:'RENT-'+crypto.randomUUID().slice(0,8).toUpperCase(),unitId,operatorId:unit.operatorId,name,contact,start,end,qty,amountMvr:days*unit.rateMvr*qty,status:'Requested',created:new Date().toISOString()};
    v.bookings.push(booking);s.islandRentals=v;
    return {reference:booking.id,status:booking.status,totalMvr:booking.amountMvr};
   });
   return json(result,201);
  }catch(e){return json({error:e instanceof Error?e.message:'Could not create rental request.'},409)}
 }
 const operator=await operatorFromRequest(r);
 if(!operator||!offers(operator,'boat'))return json({error:'Sign in with an approved operator account.'},401);
 if(b.action==='list'){
  const {state}=await loadTransport(),v=read(state);
  return json({units:v.units.filter(x=>x.operatorId===operator.id),bookings:v.bookings.filter(x=>x.operatorId===operator.id)});
 }
 if(b.action==='save-unit'){
  const x=b.unit||{},id=text(x.id,90),name=text(x.name,80),kind=x.kind,qty=Number(x.qty),rateMvr=Number(x.rateMvr);
  const keys=['1h','2h','5h','12h','1d','2d','3d'];const raw=x.rates&&typeof x.rates==='object'?x.rates:null;
  const rates=Object.fromEntries(keys.map(k=>[k,raw?.[k]===undefined?(k==='1d'?rateMvr:0):Number(raw[k])]));
  if(Object.values(rates).some(v=>!Number.isInteger(v as number)||(v as number)<0||(v as number)>100000))return json({error:'Enter valid rental rates in MVR for all durations.'},400);
  if(!name||!['cycle','bicycle'].includes(kind)||!Number.isInteger(qty)||qty<0||qty>500||!Number.isInteger(rateMvr)||rateMvr<0||rateMvr>100000)return json({error:'Enter a name, type, quantity and daily rate in MVR.'},400);
  try{const {result}=await updateTransport('operator:rental:'+operator.id,(s:any)=>{
   const v=read(s),old=v.units.find(x=>x.id===id&&x.operatorId===operator.id);
   if(id&&!old)throw Error('Rental item not found.');
   const updated:Unit={id:old?.id||'UNIT-'+crypto.randomUUID().slice(0,8).toUpperCase(),operatorId:operator.id,operatorName:operator.name,name,kind,qty,rateMvr,rates,active:x.active!==false,description:text(x.description,350)};
   if(old){const max=v.bookings.filter(r=>r.unitId===old.id&&['Requested','Confirmed'].includes(r.status)).reduce((n,r)=>Math.max(n,r.qty),0);if(qty<max)throw Error('This item has active reservations.');v.units=v.units.map(u=>u.id===old.id?updated:u)}else v.units.push(updated);
   s.islandRentals=v;return {item:updated};
  });return json(result)}catch(e){return json({error:e instanceof Error?e.message:'Unable to save item.'},409)}
 }
 if(b.action==='update-booking'){
  const id=text(b.id,90),status=text(b.status,30);
  if(!['Requested','Confirmed','Cancelled','Completed'].includes(status))return json({error:'Invalid status'},400);
  try{const {result}=await updateTransport('operator:rental:'+operator.id,(s:any)=>{const v=read(s),r=v.bookings.find(x=>x.id===id&&x.operatorId===operator.id);if(!r)throw Error('Booking not found.');if(r.status==='Completed'||r.status==='Cancelled')throw Error('This booking is already closed.');r.status=status as Rental['status'];s.islandRentals=v;return {id:r.id,status:r.status}});return json(result)}catch(e){return json({error:e instanceof Error?e.message:'Unable to update booking.'},409)}
 }
 return json({error:'Unsupported rental action'},400);
}