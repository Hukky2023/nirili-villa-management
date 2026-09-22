import {supabaseBridgeHealth} from '../../../lib/supabase-bridge';

export async function GET(){
  const health=await supabaseBridgeHealth();
  return Response.json(health,{headers:{'Cache-Control':'no-store'}});
}
