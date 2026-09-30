import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentGuestUser} from '../../lib/auth';
import GuestServices from '../guest-services';
import GuestStayLogin from './login-form';
import {SITES,guestPortalHost} from '../../lib/public-sites';
export const dynamic='force-dynamic';
export const metadata={title:'My Stay | Nirili Guest Portal',robots:{index:false,follow:false}};
export default async function GuestStayPage(){
 const host=((await headers()).get('host')||'').split(':')[0].toLowerCase();
 if(host&&!guestPortalHost(host))redirect(SITES.my+'/');
 const user=await currentGuestUser();return user?<GuestServices/>:<GuestStayLogin/>;
}
