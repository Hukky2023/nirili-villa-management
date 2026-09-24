import {currentUser} from '../../../lib/auth';
import {supabaseBridgeHealth} from '../../../lib/supabase-bridge';

export async function GET(){
  const headers={'Cache-Control':'no-store'};
  const user=await currentUser();
  if(user?.role!=='admin'){
    return Response.json({error:'Admin access required'},{status:403,headers});
  }
  const health=await supabaseBridgeHealth();
  return Response.json({
    configured:health.configured,
    reachable:health.reachable
  },{headers});
}
