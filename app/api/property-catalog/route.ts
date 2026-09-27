import {currentUser,sameOrigin} from '../../../lib/auth';
import {loadStays,stayKey} from '../../../lib/stays';
import {readOperationalRecordPrimary} from '../../../lib/supabase-bridge';
import {saveStayAccess} from '../../../lib/stay-login';
import {changePropertyCatalog,propertyCatalog} from '../../../lib/property-catalog';
import {autoPushBookingComAvailability} from '../../../lib/channels';

async function load(){
 let primary:any=null;
 try{primary=await readOperationalRecordPrimary(stayKey);}catch{}
 return primary?.payload?{state:primary.payload,revision:Number(primary.revision)||0}:loadStays();
}
export async function GET(){
 const user=await currentUser();
 if(user?.role!=='admin')return Response.json({error:'Admin access required.'},{status:403});
 try{const {state,revision}=await load();return Response.json(propertyCatalog(state,revision),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Could not load rooms and prices. Please retry.'},{status:503});}
}
export async function POST(request:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403});
 try{
  const body:any=await request.json(),{state,revision}=await load();
  if(body.revision!==revision)return Response.json({error:'Property records changed. Reload before saving.'},{status:409});
  const message=changePropertyCatalog(state,body,user.username);
  if(!await saveStayAccess(state,revision,user.userId))return Response.json({error:'Property records changed. Reload before saving.'},{status:409});
  if(['save-room','remove-room'].includes(body.action))await autoPushBookingComAvailability();
  return Response.json({...propertyCatalog(state,revision+1),message},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not save changes.'},{status:400});}
}
