import {limit,sameOrigin} from '../../../lib/auth';
import {createExcursionBooking,excursionBookingOptions} from '../../../lib/excursion-booking';

const headers={'Cache-Control':'no-store'};

export async function GET(){
 try{
  return Response.json(await excursionBookingOptions(),{headers});
 }catch{
  return Response.json({error:'Could not load excursions. Please try again.'},{status:503,headers});
 }
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 let body:any;
 try{body=await request.json();}catch{return Response.json({error:'Could not send your excursion booking.'},{status:400,headers});}
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const result=await createExcursionBooking(body,{
  source:'External guest website',createdBy:'External guest',savedBy:'public-excursion-site',
  autoConfirm:true,guestContactRequired:true,guestEmail:true,guestManageLink:true,
  notifyTitle:'New excursion booking',notifyPrefix:'',
  allow:async phone=>await limit('public-excursion-ip:'+ip,20,3600000)&&await limit('public-excursion-phone:'+phone,8,3600000),
 });
 return Response.json(result.body,{status:result.status,headers});
}
