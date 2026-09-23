import {currentGuestUser,sameOrigin} from '../../../lib/auth';
import {guestPushPublicKey,removeGuestPushSubscription,saveGuestPushSubscription} from '../../../lib/web-push';

const headers={'Cache-Control':'private, no-store'};

export async function GET(){
 const user=await currentGuestUser();if(!user)return Response.json({error:'Guest login required.'},{status:403,headers});
 try{return Response.json({publicKey:await guestPushPublicKey()},{headers});}
 catch{return Response.json({error:'Push notifications are temporarily unavailable.'},{status:503,headers});}
}

export async function POST(request:Request){
 const user=await currentGuestUser();if(!user||!sameOrigin(request))return Response.json({error:'Guest login required.'},{status:403,headers});
 try{const body=await request.json();await saveGuestPushSubscription(user.userId,body?.subscription);return Response.json({ok:true},{headers});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Could not enable notifications.'},{status:400,headers});}
}

export async function DELETE(request:Request){
 const user=await currentGuestUser();if(!user||!sameOrigin(request))return Response.json({error:'Guest login required.'},{status:403,headers});
 try{const body=await request.json().catch(()=>({}));await removeGuestPushSubscription(user.userId,String(body?.endpoint||''));return Response.json({ok:true},{headers});}
 catch{return Response.json({error:'Could not disable notifications.'},{status:400,headers});}
}
