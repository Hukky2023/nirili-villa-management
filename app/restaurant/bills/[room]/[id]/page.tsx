
import {UiText,UiField,UiOption} from '../../../../ui-language';
import {tabRedirect} from '../../../../../lib/tab-session';
import {loadStays} from "../../../../../lib/stays";
import {requireChatGPTUser} from "../../../../chatgpt-auth";
import {readBill,billEditor} from "../../../../../lib/restaurant-server";
import Editor from "./editor";
export const dynamic="force-dynamic";
async function Protected({room,id}:{room:string;id:string}){
 await requireChatGPTUser("/restaurant/bills/"+encodeURIComponent(room)+"/"+encodeURIComponent(id));
 const user=await billEditor();if(!user)return <main style={{padding:32}}><UiText>Bill editing permission is required. </UiText><a href="/"><UiText>Return to application</UiText></a></main>;
 const loaded=await loadStays();const linked=loaded.state.posOrders?.find((o:any)=>o.id===id&&loaded.state.stays.some((s:any)=>s.id===o.stayId&&(s.billRoom===room||s.room===room)));if(linked)await tabRedirect('/restaurant?bill='+encodeURIComponent(id));
 try{const bill=await readBill(room,id);const {state}=await loadStays();const stay=state.stays.find((s:any)=>s.billRoom===room);return bill?<Editor initial={bill} currentRoom={stay?.room||room} isAdmin={user.role==="admin"}/>:<main><UiText>Bill not found.</UiText></main>;}catch{return <main><UiText>Restaurant bills are temporarily unavailable. Please reload to retry.</UiText></main>;}
}
export default async function Page({params}:{params:Promise<{room:string;id:string}>}){const p=await params;return <Protected {...p}/>;}
