import {cookies} from 'next/headers';
import {currentUser} from '../../lib/auth';
import {canPOS} from '../../lib/pos-access';
import {sessionCookieName,tabRedirect} from '../../lib/tab-session';

export default async function Home(){
 const user=await currentUser();
 if(user?.role==='admin')await tabRedirect('/?portal=admin');
 if(user?.role==='guest')await tabRedirect('/?portal=guest');
 if(user?.role==='staff')await tabRedirect(user.permissions.includes('crew_location')&&!user.permissions.some(p=>['edit_bills','edit_excursions','edit_transfers','waiter_pos','restaurant_pos','kitchen_pos','buggy_driver'].includes(p))?'/crew':user.permissions.includes('kitchen_pos')&&!canPOS(user)&&!user.permissions.some(p=>['edit_bills','edit_excursions','edit_transfers','waiter_pos','restaurant_pos','buggy_driver','crew_location'].includes(p))?'/restaurant/kitchen':user.permissions.includes('buggy_driver')&&!canPOS(user)&&!user.permissions.some(p=>['edit_bills','edit_excursions','edit_transfers','waiter_pos','restaurant_pos','kitchen_pos','crew_location'].includes(p))?'/buggy-driver':canPOS(user)?'/restaurant':'/?portal=staff');
 const visit=(await cookies()).get(await sessionCookieName('nirili_dining'))?.value;
 await tabRedirect(visit?'/restaurant/guest?mode=walkin':'/');
}
