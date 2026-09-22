import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {mirrorHotelState,mirrorLegacyAccount,supabaseBridgeConfigured} from '../../../lib/supabase-bridge';

export async function GET(){
  const user=await currentUser();
  if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  return Response.json({configured:supabaseBridgeConfigured()},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
  const user=await currentUser();
  if(user?.role!=='admin'||!sameOrigin(request))return Response.json({error:'Admin access required'},{status:403});
  if(!supabaseBridgeConfigured())return Response.json({error:'Supabase secret is not configured on Cloudflare yet.'},{status:503});
  try{
    const db=authDb();
    const accounts=(await db.prepare('SELECT * FROM accounts').all<any>()).results||[];
    let mirroredAccounts=0;
    for(const account of accounts){
      try{if(await mirrorLegacyAccount(account))mirroredAccounts++;}catch{}
    }
    const {state}=await loadStays();
    await mirrorHotelState(state);
    return Response.json({
      ok:true,
      accounts:mirroredAccounts,
      bookings:Array.isArray(state.stays)?state.stays.length:0,
      rooms:Array.isArray(state.rooms)?state.rooms.length:0
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Supabase sync failed.'},{status:500});
  }
}
