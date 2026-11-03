import {authDb} from '../../../../../lib/auth';
import {mobileActor,mobileEnabled} from '../../../../../lib/mobile-auth';
import {dashboardAccess,buildDashboard,maldivesDate} from '../../../../../lib/dashboard-data';
import {updateRoomInventory} from '../../../../../lib/rooms';
import {readDashboardOperationalSnapshot} from '../../../../../lib/supabase-bridge';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0'};
export async function GET(request:Request){
 if(!mobileEnabled())return Response.json({error:'Mobile API disabled'},{status:503,headers});
 try{
  const user=await mobileActor(request);
  if(!user)return Response.json({error:'Unauthorized'},{status:401,headers});
  const access=dashboardAccess(user);
  if(!access.hotel)return Response.json({error:'No dashboard access'},{status:403,headers});
  const now=new Date(),today=maldivesDate(now);
  let state:any,transport:any,schedules:any[]=[];
  try{
   const snapshot=await readDashboardOperationalSnapshot(today);
   state=snapshot.hotel;transport=snapshot.transport;schedules=snapshot.schedules;
  }catch{}
  if(!state){
   const rows=await authDb().prepare('SELECT key,payload FROM operation_records WHERE key IN (?,?) OR key LIKE ?').bind('hotel-stays-v1','transport-bookings-v1','excursion-schedule:'+today+':%').all<{key:string;payload:string}>();
   const entries=(rows.results||[]).map(r=>({key:r.key,value:JSON.parse(r.payload)}));
   state=entries.find(r=>r.key==='hotel-stays-v1')?.value||{rooms:[],stays:[],requests:[],orders:[],posOrders:[]};
   transport=entries.find(r=>r.key==='transport-bookings-v1')?.value||{bookings:[]};
   schedules=entries.filter(r=>r.key.startsWith('excursion-schedule:'+today+':')).map(r=>r.value);
  }
  updateRoomInventory(state);
  return Response.json(buildDashboard(state,transport||{bookings:[]},schedules,now,access),{headers});
 }catch{return Response.json({error:'Dashboard unavailable'},{status:503,headers});}
}
