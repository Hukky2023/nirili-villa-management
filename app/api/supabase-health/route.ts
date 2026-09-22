import {supabaseBridgeHealth} from '../../../lib/supabase-bridge';

export async function GET(){
  const health=await supabaseBridgeHealth();
  return Response.json({
    ok:health.configured&&health.reachable,
    configured:health.configured,
    reachable:health.reachable,
    error:health.reachable?undefined:health.error
  },{headers:{'Cache-Control':'no-store'}});
}
