import {agentFromRequest} from '../../../../lib/excursion-agents';
import {partnerAvailableSchedules} from '../../../../lib/excursion-booking';

const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 try{
  const partner=await agentFromRequest(request);
  if(!partner)return Response.json({error:'Please sign in.'},{status:401,headers});
  return Response.json({schedules:await partnerAvailableSchedules()},{headers});
 }catch{
  return Response.json({error:'Could not load available schedules.'},{status:503,headers});
 }
}
