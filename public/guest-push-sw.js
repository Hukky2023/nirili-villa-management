self.addEventListener('push',event=>{
 let data={title:'Nirili Villa',body:'You have a new update.',url:'/stay?service=buggy',tag:'nirili-guest-update'};
 try{if(event.data)data={...data,...event.data.json()}}catch{try{data.body=event.data.text()}catch{}}
 event.waitUntil(self.registration.showNotification(data.title,{
  body:data.body,
  tag:data.tag||'nirili-guest-update',
  renotify:true,
  data:{url:data.url||'/stay?service=buggy'},
  vibrate:[180,80,180]
 }));
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let target;
  try{target=new URL(event.notification.data?.url||'/stay?service=buggy',self.location.origin)}catch{target=new URL('/stay?service=buggy',self.location.origin)}
  if(target.origin!==self.location.origin)target=new URL('/stay?service=buggy',self.location.origin);
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===self.location.origin){await client.focus();if('navigate' in client)await client.navigate(target.href);return;}
  }
  await clients.openWindow(target.href);
 })());
});
