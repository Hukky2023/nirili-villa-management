import {authDb} from './auth';
import {readOperationalRecordPrimary,saveOperationalRecordPrimary} from './supabase-bridge';

export type RestaurantPaymentSettings={
 usdToMvrRate:number;
 usdToEurRate:number;
 bankName:string;
 accountName:string;
 accountNumber:string;
 updatedAt:string;
 updatedBy:string;
 fxCheckedDate:string;
 fxFetchedAt:string;
 fxSource:string;
 mvrRateDate:string;
 eurRateDate:string;
};

const KEY='restaurant-payment-settings-v1';
const defaults:RestaurantPaymentSettings={
 usdToMvrRate:15.42,
 usdToEurRate:0,
 bankName:'',
 accountName:'',
 accountNumber:'',
 updatedAt:'',
 updatedBy:'',
 fxCheckedDate:'',
 fxFetchedAt:'',
 fxSource:'',
 mvrRateDate:'',
 eurRateDate:''
};

function maldivesToday(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
function positive(value:any,fallback=0){
 const n=Number(value);return Number.isFinite(n)&&n>0?n:fallback;
}
async function persist(settings:RestaurantPaymentSettings,by:string){
 let primary:any=null;try{primary=await readOperationalRecordPrimary(KEY);}catch{}
 let nextRevision=0,primaryAvailable=true;
 try{nextRevision=await saveOperationalRecordPrimary(KEY,settings,Number(primary?.revision)||0,by);}catch{primaryAvailable=false;}
 if(primaryAvailable){
  if(!nextRevision)throw Error('Payment settings changed. Reload and try again.');
  try{await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by").bind(KEY,JSON.stringify(settings),nextRevision,by).run();}catch{}
  return settings;
 }
 await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by").bind(KEY,JSON.stringify(settings),by).run();
 return settings;
}
export async function loadRestaurantPaymentSettings():Promise<RestaurantPaymentSettings>{
 try{
  let row:any=null;try{row=await readOperationalRecordPrimary(KEY);}catch{}if(!row)row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(KEY).first<any>();
  if(!row)return {...defaults};
  const value=typeof row.payload==='string'?JSON.parse(row.payload||'{}'):row.payload||{};
  return {
   usdToMvrRate:positive(value.usdToMvrRate,defaults.usdToMvrRate),
   usdToEurRate:positive(value.usdToEurRate,0),
   bankName:String(value.bankName||'').slice(0,120),
   accountName:String(value.accountName||'').slice(0,120),
   accountNumber:String(value.accountNumber||'').slice(0,120),
   updatedAt:String(value.updatedAt||''),
   updatedBy:String(value.updatedBy||''),
   fxCheckedDate:String(value.fxCheckedDate||''),
   fxFetchedAt:String(value.fxFetchedAt||''),
   fxSource:String(value.fxSource||''),
   mvrRateDate:String(value.mvrRateDate||''),
   eurRateDate:String(value.eurRateDate||'')
  };
 }catch{return {...defaults};}
}

async function onlineRate(quote:'EUR'|'MVR'){
 const response=await fetch('https://api.frankfurter.dev/v2/rate/usd/'+quote.toLowerCase(),{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('FX provider unavailable.');
 const data:any=await response.json();
 const rate=positive(data?.rate,0);
 if(!rate)throw Error('Invalid '+quote+' rate.');
 return {rate,date:String(data?.date||'')};
}

export async function refreshRestaurantFxRates(force=false):Promise<RestaurantPaymentSettings>{
 const current=await loadRestaurantPaymentSettings(),today=maldivesToday();
 if(!force&&current.fxCheckedDate===today)return current;
 let eur:any=null,mvr:any=null;
 try{[eur,mvr]=await Promise.all([onlineRate('EUR'),onlineRate('MVR')]);}
 catch{
  return current;
 }
 const next:RestaurantPaymentSettings={
  ...current,
  usdToEurRate:Math.round(eur.rate*1000000)/1000000,
  usdToMvrRate:Math.round(mvr.rate*1000000)/1000000,
  fxCheckedDate:today,
  fxFetchedAt:new Date().toISOString(),
  fxSource:'Frankfurter / official central-bank sources',
  eurRateDate:eur.date,
  mvrRateDate:mvr.date
 };
 return persist(next,'system-fx-daily');
}

export async function loadRestaurantPaymentSettingsWithDailyRates(){
 return refreshRestaurantFxRates(false);
}

export async function saveRestaurantPaymentSettings(input:any,by:string){
 const current=await loadRestaurantPaymentSettings();
 const mvrRate=Number(input?.usdToMvrRate),eurRate=Number(input?.usdToEurRate);
 if(!Number.isFinite(mvrRate)||mvrRate<=0||mvrRate>100)throw Error('Enter a valid USD to MVR exchange rate.');
 if(input?.usdToEurRate!==undefined&&(!Number.isFinite(eurRate)||eurRate<0||eurRate>10))throw Error('Enter a valid USD to EUR exchange rate.');
 const settings:RestaurantPaymentSettings={
  ...current,
  usdToMvrRate:Math.round(mvrRate*1000000)/1000000,
  usdToEurRate:input?.usdToEurRate===undefined?current.usdToEurRate:Math.round(eurRate*1000000)/1000000,
  bankName:String(input?.bankName||'').trim().slice(0,120),
  accountName:String(input?.accountName||'').trim().slice(0,120),
  accountNumber:String(input?.accountNumber||'').trim().slice(0,120),
  updatedAt:new Date().toISOString(),
  updatedBy:by
 };
 return persist(settings,by);
}
