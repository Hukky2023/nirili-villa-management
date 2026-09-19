import {authDb,currentUser} from '../../../lib/auth';
import {restaurantOnly} from '../../../lib/pos-access';
import {updateRoomInventory} from '../../../lib/rooms';
import {buildDashboard,dashboardAccess,maldivesDate} from '../../../lib/dashboard-data';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, X-Nirili-Tab'};
export async function GET(){
 const user=await currentUser(),access=dashboardAccess(user);
 if(!user||!access.hotel||restaurantOnly(user))return Response.json({error:'Hotel management access required.'},{status:user?403:401,headers});
 try{
  const now=new Date(),today=maldivesDate(now);
  // One read-only query gives one consistent snapshot; no demo seeding or migrations.
  const rows=await authDb().prepare('SELECT key,payload FROM operation_records WHERE key IN (?,?) OR key LIKE ?').bind('hotel-stays-v1','transport-bookings-v1','excursion-schedule:'+today+':%').all<{key:string;payload:string}>();
  const entries=(rows.results||[]).map(row=>({key:row.key,value:JSON.parse(row.payload)}));
  const state=entries.find(row=>row.key==='hotel-stays-v1')?.value||{rooms:[],stays:[],requests:[],orders:[],posOrders:[]};
  updateRoomInventory(state);
  const transport=entries.find(row=>row.key==='transport-bookings-v1')?.value||{bookings:[]};
  const schedules=entries.filter(row=>row.key.startsWith('excursion-schedule:'+today+':')).map(row=>row.value);
  return Response.json(buildDashboard(state,transport,schedules,now,access),{headers});
 }catch{
  return Response.json({error:'The dashboard could not refresh. Your last successful data has been retained; please retry.'},{status:503,headers});
 }
}
