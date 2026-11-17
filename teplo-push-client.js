/* TEPLO opt-in Web Push. Never asks for permission automatically. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const endpoint='https://bgtegxdekqsajttkhhrj.supabase.co/functions/v1/teplo-push';
const root=document.createElement('section');
root.id='pushSettings';
root.className='push-settings';
root.innerHTML='<div class="row"><strong>Уведомления на телефон</strong><span class="pill" id="pushStatus">Не подключено</span></div><p class="muted">Новые заказы и назначения, даже когда TEPLO закрыт. Разрешение даётся один раз для этого телефона.</p><div class="push-actions"><button id="pushEnable" type="button">Включить push</button><button id="pushTest" type="button" class="secondary" hidden>Проверить</button><button id="pushDisable" type="button" class="secondary" hidden>Отключить</button></div><p id="pushFeedback" class="muted" role="status"></p>';
const css=document.createElement('style');
css.textContent='#pushSettings{margin:12px 0;background:#101118;border:1px solid #403447;border-radius:16px;padding:14px}#pushSettings strong{font-size:16px}#pushSettings .push-actions{display:flex;gap:8px;flex-wrap:wrap}#pushSettings .push-actions button{flex:1 1 125px;min-height:48px}#pushSettings .muted{margin:9px 0;font-size:13px}';
document.head.append(css);
const location=document.getElementById('message')?.parentElement||document.querySelector('main');
if(document.getElementById('message')?.parentElement)document.getElementById('message').parentElement.after(root);
else document.querySelector('main')?.insertAdjacentElement('afterbegin',root);
const $=id=>document.getElementById(id);
let pending=false,worker=null;
function available(){return location?.parentElement&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&isSecureContext}
function state(text,connected=false){$('pushStatus').textContent=text;$('pushEnable').hidden=connected;$('pushTest').hidden=!connected;$('pushDisable').hidden=!connected}
function info(text){$('pushFeedback').textContent=text}
async function auth(){
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.access_token)throw new Error('Сначала войди в рабочий аккаунт TEPLO');
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
 if(!worker)worker=await navigator.serviceWorker.register('./teplo-sw.js?v=49',{scope:'./',updateViaCache:'none'});
 return worker;
}
async function status(){
 if(!available()){state('Не поддерживается');info('Открой сайт в Chrome на Android или установи веб-приложение на экран iPhone.');$('pushEnable').disabled=true;return}
 if(Notification.permission==='denied'){state('Запрещено');info('Разреши уведомления для этого сайта в настройках браузера.');$('pushEnable').disabled=true;return}
 try{
  const reg=await registration();
  const subscription=await reg.pushManager.getSubscription();
  if(subscription){state('На устройстве включено',true);info('Это устройство уже подписано. Нажми «Проверить», чтобы убедиться в доставке.')}
  else {state('Не подключено');info('Нажми «Включить push», чтобы получать уведомления при закрытой вкладке.')}
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
  const binary=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));
  const key=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const reg=await registration();
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const {error}=await db.rpc('teplo_push_save_subscription',{p_subscription:sub.toJSON()});
  if(error)throw error;
  state('Включено',true);info('Устройство зарегистрировано. Теперь отправь тестовое уведомление.');
 }catch(e){info('Не удалось включить: '+(e?.message||String(e)))}
 finally{pending=false;$('pushEnable').disabled=false}
};
$('pushTest').onclick=async()=>{
 if(pending)return;pending=true;$('pushTest').disabled=true;
 try{const token=await auth();const result=await invoke('/test',token,{});info(result.sent?'Тестовое уведомление отправлено на телефон.':'Нет доступных подписок. Попробуй переподключить push.')}
 catch(e){info('Ошибка теста: '+(e?.message||String(e)))}
 finally{pending=false;$('pushTest').disabled=false}
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
