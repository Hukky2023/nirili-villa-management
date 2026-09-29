
import {UiText,UiField,UiOption} from '../ui-language';
import {currentUser} from '../../lib/auth';
import {tabRedirect} from '../../lib/tab-session';
import {canTransport,transportRole} from '../../lib/transport-access';
import TransportPanel from '../transport-panel';
export const dynamic='force-dynamic';
export default async function Transport(){const u=await currentUser();if(!u)await tabRedirect('/transport/login');if(!canTransport(u))return <main><h1><UiText>Transport access required</UiText></h1><p><UiText>Ask Admin to enable transport access for your account.</UiText></p><a href="/transport/login"><UiText>Change login</UiText></a></main>;return <main><header style={{background:'#063b48',color:'#fff',padding:'16px',display:'flex',flexWrap:'wrap',gap:'16px',alignItems:'center',justifyContent:'space-between'}}><strong><UiText>Nirili Travels · Nirili Transfers · </UiText><UiText>{transportRole(u)}</UiText> · <UiText>{u.displayName}</UiText></strong><form action="/api/auth/logout?transport=1" method="post"><button style={{padding:'10px 16px',background:'white',color:'#063b48',borderRadius:10}}><UiText>Sign out</UiText></button></form></header><TransportPanel/></main>;}
