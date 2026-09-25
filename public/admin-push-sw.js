self.addEventListener('push',event=>{
 let data={title:'Nirili Villa',body:'You have a new management update.',url:'/home',tag:'nirili-admin-update'};
 try{if(event.data)data={...data,...event.data.json()}}catch{try{data.body=event.data.text()}catch{}}
 event.waitUntil(self.registration.showNotification(data.title,{
  body:data.body,
  tag:data.tag||'nirili-admin-update',
  renotify:true,
  requireInteraction:false,
  data:{url:data.url||'/home',type:data.type||'',ref:data.ref||''},
  vibrate:[220,100,220]
 }));
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let target;
  try{target=new URL(event.notification.data?.url||'/home',self.location.origin)}catch{target=new URL('/home',self.location.origin)}
  if(target.origin!==self.location.origin)target=new URL('/home',self.location.origin);
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===self.location.origin){
    await client.focus();
    if('navigate' in client)await client.navigate(target.href);
    return;
   }
  }
  await clients.openWindow(target.href);
 })());
});
