import {authDb,currentUser,hashPassword,limit,sameOrigin} from '../../../lib/auth';
import {islandToday,validDate} from '../../../lib/guest-catalog';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {walkInExcursionProfile,walkInExcursionProfiles} from '../../../lib/walkin-excursion-access';

const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
const expiryFor=(departureDate:string)=>new Date(departureDate+'T23:59:59+05:00').toISOString();

async function uniqueUsername(){
 const db=authDb();
 for(let i=0;i<8;i++){
  const bytes=crypto.getRandomValues(new Uint8Array(4));
  const suffix=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').slice(0,7);
  const username='exc-'+suffix;
  const found=await db.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first<any>();
  if(!found)return username;
 }
 throw Error('Could not create a temporary username. Please try again.');
}
function temporaryPassword(){
 const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 const bytes=crypto.getRandomValues(new Uint8Array(10));
 return Array.from(bytes,b=>chars[b%chars.length]).join('');
}

export async function GET(){
 try{
  const user=await currentUser();
  if(user?.role==='guest'&&user.userId.startsWith('walkin-exc-')){
   const {state}=await loadStays(),profile=walkInExcursionProfile(state,user.userId);
   return Response.json({today:islandToday(),signedIn:!!profile?.active,profile:profile?.active?{name:profile.name,hotel:profile.hotel,room:profile.room,departureDate:profile.departureDate||''}:null},{headers:{'Cache-Control':'no-store'}});
  }
  return Response.json({today:islandToday(),signedIn:false},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load walk-in excursion access.'},{status:503});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403});
 try{
  const b=await r.json();
  const name=String(b.name||'').trim().replace(/\s+/g,' ').slice(0,100);
  const phone=cleanPhone(b.phone);
  const hotel=String(b.hotel||'').trim().replace(/\s+/g,' ').slice(0,150);
  const room=String(b.room||'').trim().slice(0,50),departureDate=String(b.departureDate||'');
  if(!name||!/^\+[1-9]\d{7,14}$/.test(phone)||!hotel||!validDate(departureDate)||departureDate<islandToday())throw Error('Enter your name, WhatsApp number, hotel or meeting location, and the date you are leaving Dhiffushi.');
  const ip=r.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('walkin-exc-account-ip:'+ip,8,3600000))throw Error('Too many temporary account requests. Please contact reception.');
  const {state,revision}=await loadStays();
  const existing=walkInExcursionProfiles(state).find((x:any)=>x.active===true&&x.phone===phone);
  if(existing)throw Error('An active temporary excursion login already exists for this WhatsApp number. Use your existing login or contact reception.');
  const username=await uniqueUsername(),password=temporaryPassword(),accountId='walkin-exc-'+crypto.randomUUID(),hash=await hashPassword(password),createdAt=new Date().toISOString();
  state.walkinExcursionAccounts??=[];
  const expiresAt=expiryFor(departureDate);
  state.walkinExcursionAccounts.push({accountId,username,name,phone,hotel,room,departureDate,active:true,createdAt,expiresAt});
  const plan={id:accountId,username,password,hash,name,retire:[]};
  const saved=await saveStayAccess(state,revision,'walkin-excursion-registration',plan);
  if(!saved)return Response.json({error:'Another update was saved at the same time. Please try again.'},{status:409});
  return Response.json({account:{username,password,name,departureDate,expiresAt}},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create temporary excursion login.'},{status:400});}
}
