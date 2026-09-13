import {tabRedirect} from '../lib/tab-session';
import {currentUser} from "../lib/auth";
export {currentUser as getChatGPTUser} from "../lib/auth";
export type {Actor as ChatGPTUser} from "../lib/auth";
export async function requireChatGPTUser(returnTo:string){const user=await currentUser();if(user)return user;const portal=returnTo.includes("portal=guest")?"guest":returnTo.includes("portal=staff")?"staff":"admin";await tabRedirect("/login?portal="+portal+"&returnTo="+encodeURIComponent(returnTo));}
export function chatGPTSignInPath(returnTo:string){return "/login?returnTo="+encodeURIComponent(returnTo);}
