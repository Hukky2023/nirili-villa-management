import {currentUser,sameOrigin} from '../../../lib/auth';
import {adminPushPublicKey,removeAdminPushSubscription,saveAdminPushSubscription,sendAdminPushNotification} from '../../../lib/web-push';
import {adminNativePushConfigured,removeAdminNativePushToken,saveAdminNativePushToken} from '../../../lib/firebase-push';

const headers={'Cache-Control':'private, no-store'};

export async function GET(){
 const user=await currentUser();
 if(!user)return Response.json({error:'Staff login required.'},{status:403,headers});
 try{return Response.json({publicKey:await adminPushPublicKey(),nativeConfigured:adminNativePushConfigured()},{headers});}
 catch{return Response.json({error:'Push notifications are temporarily unavailable.',nativeConfigured:adminNativePushConfigured()},{status:503,headers});}
}

export async function POST(request:Request){
 const user=await currentUser();
 if(!user||!sameOrigin(request))return Response.json({error:'Staff login required.'},{status:403,headers});
 try{
  const body=await request.json();
  if(body?.test===true){
   const result=await sendAdminPushNotification({
    id:'native:test:'+Date.now(),
    type:'test',
    title:'Test notification',
    detail:'Background notifications are connected to this phone.',
    url:'/home',
    ref:'android-test'
   });
   return Response.json({ok:result.sent>0,...result},{headers});
  }
  if(body?.nativeToken){
   if(!adminNativePushConfigured())return Response.json({error:'Native phone notifications are not configured on the server.'},{status:503,headers});
   await saveAdminNativePushToken(user.userId,body.nativeToken,body?.platform||'android');
   return Response.json({ok:true,native:true},{headers});
  }
  await saveAdminPushSubscription(user.userId,body?.subscription);
  return Response.json({ok:true,native:false},{headers});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:'Could not enable notifications.'},{status:400,headers});
 }
}

export async function DELETE(request:Request){
 const user=await currentUser();
 if(!user||!sameOrigin(request))return Response.json({error:'Staff login required.'},{status:403,headers});
 try{
  const body=await request.json().catch(()=>({}));
  if(body?.nativeToken)await removeAdminNativePushToken(user.userId,body.nativeToken);
  else await removeAdminPushSubscription(user.userId,String(body?.endpoint||''));
  return Response.json({ok:true},{headers});
 }catch{
  return Response.json({error:'Could not disable notifications.'},{status:400,headers});
 }
}
