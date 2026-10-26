import {env} from 'cloudflare:workers';
import {sameOrigin} from '../../../lib/auth';
import {loadTransport,updateTransport} from '../../../lib/transport-store';
import {operatorFromRequest,offers} from '../../../lib/travel-operators';

// Private licence storage: R2 when available, encrypted D1 fallback for Workers without an R2 binding.
const hexToBytes=(s:string)=>Uint8Array.from(s.match(/../g)||[],v=>parseInt(v,16));
async function licenceEncryptionKey(){
 const secret=String((env as unknown as Record<string,any>).NIRILI_CREDENTIAL_KEY||'');
 if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Private document encryption key is not configured.');
 return crypto.subtle.importKey('raw',hexToBytes(secret),'AES-GCM',false,['encrypt','decrypt']);
}
async function storeLicence(key:string,bytes:Uint8Array,mime:string){
 if(env.BUCKET){await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});return}
 if(!env.DB)throw Error('Private licence storage is not configured.');
 const encryptionKey=await licenceEncryptionKey(),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(key)},encryptionKey,bytes));
 const db=env.DB;
 await db.prepare('CREATE TABLE IF NOT EXISTS rental_licence_chunks (file_key TEXT NOT NULL, chunk_index INTEGER NOT NULL, iv TEXT, content BLOB NOT NULL, PRIMARY KEY(file_key,chunk_index))').run();
 const size=96000,statements=[];
 for(let at=0,i=0;at<cipher.length;at+=size,i++){
  const chunk=cipher.slice(at,at+size);
  statements.push(db.prepare('INSERT INTO rental_licence_chunks(file_key,chunk_index,iv,content) VALUES(?,?,?,?)').bind(key,i,i===0?Array.from(iv).map(x=>x.toString(16).padStart(2,'0')).join(''):null,chunk.buffer));
 }
 try{await db.batch(statements)}catch(e){await db.prepare('DELETE FROM rental_licence_chunks WHERE file_key=?').bind(key).run().catch(()=>{});throw e}
}
async function deleteLicence(key:string){
 if(env.BUCKET){await env.BUCKET.delete(key);return}
 if(env.DB)await env.DB.prepare('DELETE FROM rental_licence_chunks WHERE file_key=?').bind(key).run();
}
async function readLicence(key:string){
 if(env.BUCKET){const file=await env.BUCKET.get(key);return file?new Uint8Array(await file.arrayBuffer()):null}
 if(!env.DB)return null;
 const db=env.DB;
 const rows=await db.prepare('SELECT chunk_index,iv,content FROM rental_licence_chunks WHERE file_key=? ORDER BY chunk_index').bind(key).all<any>();
 if(!rows.results?.length)return null;
 const pieces=rows.results.map((r:any)=>new Uint8Array(r.content as ArrayBuffer));
 const cipher=new Uint8Array(pieces.reduce((n:number,c:Uint8Array)=>n+c.length,0));let pos=0;for(const piece of pieces){cipher.set(piece,pos);pos+=piece.length}
 const iv=hexToBytes(rows.results[0].iv);
 const keyCrypto=await licenceEncryptionKey();
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(key)},keyCrypto,cipher));
}

