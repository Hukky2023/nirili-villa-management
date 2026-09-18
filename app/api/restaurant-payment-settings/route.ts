import {currentUser,sameOrigin} from '../../../lib/auth';
import {canPOS} from '../../../lib/pos-access';
import {loadRestaurantPaymentSettings,saveRestaurantPaymentSettings} from '../../../lib/restaurant-payment-settings';

export async function GET(){
 const user=await currentUser();
 if(!canPOS(user))return Response.json({error:'Restaurant access required.'},{status:403});
 try{return Response.json({settings:await loadRestaurantPaymentSettings(),canEdit:user?.role==='admin'},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Could not load restaurant payment settings.'},{status:503});}
}

export async function PUT(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access required.'},{status:403});
 try{
  const settings=await saveRestaurantPaymentSettings(await r.json(),user.username);
  return Response.json({settings});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save payment settings.'},{status:400});}
}
