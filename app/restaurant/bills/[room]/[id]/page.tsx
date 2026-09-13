import {tabRedirect} from '../../../../../lib/tab-session';
import {loadStays} from "../../../../../lib/stays";
import {requireChatGPTUser} from "../../../../chatgpt-auth";
import {readBill,billEditor} from "../../../../../lib/restaurant-server";
import Editor from "./editor";
export const dynamic="force-dynamic";
async function Protected({room,id}:{room:string;id:string}){
 await requireChatGPTUser("/restaurant/bills/"+encodeURIComponent(room)+"/"+encodeURIComponent(id));
 const user=await billEditor();if(!user)return <main style={{padding:32}}>Bill editing permission is required. <a href="/">Return to application</a></main>;
 const loaded=await loadStays();const linked=loaded.state.posOrders?.find((o:any)=>o.id===id&&loaded.state.stays.some((s:any)=>s.id===o.stayId&&(s.billRoom===room||s.room===room)));if(linked)await tabRedirect('/restaurant?bill='+encodeURIComponent(id));
 try{const bill=await readBill(room,id);const {state}=await loadStays();const stay=state.stays.find((s:any)=>s.billRoom===room);return bill?<Editor initial={bill} currentRoom={stay?.room||room} isAdmin={user.role==="admin"}/>:<main>Bill not found.</main>;}catch{return <main>Restaurant bills are temporarily unavailable. Please reload to retry.</main>;}
}
export default async function Page({params}:{params:Promise<{room:string;id:string}>}){const p=await params;return <Protected {...p}/>;}
