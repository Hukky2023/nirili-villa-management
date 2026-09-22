import {currentUser,sameOrigin} from '../../../lib/auth';

export async function GET(){
 const user=await currentUser();
 if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
 return Response.json({canCreate:false,account:null,stays:[],guestLoginDisabled:true},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access required'},{status:403});
 return Response.json({error:'Guest login creation has been disabled.'},{status:403,headers:{'Cache-Control':'no-store'}});
}
