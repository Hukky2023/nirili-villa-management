
import {UiText,UiField,UiOption} from '../../ui-language';
import {currentUser} from '../../../lib/auth';
import {tabRedirect} from '../../../lib/tab-session';
import GuestAccountForm from '../../guest-account-form';
export const dynamic='force-dynamic';
export default async function CreateGuest({searchParams}:{searchParams:Promise<{stay?:string}>}){const u=await currentUser();if(!u)await tabRedirect('/login?portal=admin');if(u.role!=='admin')return <main style={{padding:24}}><h1><UiText>Admin access required</UiText></h1><a href="/"><UiText>Return to login</UiText></a></main>;const p=await searchParams;return <main style={{maxWidth:640,margin:'auto',padding:'28px 16px'}}><a href="/?portal=admin"><UiText>← Back to management</UiText></a><h1 style={{margin:'24px 0'}}><UiText>In-house guest account</UiText></h1><GuestAccountForm stayId={p.stay} standalone/><UiText>{p.stay&&<p><a href="/guest-accounts/create"><UiText>Choose another booked room</UiText></a></p>}</UiText></main>}
