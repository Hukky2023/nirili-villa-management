import {cookies} from 'next/headers';
import {currentUser} from '../../lib/auth';
import {canPOS} from '../../lib/pos-access';
import {sessionCookieName,tabRedirect} from '../../lib/tab-session';

export default async function Home(){
 const user=await currentUser();
 if(user?.role==='admin')await tabRedirect('/?portal=admin');
 if(user?.role==='guest')await tabRedirect('/?portal=guest');
 if(user?.role==='staff')await tabRedirect(canPOS(user)?'/restaurant':'/?portal=staff');
 const visit=(await cookies()).get(await sessionCookieName('nirili_dining'))?.value;
 await tabRedirect(visit?'/restaurant/guest?mode=walkin':'/');
}
