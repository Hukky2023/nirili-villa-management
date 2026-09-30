import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentGuestUser} from '../../lib/auth';
import GuestServices from '../guest-services';
import GuestStayLogin from './login-form';
import {SITES,guestPortalHost} from '../../lib/public-sites';
import {Fonts} from '../hotel/chrome';
import '../hotel/home.css';
import '../book/restaurant/style.css';
import './portal.css';
export const dynamic='force-dynamic';
export const metadata={title:'My Stay | Nirili Guest Portal',robots:{index:false,follow:false}};
export default async function GuestStayPage(){
 const host=((await headers()).get('host')||'').split(':')[0].toLowerCase();
 if(host&&!guestPortalHost(host))redirect(SITES.my+'/');
 const user=await currentGuestUser();
 // nh-dine reuses the public restaurant menu styling for the portal's Restaurant tab.
 return <div className="nh nh-portal nh-dine"><Fonts/>{user?<GuestServices/>:<GuestStayLogin/>}</div>;
}
