/* TEPLO background web push (scope: /teplo-app/). Does not cache user data. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?.json()||{}}catch{data={title:'TEPLO',body:'Новое уведомление'}}
 const title=String(data.title||'TEPLO · Новый заказ').slice(0,90);
 const url=typeof data.url==='string'&&data.url.startsWith('/teplo-app/')?data.url:'/teplo-app/pilot-dispatch.html?v=49';
 // Android 8+ can override custom Web Push vibration: notification channel settings govern haptics.
 const opts={body:String(data.body||'Открой TEPLO').slice(0,180),tag:String(data.tag||'teplo-alert').slice(0,90),renotify:true,
  silent:false,requireInteraction:true,data:{url},vibrate:[290,120,380,130,330]};
 event.waitUntil(self.registration.showNotification(title,opts));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const path=event.notification.data?.url||'/teplo-app/pilot-dispatch.html?v=49';
 const destination=new URL(path,self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===self.location.origin){
    await client.navigate(destination);return client.focus();
   }
  }
  return self.clients.openWindow(destination);
 })());
});
