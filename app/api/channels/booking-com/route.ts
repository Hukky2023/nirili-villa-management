import {currentUser,sameOrigin} from '../../../../lib/auth';
import {
  bootstrapBookingComProduction,
  fullSyncBookingComAri,
  bootstrapBookingComStaging,
  discoverBookingComMappings,
  ensureBookingComStagingRoomTypes,
  ensureBookingComWebhook,
  getBookingComCertificationState,
  bootstrapBookingComCertification,
  runBookingComCertificationScenario,
  getBookingComChannelState,
  previewBookingComAvailability,
  pullBookingComFeed,
  pushBookingComAvailability,
  runBookingComSelfTest,
  saveBookingComMappings,
  testBookingComConnection,
  updateBookingComConnection
} from '../../../../lib/channels';

const headers={'Cache-Control':'private, no-store, max-age=0'};

async function admin(){
  const user=await currentUser();
  if(!user||user.role!=='admin')return null;
  return user;
}

export async function GET(){
  if(!await admin())return Response.json({error:'Admin access required.'},{status:403,headers});
  try{return Response.json(await getBookingComChannelState(),{headers});}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Could not load channel settings.'},{status:500,headers});}
}

export async function PATCH(request:Request){
  if(!await admin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403,headers});
  try{
    const body=await request.json();
    return Response.json(await updateBookingComConnection(body),{headers});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Could not save channel settings.'},{status:400,headers});
  }
}

export async function POST(request:Request){
  if(!await admin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403,headers});
  try{
    const body=await request.json();
    const action=String(body?.action||'');
    if(action==='bootstrap')return Response.json(await bootstrapBookingComStaging(),{headers});
    if(action==='bootstrap-production')return Response.json(await bootstrapBookingComProduction(),{headers});
    if(action==='stagingrooms')return Response.json(await ensureBookingComStagingRoomTypes(),{headers});
    if(action==='cert-state')return Response.json(await getBookingComCertificationState(),{headers});
    if(action==='cert-setup')return Response.json(await bootstrapBookingComCertification(),{headers});
    if(action==='cert-run')return Response.json(await runBookingComCertificationScenario(body.scenario),{headers});
    if(action==='selftest')return Response.json(await runBookingComSelfTest(),{headers});
    if(action==='webhook')return Response.json(await ensureBookingComWebhook(new URL(request.url).origin+'/api/channels/booking-com/webhook'),{headers});
    if(action==='test')return Response.json(await testBookingComConnection(),{headers});
    if(action==='discover')return Response.json(await discoverBookingComMappings(),{headers});
    if(action==='mappings')return Response.json(await saveBookingComMappings(body),{headers});
    if(action==='preview')return Response.json(await previewBookingComAvailability(body.days,body.startDate),{headers});
    if(action==='push')return Response.json(await pushBookingComAvailability(body.days,body.startDate),{headers});
    if(action==='fullsync')return Response.json(await fullSyncBookingComAri(body.days),{headers});
    if(action==='pull')return Response.json(await pullBookingComFeed(),{headers});
    return Response.json({error:'Unknown channel action.'},{status:400,headers});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Channel action failed.'},{status:400,headers});
  }
}
