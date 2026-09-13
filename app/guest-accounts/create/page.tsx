import {currentUser} from '../../../lib/auth';
import {tabRedirect} from '../../../lib/tab-session';
import GuestAccountForm from '../../guest-account-form';
export const dynamic='force-dynamic';
export default async function CreateGuest({searchParams}:{searchParams:Promise<{stay?:string}>}){const u=await currentUser();if(!u)await tabRedirect('/login?portal=admin');if(u.role!=='admin')return <main style={{padding:24}}><h1>Admin access required</h1><a href="/">Return to login</a></main>;const p=await searchParams;return <main style={{maxWidth:640,margin:'auto',padding:'28px 16px'}}><a href="/?portal=admin">← Back to management</a><h1 style={{margin:'24px 0'}}>In-house guest account</h1><GuestAccountForm stayId={p.stay} standalone/>{p.stay&&<p><a href="/guest-accounts/create">Choose another booked room</a></p>}</main>}
