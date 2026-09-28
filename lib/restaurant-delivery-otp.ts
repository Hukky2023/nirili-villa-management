import {authDb} from './auth';

export async function deliveryPhoneConfirmed(value:any){
 let digits=String(value||'').replace(/\D/g,'').replace(/^00/,'');
 if(digits.length===7)digits='960'+digits;
 if(!/^[1-9]\d{7,14}$/.test(digits))return false;
 const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('restaurant-delivery-verified:'+digits).first<any>();
 if(!row)return false;
 try{
  const payload=JSON.parse(row.payload||'{}');
  return Number(payload.expiresAt)>Date.now();
 }catch{return false}
}
