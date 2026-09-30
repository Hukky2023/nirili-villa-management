import {limit,sameOrigin} from '../../../lib/auth';
import {islandToday} from '../../../lib/guest-catalog';
import {emitAdminNotification} from '../../../lib/admin-notifications';
import {BOOKING_PREFIX,buildBooking,loadBookings,loadSettings,saveRecord} from '../../../lib/water-sports';

// Public Nirili Water Sports booking (watersports.nirilihotels.com).
const headers={'Cache-Control':'no-store'};

export async function GET(){
 try{
  const {settings}=await loadSettings();
  const activities=settings.activities.filter(x=>x.active).map(({id,name,detail,durationMinutes,cents,pricingUnit,maxPeople})=>({id,name,detail,durationMinutes,cents,pricingUnit,maxPeople}));
  return Response.json({today:islandToday(),activities,operatedByPartner:settings.operatedBy==='partner'},{headers});
 }catch{return Response.json({error:'Water sports booking is temporarily unavailable. Please message us on WhatsApp.'},{status:503,headers});}
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await request.json();
  const {settings}=await loadSettings();
  const booking=buildBooking(body,settings,islandToday());
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('water-sports-ip:'+ip,8,3600000)||!await limit('water-sports-phone:'+booking.phone,5,3600000))throw Error('Too many booking requests. Please message us on WhatsApp.');
  // A repeated submit (double tap, retry) returns the booking already made.
  const existing=(await loadBookings()).find(x=>x.booking.token===booking.token);
  if(existing)return Response.json({booking:publicView(existing.booking)},{headers});
  if(!await saveRecord(BOOKING_PREFIX+booking.id,booking,0,'public:water-sports'))throw Error('Please try again in a moment.');
  try{await emitAdminNotification({id:'water-sports:new:'+booking.id,type:'water-sports',title:'New water sports booking',detail:booking.name+' · '+booking.activityName+' · '+booking.date+(booking.time?' '+booking.time:'')+' · '+booking.participants+' pax',ref:booking.id,url:'/home'});}catch{}
  return Response.json({booking:publicView(booking)},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not book.'},{status:400,headers});}
}

function publicView(b:any){
 return {id:b.id,activityName:b.activityName,date:b.date,time:b.time,participants:b.participants,quotedCents:b.quotedCents,status:b.status};
}
