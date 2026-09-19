
import {UiText,UiField,UiOption} from './ui-language';
import LoginForm from './login/form';
import {restaurantOnly} from '../lib/pos-access';
import {tabRedirect} from '../lib/tab-session';
import AuthShell from "./auth-shell";
import {ShieldCheck,Users,Compass,ArrowUpRight} from "lucide-react";
import {getChatGPTUser,requireChatGPTUser} from "./chatgpt-auth";
import Management from "./management";
export const dynamic="force-dynamic";
const portals=[["admin","Admin","Manage the property, staff and permissions."],["staff","Staff","Access your approved work areas."],["guest","Guest","Explore excursions, transfers and your stay."]];
async function Portal({portal,room}:{portal:string;room?:string}){
const user=await requireChatGPTUser("/?portal="+portal+(room?"&room="+encodeURIComponent(room):""));
if(user.role==="staff"){
 const managementAccess=user.permissions.length===0||user.permissions.some(p=>["edit_bills","edit_excursions","edit_transfers"].includes(p));
 const crewOnly=user.permissions.includes("crew_location")&&!managementAccess&&!restaurantOnly(user)&&!user.permissions.includes("buggy_driver");
 const buggyOnly=user.permissions.includes("buggy_driver")&&!managementAccess&&!restaurantOnly(user)&&!user.permissions.includes("crew_location");
 if(crewOnly)await tabRedirect('/crew');
 if(buggyOnly)await tabRedirect('/buggy-driver');
}
if(restaurantOnly(user))await tabRedirect('/restaurant');
if(portal==="admin"&&user.role!=="admin"||portal==="staff"&&!["admin","staff"].includes(user.role))return <main className="login-page"><section className="login-card"><h1><UiText>Access not approved</UiText></h1><p><UiText>Your account cannot open this portal.</UiText></p><a href="/?portal=guest"><UiText>Guest portal</UiText></a><form action="/api/auth/logout" method="post"><button><UiText>Sign out</UiText></button></form></section></main>;
return <Management role={portal==="guest"?"guest":user.role} email={user.displayName+" ("+user.username+")"} permissions={user.permissions}/>;
}
export default async function Page({searchParams}:{searchParams:Promise<{portal?:string;room?:string}>}){
const p=await searchParams,portal=p.portal||(p.room?"admin":"");
if(["admin","staff","guest"].includes(portal))return <Portal portal={portal} room={p.room}/>;
return <LoginForm/>;
}
