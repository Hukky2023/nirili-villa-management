export type GuestNotification={
 id:string;
 accountId:string;
 type:string;
 title:string;
 message:string;
 createdAt:string;
 url?:string;
 bookingId?:string;
 readAt?:string;
 dismissedAt?:string;
 metadata?:Record<string,any>;
};

export function ensureGuestNotifications(state:any){
 state.guestNotifications=Array.isArray(state?.guestNotifications)?state.guestNotifications:[];
 return state.guestNotifications as GuestNotification[];
}

export function addGuestNotification(state:any,input:Omit<GuestNotification,'id'|'createdAt'> & {id?:string;createdAt?:string}){
 const list=ensureGuestNotifications(state);
 const item:GuestNotification={
  id:input.id||'GNT-'+crypto.randomUUID().slice(0,10).toUpperCase(),
  accountId:String(input.accountId||''),
  type:String(input.type||'update'),
  title:String(input.title||'Guest update').slice(0,120),
  message:String(input.message||'').slice(0,500),
  createdAt:input.createdAt||new Date().toISOString(),
  ...(input.url?{url:String(input.url).slice(0,300)}:{}),
  ...(input.bookingId?{bookingId:String(input.bookingId).slice(0,120)}:{}),
  ...(input.metadata?{metadata:input.metadata}:{})
 };
 if(!item.accountId||!item.message)return null;
 list.push(item);
 state.guestNotifications=list
  .sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
  .slice(0,500);
 return item;
}

export function guestNotificationsForAccount(state:any,accountId:string,limit=30){
 return ensureGuestNotifications(state)
  .filter((item:any)=>item.accountId===accountId&&!item.dismissedAt)
  .sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
  .slice(0,Math.max(1,Math.min(100,limit)));
}

export function dismissGuestNotification(state:any,accountId:string,id:string){
 const item=ensureGuestNotifications(state).find((entry:any)=>entry.id===id&&entry.accountId===accountId&&!entry.dismissedAt);
 if(!item)return false;
 item.dismissedAt=new Date().toISOString();
 return true;
}
