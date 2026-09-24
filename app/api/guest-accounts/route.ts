import {authDb,currentUser} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';

export async function GET(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
 const {state,revision}=await loadStays();
 const stayId=new URL(r.url).searchParams.get('stay')||'';
 const stay=state.stays.find((item:any)=>item.id===stayId)||null;
 let account:any=null;
 if(stay?.accountId){
  account=await authDb().prepare("SELECT id,username,name,role,active FROM accounts WHERE id=? AND role='guest'").bind(stay.accountId).first<any>();
  if(account)account.stays=[{id:stay.id,room:stay.room,meal:stay.meal,status:stay.status,whatsapp:stay.whatsapp||''}];
 }
 return Response.json({account,stay:stay?{id:stay.id,room:stay.room,guest:stay.guest,meal:stay.meal,status:stay.status}:null,revision,automatic:true,portalUrl:'https://booking.nirilihotels.com/stay'},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(){return Response.json({error:'Guest accounts are created automatically at check-in.'},{status:405,headers:{Allow:'GET'}});}
