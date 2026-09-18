import {currentUser,hasPermission} from '../../lib/auth';
import {tabRedirect} from '../../lib/tab-session';
import CrewLocationPortal from './portal';

export const dynamic='force-dynamic';

export default async function CrewPage(){
 const user=await currentUser();
 if(!user)await tabRedirect('/login?portal=staff&returnTo='+encodeURIComponent('/crew'));
 if(!(user?.role==='admin'||hasPermission(user,'crew_location')))await tabRedirect('/login?portal=staff&returnTo='+encodeURIComponent('/crew'));
 return <CrewLocationPortal/>;
}
