import {currentUser} from '../../../lib/auth';
import {canKitchen} from '../../../lib/pos-access';
import {tabRedirect} from '../../../lib/tab-session';
import KitchenBoard from '../../kitchen-board';

export const dynamic='force-dynamic';

export default async function KitchenPage(){
 const user=await currentUser();
 if(!user)await tabRedirect('/restaurant/login?portal=staff');
 if(!canKitchen(user))await tabRedirect('/restaurant/login?portal=staff');
 return <main className="kitchen-page-shell">
  <header className="kitchen-page-topbar">
   <strong>Nirili Villa · Kitchen · {user!.displayName}</strong>
   <form action="/api/auth/logout?restaurant=1" method="post"><button>Sign out</button></form>
  </header>
  <KitchenBoard/>
 </main>;
}
