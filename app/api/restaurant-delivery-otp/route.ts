import {env} from 'cloudflare:workers';
import {authDb,limit,sameOrigin} from '../../../../lib/auth';

function normalizePhone(value:any){
 let digits=String(value||'').replace(/\D/g,'').replace(/^00/,'');
 if(digits.length===7)digits='960'+digits;
 return /^[1-9]\d{7,14}$/.test(digits)?'+'+digits:'';
}
function config(){
 const e=env as unknown as Record<string,string|undefined>;
 return {sid:e.TWILIO_ACCOUNT_SID||'',token:e.TWILIO_AUTH_TOKEN||'',service:e.TWILIO_VERIFY_SERVICE_SID||''};
}
async function twilio(path:string,body:URLSearchParams){
 const c=config();
 if(!c.sid||!c.token||!c.service)throw Error('OTP service is not configured yet.');
 const auth=btoa(c.sid+':'+c.token);
 const r=await fetch('https://verify.twilio.com/v2/Services/'+c.service+path,{method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},body});
 const data:any=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data?.message||'OTP service request failed.');
 return data;
}
export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403});
 try{
  const b=await r.json(),phone=normalizePhone(b.phone);
  if(!phone)throw Error('Enter a valid phone number.');
  const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(b.action==='send'){
   if(!await limit('restaurant-otp-phone:'+phone,5,3600000)||!await limit('restaurant-otp-ip:'+ip,20,3600000))throw Error('Too many OTP requests. Please try again later.');
   await twilio('/Verifications',new URLSearchParams({To:phone,Channel:'sms'}));
   return Response.json({ok:true});
  }
  if(b.action==='verify'){
   const code=String(b.code||'').trim();
   if(!/^\d{4,10}$/.test(code))throw Error('Enter the OTP code.');
   const data=await twilio('/VerificationCheck',new URLSearchParams({To:phone,Code:code}));
   if(data.status!=='approved')throw Error('Incorrect or expired OTP.');
   await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by')
    .bind('restaurant-delivery-verified:'+phone.replace(/\D/g,''),JSON.stringify({phone,verifiedAt:Date.now(),expiresAt:Date.now()+30*60*1000}),'restaurant-delivery-otp').run();
   return Response.json({ok:true,verified:true});
  }
  throw Error('Unsupported action.');
 }catch(e){return Response.json({error:e instanceof Error?e.message:'OTP verification failed.'},{status:400});}
}