export const runtime='edge';
const headers={'Cache-Control':'no-store'};
type Unit={id:string;operatorId:string;operatorName:string;name:string;kind:'cycle'|'bicycle'|'buggy';qty:number;rateMvr:number;rates?:Record<string,number>;active:boolean;description:string};
type Rental={licenceKey?:string;licenceName?:string;licenceMime?:string;id:string;unitId:string;operatorId:string;name:string;contact:string;start:string;end:string;qty:number;amountMvr:number;status:'Requested'|'Confirmed'|'Cancelled'|'Completed';created:string;startAt?:string;endAt?:string;durationKey?:string};
type RentalLedger={units:Unit[];bookings:Rental[]};
const read=(s:any):RentalLedger=>{const v=s.islandRentals||{};return {units:Array.isArray(v.units)?v.units:[],bookings:Array.isArray(v.bookings)?v.bookings:[]}};
const dateOk=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const text=(v:any,n=120)=>String(v??'').trim().slice(0,n);
const interval=(day:string,time:string)=>new Date(day+'T'+time+':00+05:00').getTime();
const validTime=(x:any)=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
const available=(unit:Unit,rentals:Rental[],start:string,end:string,startTime?:string,endTime?:string)=>{
 const begin=validTime(startTime)?interval(start,startTime!):Date.parse(start+'T00:00:00Z');
 const finish=validTime(endTime)?interval(end,endTime!):Date.parse(end+'T23:59:59Z');
 return Math.max(0,unit.qty-rentals.filter(r=>r.unitId===unit.id&&['Requested','Confirmed'].includes(r.status)&&((r.startAt&&r.endAt)?Date.parse(r.startAt)<finish&&Date.parse(r.endAt)>begin:r.start<=end&&r.end>=start)).reduce((n,r)=>n+r.qty,0));
};
const json=(data:any,status=200)=>Response.json(data,{status,headers});
const sameRequest=(r:Request)=>{const origin=r.headers.get('origin');return !origin||origin===new URL(r.url).origin};
export async function GET(r:Request){
 try{
  const {state}=await loadTransport(),ledger=read(state),u=new URL(r.url);
  const start=u.searchParams.get('start')||'',end=u.searchParams.get('end')||start,startTime=u.searchParams.get('startTime')||'',endTime=u.searchParams.get('endTime')||'';
  if(start&&(!dateOk(start)||!dateOk(end)||end<start||Date.parse(end)-Date.parse(start)>31*86400000))return json({error:'Invalid rental dates.'},400);
  const units=ledger.units.filter(x=>x.active).map(x=>({id:x.id,name:x.name,kind:x.kind,operatorName:x.operatorName,rateMvr:x.rateMvr,rates:x.rates||{'1d':x.rateMvr},description:x.description,available:start?available(x,ledger.bookings,start,end,startTime,endTime):x.qty}));
  return json({units,connected:true});
 }catch{return json({error:'Rental inventory unavailable.'},503)}
}
export async function POST(r:Request){
 if(!sameOrigin(r)||Number(r.headers.get('content-length')||0)>4500000)return json({error:'Invalid or oversized request.'},403);
 const multipart=(r.headers.get('content-type')||'').toLowerCase().includes('multipart/form-data');
 let licence:File|null=null;
 let b:any;
 try{
  if(multipart){
   const form=await r.formData(),raw=form.get('booking');
   if(typeof raw!=='string'||raw.length>12000)return json({error:'Invalid booking information.'},400);
   b=JSON.parse(raw);
   const upload=form.get('licence');
   if(upload instanceof File)licence=upload;
  }else b=await r.json();
 }catch{return json({error:'Invalid payload'},400)}
 if(!b||typeof b!=='object')return json({error:'Invalid request'},400);
 if(b.action==='book'){
  if(!licence)return json({error:'Upload a driving licence file for this rental request.'},400);
  if(licence.size<1||licence.size>3*1024*1024)return json({error:'Licence file must be under 3 MB.'},400);
  const acceptable=['image/jpeg','image/png','image/webp','application/pdf'];
  if(!acceptable.includes(licence.type))return json({error:'Use a JPG, PNG, WebP or PDF licence file.'},400);
  const bytes=new Uint8Array(await licence.arrayBuffer()),prefix=Array.from(bytes.slice(0,12));
  const jpeg=prefix[0]===255&&prefix[1]===216&&prefix[2]===255;
  const png=prefix.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
  const pdf=prefix.slice(0,5).join(',')==='37,80,68,70,45';
  const webp=String.fromCharCode(...prefix.slice(0,4))==='RIFF'&&String.fromCharCode(...prefix.slice(8,12))==='WEBP';
  if(!(licence.type==='image/jpeg'&&jpeg||licence.type==='image/png'&&png||licence.type==='application/pdf'&&pdf||licence.type==='image/webp'&&webp))return json({error:'The licence file does not match its format.'},400);
  if(!env.BUCKET&&!env.DB)return json({error:'Private licence storage is not configured. Please contact Nirili Management.'},503);
  const unitId=text(b.unitId,90),start=text(b.start,10),end=text(b.end,10),qty=Number(b.qty),name=text(b.name,100),contact=text(b.contact,150);
  const durationKey=text(b.durationKey,10),startTime=text(b.startTime,5),endTime=text(b.endTime,5);
  const hourDurations:Record<string,number>={'1h':1,'2h':2,'5h':5,'12h':12};const dayDurations:Record<string,number>={'1d':1,'2d':2,'3d':3};
  const isHour=Object.prototype.hasOwnProperty.call(hourDurations,durationKey);
  const isKnown=durationKey===''||isHour||Object.prototype.hasOwnProperty.call(dayDurations,durationKey);
  if(!isKnown||durationKey&&(!validTime(startTime)||!validTime(endTime)))return json({error:'Select a valid rental duration and pickup time.'},400);
  if(durationKey){
   const hours=isHour?hourDurations[durationKey]:dayDurations[durationKey]*24;
   if(interval(end,endTime)-interval(start,startTime)!==hours*3600000)return json({error:'Rental end must match the selected duration.'},400);
  }
  if(!dateOk(start)||!dateOk(end)||end<start||Date.parse(end)-Date.parse(start)>31*86400000||start<new Date().toISOString().slice(0,10)||!Number.isInteger(qty)||qty<1||qty>10||name.length<2||contact.length<5)return json({error:'Check the rental dates, quantity, name and contact.'},400);
  const licenceKey='private/rental-licences/'+crypto.randomUUID();
  try{await storeLicence(licenceKey,bytes,licence.type)}
  catch{return json({error:'Could not securely store the licence file.'},503)}
  try{
   const {result}=await updateTransport('public:island-rental',(s:any)=>{
    const v=read(s),unit=v.units.find(x=>x.id===unitId&&x.active);
    if(!unit)throw Error('This rental is unavailable.');
    if(available(unit,v.bookings,start,end,startTime,endTime)<qty)throw Error('Not enough vehicles available for these dates.');
    const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
    const price=durationKey?Number(unit.rates?.[durationKey]||0):days*unit.rateMvr;
    if(durationKey&&(!Number.isInteger(price)||price<=0))throw Error('This rental duration is not offered by the operator.');
    const booking:Rental={id:'RENT-'+crypto.randomUUID().slice(0,8).toUpperCase(),unitId,operatorId:unit.operatorId,name,contact,start,end,qty,amountMvr:price*qty,status:'Requested',created:new Date().toISOString(),licenceKey,licenceName:text(licence.name,130),licenceMime:licence.type,...(durationKey?{durationKey,startAt:new Date(interval(start,startTime)).toISOString(),endAt:new Date(interval(end,endTime)).toISOString()}: {})};
    v.bookings.push(booking);s.islandRentals=v;
    return {reference:booking.id,status:booking.status,totalMvr:booking.amountMvr};
   });
   return json(result,201);
  }catch(e){await deleteLicence(licenceKey).catch(()=>{});return json({error:e instanceof Error?e.message:'Could not create rental request.'},409)}
 }
 const operator=await operatorFromRequest(r);
 if(!operator||!offers(operator,'boat'))return json({error:'Sign in with an approved operator account.'},401);
 if(b.action==='licence-file'){
  const id=text(b.id,90),{state}=await loadTransport(),booking=read(state).bookings.find(x=>x.id===id&&x.operatorId===operator.id);
  if(!booking?.licenceKey)return json({error:'Licence file not found.'},404);
  const file=await readLicence(booking.licenceKey);
  if(!file)return json({error:'Licence file not available.'},404);
  return new Response(file,{headers:{'Content-Type':booking.licenceMime||'application/octet-stream','Content-Disposition':'attachment; filename="rental-licence"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(b.action==='list'){
  const {state}=await loadTransport(),v=read(state);
  return json({units:v.units.filter(x=>x.operatorId===operator.id),bookings:v.bookings.filter(x=>x.operatorId===operator.id).map(({licenceKey,...x})=>({...x,hasLicence:!!licenceKey}))});
 }
 if(b.action==='save-unit'){
  const x=b.unit||{},id=text(x.id,90),name=text(x.name,80),kind=x.kind,qty=Number(x.qty),rateMvr=Number(x.rateMvr);
  const keys=['1h','2h','5h','12h','1d','2d','3d'];const raw=x.rates&&typeof x.rates==='object'?x.rates:null;
  const rates=Object.fromEntries(keys.map(k=>[k,raw?.[k]===undefined?(k==='1d'?rateMvr:0):Number(raw[k])]));
  if(Object.values(rates).some(v=>!Number.isInteger(v as number)||(v as number)<0||(v as number)>100000))return json({error:'Enter valid rental rates in MVR for all durations.'},400);
  if(!name||!['cycle','bicycle','buggy'].includes(kind)||!Number.isInteger(qty)||qty<0||qty>500||!Number.isInteger(rateMvr)||rateMvr<0||rateMvr>100000)return json({error:'Enter a name, type, quantity and daily rate in MVR.'},400);
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