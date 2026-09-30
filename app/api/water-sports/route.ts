import {currentUser,sameOrigin} from '../../../lib/auth';
import {islandToday} from '../../../lib/guest-catalog';
import {BOOKING_PREFIX,SETTINGS_KEY,applyAction,buildBooking,canManageWaterSports,cleanSettings,loadBookings,loadSettings,partnerMessage,readRecord,saveRecord,whatsappLink,type Booking} from '../../../lib/water-sports';

// Staff side of Nirili Water Sports: bookings list, forwarding to the partner, settings.
const headers={'Cache-Control':'no-store'};
const denied=()=>Response.json({error:'Water sports access is required.'},{status:403,headers});
const actor=(u:any)=>u?.displayName||u?.username||'staff';

export async function GET(){
 const user=await currentUser();
 if(!canManageWaterSports(user))return denied();
 try{
  const [{settings,revision},rows]=await Promise.all([loadSettings(),loadBookings()]);
  const bookings=rows.map(({booking,revision})=>({...booking,revision,partnerWhatsappLink:settings.partner.whatsapp?whatsappLink(settings.partner.whatsapp,partnerMessage(booking,settings.partner.name)):'',partnerMessage:partnerMessage(booking,settings.partner.name)}));
  return Response.json({today:islandToday(),settings,settingsRevision:revision,bookings,canEditSettings:user?.role==='admin'},{headers});
 }catch{return Response.json({error:'Could not load water sports.'},{status:503,headers});}
}

// Staff actions on one booking: forward, confirm, complete, cancel, note.
export async function PATCH(r:Request){
 const user=await currentUser();
 if(!canManageWaterSports(user)||!sameOrigin(r))return denied();
 try{
  const body:Record<string,any>=await r.json(),id=String(body.id||'');
  if(!/^WS-[A-Z0-9]{6}$/.test(id))throw Error('Booking not found.');
  const [row,{settings}]=await Promise.all([readRecord<Booking>(BOOKING_PREFIX+id),loadSettings()]);
  if(!row)return Response.json({error:'Booking not found.'},{status:404,headers});
  if(Number(body.revision)!==row.revision)return Response.json({error:'This booking changed. Refresh and try again.'},{status:409,headers});
  const next=applyAction(row.value,body,actor(user),settings);
  const revision=await saveRecord(BOOKING_PREFIX+id,next,row.revision,user!.userId);
  if(!revision)return Response.json({error:'This booking changed. Refresh and try again.'},{status:409,headers});
  return Response.json({booking:{...next,revision}},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update booking.'},{status:400,headers});}
}

// Staff take a booking by phone or at reception.
export async function POST(r:Request){
 const user=await currentUser();
 if(!canManageWaterSports(user)||!sameOrigin(r))return denied();
 try{
  const body:Record<string,any>=await r.json(),{settings}=await loadSettings();
  const booking=buildBooking({...body,token:crypto.randomUUID()},settings,islandToday(),'Staff');
  booking.history[0].by=actor(user);
  const revision=await saveRecord(BOOKING_PREFIX+booking.id,booking,0,user!.userId);
  if(!revision)throw Error('Please try again.');
  return Response.json({booking:{...booking,revision}},{status:201,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not add booking.'},{status:400,headers});}
}

// Admin: activities, prices and partner details.
export async function PUT(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Only Admin can change water sports settings.'},{status:403,headers});
 try{
  const body:Record<string,any>=await r.json(),settings=cleanSettings(body.settings);
  const {revision}=await loadSettings();
  if(Number(body.revision)!==revision)return Response.json({error:'Settings changed. Refresh and try again.'},{status:409,headers});
  const next=await saveRecord(SETTINGS_KEY,settings,revision,user.userId);
  if(!next)return Response.json({error:'Settings changed. Refresh and try again.'},{status:409,headers});
  return Response.json({settings,settingsRevision:next},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save settings.'},{status:400,headers});}
}
