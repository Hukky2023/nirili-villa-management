import {sameOrigin} from '../../../lib/auth';
import {islandToday} from '../../../lib/guest-catalog';

export async function GET(){
 return Response.json({today:islandToday(),signedIn:false,guestLoginDisabled:true},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403});
 return Response.json({error:'Temporary guest logins have been disabled. Please contact reception to book excursions.'},{status:403,headers:{'Cache-Control':'no-store'}});
}
