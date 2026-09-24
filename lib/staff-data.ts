import {hasPermission,type Actor} from './auth';
// Keep service-specific work usable without returning booking bearer tokens,
// passport documents, private notes or unrelated financial records.
const pick=(row:any,keys:string[])=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
function redactTokens(value:any):any{
 if(Array.isArray(value))return value.map(redactTokens);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['manageToken','token','password','password_hash','salt','setupCode'].includes(key)).map(([key,v])=>[key,redactTokens(v)]));
}
export function staffData(user:Actor,data:any){
 if(user.role==='admin'||hasPermission(user,'guesthouse_reception'))return data;
 if(hasPermission(user,'edit_bills'))return redactTokens(data);
 const excursion=hasPermission(user,'excursions_manager')||hasPermission(user,'edit_excursions');
 const transfer=hasPermission(user,'edit_transfers');
 const orders=(data.orders||[]).filter((o:any)=>o.kind==='excursion'?excursion:o.kind==='transfer'?transfer:false);
 return {
  revision:data.revision,canSchedule:excursion,
  resources:excursion?redactTokens(data.resources):undefined,
  crewOptions:excursion?data.crewOptions:[],
  catalog:(data.catalog||[]).filter((o:any)=>o.kind==='excursion'?excursion:o.kind==='transfer'?transfer:false),
  rooms:(data.rooms||[]).map((r:any)=>pick(r,['number','type','capacity','status'])),
  stays:(data.stays||[]).map((s:any)=>pick(s,['id','accountId','guest','room','checkIn','checkOut','pax','adults','children','status','whatsapp','phone','meal'])),
  orders:redactTokens(orders),requests:[],bookingChanges:[],
  excursionChanges:excursion?redactTokens(data.excursionChanges||[]):[],
 };
}
