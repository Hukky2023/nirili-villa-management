import {currentGuestUser,currentUser,hasPermission} from '../../../lib/auth';
import {loadStays,stayKey} from '../../../lib/stays';
import {readOperationalRecordPrimary} from '../../../lib/supabase-bridge';

const HOTEL_WHATSAPP='9609413977';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

function whatsappDigits(value:any){
 let digits=String(value||'').replace(/\D/g,'').replace(/^00/,'');
 if(digits.length===7)digits='960'+digits;
 return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
}

function stayWhatsApp(stay:any){
 const saved=stay?.whatsapp||stay?.phone||stay?.guests?.find((guest:any)=>guest?.phone)?.phone||'';
 return whatsappDigits(saved);
}

async function currentHotelState(){
 try{
  const primary=await readOperationalRecordPrimary(stayKey);
  if(primary?.payload)return primary.payload;
 }catch{}
 return (await loadStays()).state;
}

export async function GET(){
 const staff=await currentUser();
 const guest=staff?null:await currentGuestUser();
 const actor=staff||guest;
 if(!actor)return Response.json({error:'Sign in required.'},{status:403,headers});

 const state=await currentHotelState();
 const stays=Array.isArray(state?.stays)?state.stays:[];

 if(actor.role==='guest'){
  const stay=stays.find((item:any)=>item?.accountId===actor.userId&&item?.status==='In House');
  return Response.json({
   actor:{role:'guest',name:actor.displayName},
   hotelPhone:HOTEL_WHATSAPP,
   stay:stay?{id:String(stay.id||''),guest:String(stay.guest||actor.displayName||'Guest'),room:String(stay.room||'')}:null
  },{headers});
 }

 if(actor.role!=='admin'&&!hasPermission(actor,'guesthouse_reception')){
  return Response.json({error:'Reception access required.'},{status:403,headers});
 }

 const contacts=stays
  .filter((stay:any)=>stay?.status==='In House')
  .map((stay:any)=>({
   id:String(stay.id||''),
   guest:String(stay.guest||stay.guests?.[0]?.name||'Guest'),
   room:String(stay.room||''),
   phone:stayWhatsApp(stay)
  }))
  .sort((a:any,b:any)=>Number(a.room||999)-Number(b.room||999)||a.guest.localeCompare(b.guest));

 return Response.json({
  actor:{role:actor.role,name:actor.displayName},
  hotelPhone:HOTEL_WHATSAPP,
  contacts
 },{headers});
}
