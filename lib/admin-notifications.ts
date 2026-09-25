import {saveSystemNotifications} from './supabase-bridge';
import {sendAdminPushNotification} from './web-push';

export type AdminNotice={
 id:string;
 type:string;
 title:string;
 detail:string;
 at?:string;
 read?:boolean;
 ref?:string;
 url?:string;
};

export async function emitAdminNotification(input:AdminNotice){
 const notice={...input,at:input.at||new Date().toISOString(),read:false};
 const results=await Promise.allSettled([
  saveSystemNotifications([notice]),
  sendAdminPushNotification(notice)
 ]);
 return {
  saved:results[0].status==='fulfilled',
  push:results[1].status==='fulfilled'?results[1].value:{sent:0,total:0}
 };
}
