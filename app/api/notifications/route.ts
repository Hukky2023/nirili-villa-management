import {currentUser,sameOrigin} from '../../../lib/auth';
import {clearSystemNotifications,listSystemNotifications,markSystemNotificationsRead,saveSystemNotifications} from '../../../lib/supabase-bridge';
import {sendAdminPushNotification} from '../../../lib/web-push';

const headers={'Cache-Control':'private, no-store'};

async function admin(){
  const user=await currentUser();
  return user?.role==='admin'?user:null;
}

export async function GET(){
  if(!await admin())return Response.json({error:'Admin access required'},{status:403,headers});
  try{return Response.json({notifications:await listSystemNotifications(150)},{headers});}
  catch{return Response.json({error:'Could not load notifications.'},{status:503,headers});}
}

export async function POST(request:Request){
  if(!await admin()||!sameOrigin(request))return Response.json({error:'Admin access required'},{status:403,headers});
  try{
    const body=await request.json();
    const notices=Array.isArray(body?.notifications)?body.notifications:[];
    await saveSystemNotifications(notices);
    await Promise.allSettled(notices.slice(0,10).map((notice:any)=>sendAdminPushNotification(notice)));
    return Response.json({ok:true,count:notices.length},{headers});
  }catch{return Response.json({error:'Could not save notifications.'},{status:503,headers});}
}

export async function PATCH(request:Request){
  if(!await admin()||!sameOrigin(request))return Response.json({error:'Admin access required'},{status:403,headers});
  try{
    const body=await request.json();
    const ids=Array.isArray(body?.ids)?body.ids.map(String):undefined;
    await markSystemNotificationsRead(ids);
    return Response.json({ok:true},{headers});
  }catch{return Response.json({error:'Could not update notifications.'},{status:503,headers});}
}

export async function DELETE(request:Request){
  if(!await admin()||!sameOrigin(request))return Response.json({error:'Admin access required'},{status:403,headers});
  try{await clearSystemNotifications();return Response.json({ok:true},{headers});}
  catch{return Response.json({error:'Could not clear notifications.'},{status:503,headers});}
}
