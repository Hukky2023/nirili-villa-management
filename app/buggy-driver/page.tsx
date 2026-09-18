import {currentUser,hasPermission} from '../../lib/auth';
import {tabRedirect} from '../../lib/tab-session';
import BuggyDriverPortal from './portal';

export const dynamic='force-dynamic';

export default async function BuggyDriverPage(){
 const user=await currentUser();
 if(!hasPermission(user,'buggy_driver'))await tabRedirect('/login?portal=staff&returnTo='+encodeURIComponent('/buggy-driver'));
 return <BuggyDriverPortal/>;
}
