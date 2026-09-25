import {authDb,limit,sameOrigin} from '../../../lib/auth';
import {islandToday,nightly,plans,validDate} from '../../../lib/guest-catalog';
import {readOperationalRecordPrimary,submitPublicBookingRequest} from '../../../lib/supabase-bridge';
import {sendBookingReceivedEmail} from '../../../lib/booking-email';
import {createBookingManageToken} from '../../../lib/booking-manage';
import {normalizeTransportPlan} from '../../../lib/transport-plan';
import {emitAdminNotification} from '../../../lib/admin-notifications';

const headers={'Cache-Control':'no-store'};
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanPhone(value:any){return String(value||'').replace(/[\s()-]/g,'');}
function safeText(value:any,max:number){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
function nightsBetween(checkIn:string,checkOut:string){return (Date.parse(checkOut)-Date.parse(checkIn))/86400000;}

async function hotelState(){
 const row=await readOperationalRecordPrimary('hotel-stays-v1');
 if(!row?.payload)throw Error('Booking availability is temporarily unavailable.');
 return {state:row.payload,revision:Number(row.revision)||0};
}
function availability(state:any,checkIn:string,checkOut:string,pax:number){
 const rooms=Array.isArray(state?.rooms)?state.rooms:[];
 const stays=Array.isArray(state?.stays)?state.stays:[];
 return rooms.filter((room:any)=>{
  const capacity=Number(room.capacity)||3;
  if(room.status==='Maintenance'||capacity<pax)return false;
  return !stays.some((stay:any)=>stay.room===room.number&&stay.status!=='Checked Out'&&stay.status!=='Cancelled'&&stay.checkIn<checkOut&&stay.checkOut>checkIn);
 });
}

export async function GET(request:Request){
 try{
  const url=new URL(request.url),today=islandToday();
  const checkIn=url.searchParams.get('checkIn')||'';
  const checkOut=url.searchParams.get('checkOut')||'';
  const adults=Math.max(1,Math.min(3,Number(url.searchParams.get('adults')||1)));
  const children=Math.max(0,Math.min(2,Number(url.searchParams.get('children')||0)));
  const pax=adults+children;
  const base={today,plans:plans.map(plan=>({name:plan,nightlyCents:nightly(plan,Math.min(3,pax))}))};
  if(!checkIn||!checkOut)return Response.json(base,{headers});
  if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||pax<1||pax>3)return Response.json({...base,error:'Choose valid stay dates and up to 3 guests per room.'},{status:400,headers});
  const {state}=await hotelState();
  const rooms=availability(state,checkIn,checkOut,pax);
  const nights=nightsBetween(checkIn,checkOut);
  return Response.json({...base,availableRooms:rooms.length,nights,estimates:plans.map(plan=>({name:plan,totalCents:nightly(plan,pax)*nights,nightlyCents:nightly(plan,pax)}))},{headers});
 }catch{return Response.json({error:'Could not check room availability. Please try again.'},{status:503,headers});}
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body=await request.json();
  const guest=safeText(body.guest,100),phone=cleanPhone(body.phone),email=safeText(body.email,254).toLowerCase();
  const checkIn=String(body.checkIn||''),checkOut=String(body.checkOut||''),meal=String(body.meal||'');
  const adults=Number(body.adults),children=Number(body.children),pax=adults+children;
  const notes=safeText(body.notes,1000),token=String(body.token||''),transportPlan=normalizeTransportPlan(body.transportPlan,checkIn,checkOut);
  const today=islandToday(),nights=nightsBetween(checkIn,checkOut);
  if(!guest||!phonePattern.test(phone)||!email||!emailPattern.test(email))throw Error('Enter your name, WhatsApp number with country code, and a valid email address.');
  if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||!Number.isInteger(nights)||nights<1||nights>365)throw Error('Choose valid check-in and check-out dates.');
  if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>2||pax>3)throw Error('A room can accommodate up to 3 guests.');
  if(!plans.includes(meal))throw Error('Choose a valid meal plan.');
  if(!/^[a-f0-9-]{20,80}$/i.test(token))throw Error('Refresh the booking page and try again.');
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('public-booking-ip:'+ip,12,3600000)||!await limit('public-booking-phone:'+phone,5,3600000))throw Error('Too many booking requests. Please contact reception or try again later.');
  const {state}=await hotelState();
  const rooms=availability(state,checkIn,checkOut,pax);
  if(!rooms.length)return Response.json({error:'No rooms are currently available for these dates and guest count. Try different dates or contact reception.'},{status:409,headers});
  const estimate=nightly(meal,pax)*nights;
  const id='REQ-'+crypto.randomUUID().slice(0,8).toUpperCase(),manageToken=createBookingManageToken();
  const booking={
   id,token,manageToken,guest,whatsapp:phone,email,checkIn,checkOut,pax,adults,children,meal,notes,transportPlan,
   status:'Pending',source:'Guest booking website',createdAt:new Date().toISOString(),estimate
  };
  const result:any=await submitPublicBookingRequest(booking);
  const bookingRef=result?.id||id;
  let latest:any=null;try{latest=await readOperationalRecordPrimary('hotel-stays-v1')}catch{}
  const stored=latest?.payload?.requests?.find((request:any)=>request.id===bookingRef)||booking;
  const emailResult=await sendBookingReceivedEmail({email:stored.email||email,guest:stored.guest||guest,reference:bookingRef,checkIn:stored.checkIn||checkIn,checkOut:stored.checkOut||checkOut,meal:stored.meal||meal,pax:stored.pax||pax,totalCents:stored.estimate||estimate,manageToken:stored.manageToken||manageToken});
  // Keep Cloudflare D1 as the rollback mirror; failure here must not lose a successful Supabase request.
  try{
   if(latest?.payload)await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES('hotel-stays-v1',?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by")
    .bind(JSON.stringify(latest.payload),Number(latest.revision)||1,'public-booking-site').run();
  }catch{}
  if(!result?.duplicate)try{await emitAdminNotification({
   id:'hotel:new:'+bookingRef,type:'hotel',title:'New hotel booking',
   detail:guest+' · '+checkIn+' → '+checkOut+' · '+meal+' · '+pax+' guest'+(pax===1?'':'s'),
   ref:bookingRef,url:'/home'
  });}catch{}
  return Response.json({ok:true,id:bookingRef,duplicate:!!result?.duplicate,estimateCents:estimate,nights,email:emailResult},{status:201,headers});
 }catch(error){
  const message=error instanceof Error?error.message:'Could not send your booking request.';
  return Response.json({error:message},{status:400,headers});
 }
}
