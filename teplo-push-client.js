/* TEPLO opt-in Web Push. Never asks for permission automatically. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const endpoint='https://bgtegxdekqsajttkhhrj.supabase.co/functions/v1/teplo-push';
const root=document.createElement('section');
root.id='pushSettings';
root.className='push-settings';
root.innerHTML='<div class="row"><strong>Уведомления на телефон</strong><span class="pill" id="pushStatus">Не подключено</span></div><p class="muted">Новые заказы и назначения, даже когда TEPLO закрыт. Разрешение даётся один раз для этого телефона.</p><div class="push-actions"><button id="pushEnable" type="button">Подключить телефон</button><button id="pushTest" type="button" class="secondary" hidden>Проверить</button><button id="pushResync" type="button" class="secondary" hidden>Переподключить</button><button id="pushDisable" type="button" class="secondary" hidden>Отключить</button></div><p id="pushFeedback" class="muted" role="status"></p>';
const css=document.createElement('style');
css.textContent='#pushSettings{margin:12px 0;background:#101118;border:1px solid #403447;border-radius:16px;padding:14px}#pushSettings strong{font-size:16px}#pushSettings .push-actions{display:flex;gap:8px;flex-wrap:wrap}#pushSettings .push-actions button{flex:1 1 125px;min-height:48px}#pushSettings .muted{margin:9px 0;font-size:13px}';
document.head.append(css);
const settingsTarget=document.querySelector('[data-teplo-push-settings]');
if(settingsTarget)settingsTarget.append(root);
else if(document.getElementById('message')?.parentElement)document.getElementById('message').parentElement.after(root);
else document.querySelector('main')?.insertAdjacentElement('afterbegin',root);
const $=id=>document.getElementById(id);
let pending=false,worker=null;
function available(){return Boolean(root.isConnected&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&isSecureContext)}
function state(text,connected=false){$('pushStatus').textContent=text;$('pushEnable').hidden=connected;$('pushTest').hidden=!connected;$('pushResync').hidden=!connected;$('pushDisable').hidden=!connected}
function info(text){$('pushFeedback').textContent=text}
async function auth(){
 const {data:{user},error:userError}=await db.auth.getUser();
 if(userError||!user)throw new Error('Сначала войди в рабочий аккаунт TEPLO');
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.access_token)throw new Error('Сессия закончилась, войди ещё раз');
 return session.access_token;
}
async function invoke(path,token,body){
 const response=await fetch(endpoint+path,{method:body?'POST':'GET',
  headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Сервер push недоступен');
 return data;
}
async function registration(){
 if(!worker)worker=await navigator.serviceWorker.register('./teplo-sw.js?v=55',{scope:'./',updateViaCache:'none'});
 return worker;
}
async function status(){
 if(!available()){state('Не поддерживается');info('Открой сайт в Chrome на Android или установи веб-приложение на экран iPhone.');$('pushEnable').disabled=true;return}
 if(Notification.permission==='denied'){state('Запрещено');info('Разреши уведомления для этого сайта в настройках браузера.');$('pushEnable').disabled=true;return}
 try{
  const reg=await registration();
  const subscription=await reg.pushManager.getSubscription();
  if(subscription){
   try{
    await auth();
    const {error}=await db.rpc('teplo_push_save_subscription',{p_subscription:subscription.toJSON()});
    if(error)throw error;
    state('Нужна проверка',true);info('Телефон зарегистрирован в TEPLO. Проверь тестовым уведомлением, затем создай заявку из ресторана.');
   }catch(e){
    state('Требуется вход');info('Не удалось привязать подписку: '+(e?.message||String(e)));
   }
  }
  else {state('Не подключено');info('Нажми «Подключить телефон», затем разреши уведомления Chrome. Без подписки сервер не может доставить push.');}
 }catch(e){state('Ошибка');info(e?.message||String(e))}
}
$('pushEnable').onclick=async()=>{
 if(pending)return;pending=true;$('pushEnable').disabled=true;info('Подключаем уведомления…');
 try{
  if(!available())throw new Error('Браузер не поддерживает фоновый push');
  // MUST occur in a user-initiated click.
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Уведомления не разрешены в браузере');
  const token=await auth();
  const {publicKey}=await invoke('/config',token);
  const b64=publicKey.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(b64+'='.repeat((4-b64.length%4)%4));
  const key=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const reg=await registration();
  await navigator.serviceWorker.ready;
  const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const {error}=await db.rpc('teplo_push_save_subscription',{p_subscription:sub.toJSON()});
  if(error)throw error;
  state('Нужна проверка',true);info('Телефон подключён. Нажми «Проверить», затем отправь тестовый заказ магазина.');
 }catch(e){info('Не удалось включить: '+(e?.message||String(e)))}
 finally{pending=false;$('pushEnable').disabled=false}
};
$('pushTest').onclick=async()=>{
 if(pending)return;pending=true;$('pushTest').disabled=true;
 try{const token=await auth();const result=await invoke('/test',token,{});info(result.sent?'Сервер передал тестовый push в службу уведомлений телефона. Если он не отображается, проверь разрешения Chrome и уведомления Android.':(result.failures?.['410']||result.failures?.['404']?'Подписка устарела. Нажми «Переподключить», затем «Проверить».':'Push не отправлен: нет действующих устройств или служба недоступна. Нажми «Переподключить».'))}
 catch(e){info('Ошибка теста: '+(e?.message||String(e)))}
 finally{pending=false;$('pushTest').disabled=false}
};
$('pushResync').onclick=async()=>{
 if(pending)return;pending=true;$('pushResync').disabled=true;info('Обновляем подписку…');
 try{
  if(Notification.permission!=='granted')throw new Error('Включи уведомления в настройках Chrome');
  const token=await auth(),{publicKey}=await invoke('/config',token);
  const reg=await registration();
  const existing=await reg.pushManager.getSubscription();
  if(existing){
   const {error}=await db.rpc('teplo_push_remove_subscription',{p_endpoint:existing.endpoint});
   if(error)throw error;
   await existing.unsubscribe();
  }
  const b64=publicKey.replace(/-/g,'+').replace(/_/g,'/');
  const key=Uint8Array.from(atob(b64+'='.repeat((4-b64.length%4)%4)),c=>c.charCodeAt(0));
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const {error}=await db.rpc('teplo_push_save_subscription',{p_subscription:sub.toJSON()});
  if(error)throw error;
  state('Нужна проверка',true);info('Подписка обновлена. Нажми «Проверить».');
 }catch(e){info('Не удалось переподключить: '+(e?.message||String(e)))}
 finally{pending=false;$('pushResync').disabled=false}
};
$('pushDisable').onclick=async()=>{
 if(pending)return;pending=true;$('pushDisable').disabled=true;
 try{
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(sub){
   const {error}=await db.rpc('teplo_push_remove_subscription',{p_endpoint:sub.endpoint});
   if(error)throw error;
   await sub.unsubscribe();
  }
  state('Выключено');info('Подписка этого телефона отключена.');
 }catch(e){info('Не удалось отключить: '+(e?.message||String(e)))}
 finally{pending=false;$('pushDisable').disabled=false}
};
void status();
db.auth.onAuthStateChange(()=>{if(document.visibilityState==='visible')queueMicrotask(()=>void status())});
