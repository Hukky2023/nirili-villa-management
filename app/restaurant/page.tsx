import {UiText,UiField} from '../ui-language';
import {tabRedirect} from '../../lib/tab-session';
import {currentUser} from '../../lib/auth';
import {canPOS,canKitchen,canTakePayment} from '../../lib/pos-access';
import WaiterMenu from '../waiter-menu';
import RestaurantPOS from '../restaurant-pos';

export const dynamic='force-dynamic';

export default async function Restaurant(){
 const u=await currentUser();
 if(!u)return tabRedirect('/restaurant/login');
 if(u.role==='guest')return tabRedirect('/restaurant/guest?mode=inhouse');

 // Shared staff logins and saved restaurant links must also work for kitchen-only
 // accounts. Keep POS/payment permissions unchanged and use the restricted board.
 if(canKitchen(u)&&!canPOS(u))return tabRedirect('/restaurant/kitchen');

 if(!canPOS(u))return <main className="page">
  <h1><UiText>Restaurant access required</UiText></h1>
  <p><UiText>Ask Admin to enable Restaurant POS in your staff permissions.</UiText></p>
  <form action="/api/auth/logout?restaurant=1" method="post">
   <button><UiText>Sign out</UiText></button>
  </form>
 </main>;

 return <main>
  <header style={{background:'#07334a',color:'white',padding:'12px 20px',display:'flex',justifyContent:'space-between'}}>
   <UiField as="a" href="/home" className="brand-home" aria-label="Nirili Villa home">
    <b><UiText>Nirili Villa · Restaurant · </UiText><UiText>{u.displayName}</UiText></b>
   </UiField>
   <form action="/api/auth/logout?restaurant=1" method="post">
    <button><UiText>Sign out</UiText></button>
   </form>
  </header>
  <UiText>{canTakePayment(u)?<RestaurantPOS/>:<WaiterMenu/>}</UiText>
 </main>;
}
