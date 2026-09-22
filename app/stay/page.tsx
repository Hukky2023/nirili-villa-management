import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentGuestUser} from '../../lib/auth';
import GuestServices from '../guest-services';
import GuestStayLogin from './login-form';
export const dynamic='force-dynamic';
export default async function GuestStayPage(){
 const host=((await headers()).get('host')||'').split(':')[0].toLowerCase();
 if(host&&host!=='booking.nirilihotels.com'&&host!=='localhost'&&host!=='127.0.0.1')redirect('https://booking.nirilihotels.com/stay');
 const user=await currentGuestUser();return user?<GuestServices/>:<GuestStayLogin/>;
}
