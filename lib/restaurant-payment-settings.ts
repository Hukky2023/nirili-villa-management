import {authDb} from './auth';

export type RestaurantPaymentSettings={
 usdToMvrRate:number;
 bankName:string;
 accountName:string;
 accountNumber:string;
 updatedAt:string;
 updatedBy:string;
};

const KEY='restaurant-payment-settings-v1';
const defaults:RestaurantPaymentSettings={
 usdToMvrRate:15.42,
 bankName:'',
 accountName:'',
 accountNumber:'',
 updatedAt:'',
 updatedBy:''
};

export async function loadRestaurantPaymentSettings():Promise<RestaurantPaymentSettings>{
 try{
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(KEY).first<any>();
  if(!row)return {...defaults};
  const value=JSON.parse(row.payload||'{}');
  const rate=Number(value.usdToMvrRate);
  return {
   usdToMvrRate:Number.isFinite(rate)&&rate>0?rate:defaults.usdToMvrRate,
   bankName:String(value.bankName||'').slice(0,120),
   accountName:String(value.accountName||'').slice(0,120),
   accountNumber:String(value.accountNumber||'').slice(0,120),
   updatedAt:String(value.updatedAt||''),
   updatedBy:String(value.updatedBy||'')
  };
 }catch{return {...defaults};}
}

export async function saveRestaurantPaymentSettings(input:any,by:string){
 const rate=Number(input?.usdToMvrRate);
 if(!Number.isFinite(rate)||rate<=0||rate>100)throw Error('Enter a valid USD to MVR exchange rate.');
 const settings:RestaurantPaymentSettings={
  usdToMvrRate:Math.round(rate*10000)/10000,
  bankName:String(input?.bankName||'').trim().slice(0,120),
  accountName:String(input?.accountName||'').trim().slice(0,120),
  accountNumber:String(input?.accountNumber||'').trim().slice(0,120),
  updatedAt:new Date().toISOString(),
  updatedBy:by
 };
 await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by").bind(KEY,JSON.stringify(settings),by).run();
 return settings;
}
