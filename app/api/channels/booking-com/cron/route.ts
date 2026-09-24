import {handleBookingComCron} from '../../../../../lib/channels';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

export async function POST(request:Request){
  try{
    return Response.json(await handleBookingComCron(request),{headers});
  }catch(error:any){
    const status=Number(error?.status)||500;
    return Response.json({error:error instanceof Error?error.message:'Booking.com recovery poll failed.'},{status,headers});
  }
}
