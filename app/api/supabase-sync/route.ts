import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {mirrorHotelState,mirrorLegacyAccounts,mirrorOperationalSnapshot,supabaseBridgeConfigured,supabaseBridgeHealth} from '../../../lib/supabase-bridge';

export async function GET(){
  const user=await currentUser();
  if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  return Response.json(await supabaseBridgeHealth(),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
  const user=await currentUser();
  if(user?.role!=='admin'||!sameOrigin(request))return Response.json({error:'Admin access required'},{status:403});
  if(!supabaseBridgeConfigured())return Response.json({error:'Supabase secret is not configured on Cloudflare yet.'},{status:503});
  try{
    const db=authDb();
    const [accountsResult,operationsResult,billsResult,hotel]=await Promise.all([
      db.prepare('SELECT * FROM accounts').all<any>(),
      db.prepare('SELECT key,payload,revision,updated_by FROM operation_records').all<any>(),
      db.prepare('SELECT key,payload,revision,updated_by FROM restaurant_bills').all<any>(),
      loadStays()
    ]);
    const accounts=accountsResult.results||[],operations=operationsResult.results||[],bills=billsResult.results||[];
    const [mirroredAccounts,ops]=await Promise.all([
      mirrorLegacyAccounts(accounts),
      mirrorOperationalSnapshot(operations,bills),
      mirrorHotelState(hotel.state)
    ]);
    return Response.json({
      ok:true,
      accounts:mirroredAccounts,
      bookings:Array.isArray(hotel.state.stays)?hotel.state.stays.length:0,
      rooms:Array.isArray(hotel.state.rooms)?hotel.state.rooms.length:0,
      operations:ops.operations,
      excursionSchedules:ops.schedules,
      restaurantBills:ops.bills,
      transport:ops.transport
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Supabase sync failed.'},{status:500});
  }
}
