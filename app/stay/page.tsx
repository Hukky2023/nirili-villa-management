import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentGuestUser} from '../../lib/auth';
import GuestServices from '../guest-services';
import GuestStayLogin from './login-form';

export const dynamic='force-dynamic';
export const metadata:Metadata={
 title:'Nirili Guest Portal | In-house guests',
 description:'Private Nirili guest portal for active in-house guests.',
 robots:{index:false,follow:false},
 referrer:'no-referrer'
};

export default async function GuestStayPage(){
 const host=((await headers()).get('host')||'').split(':')[0].toLowerCase();
 if(host&&host!=='guest.nirilihotels.com'&&host!=='localhost'&&host!=='127.0.0.1')redirect('https://guest.nirilihotels.com/');
 const user=await currentGuestUser();
 return user?<GuestServices/>:<GuestStayLogin/>;
}
