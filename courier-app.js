import {CourierView} from './courier-view.js?v=65';
import {ACTIVE,canClaim} from './courier-model.js?v=65';
const $=id=>document.getElementById(id);
const preview=location.pathname.endsWith('/courier-preview.html')||new URLSearchParams(location.search).get('preview')==='1';
let db=null,uid=null,loading=false,mutating=false,state=null,historyLimit=80,previewStage='accepted',refreshAgain=false;
let assignedSeen=new Set(),noticeQueue=[],noticeJob=null,sessionId=null;
const notify=(text,kind='info')=>window.TEPLOTouch?.notify?.(text,kind);
const view=new CourierView({step,claim,reportIssue,moreHistory:async()=>{historyLimit+=80;await load();}});
function notice(text){$('connectionNotice').hidden=!text;$('connectionNotice').textContent=text;}
function refreshView(){if(!state)return;state.online=navigator.onLine;state.mutating=mutating;state.canClaim=canClaim({activeCount:state.active.length,shift:state.shift,role:state.role,busy:mutating,online:state.online});view.update(state);}
function lock(message){state=null;view.selected=null;$('loading').hidden=true;$('app').hidden=true;$('tabbar').hidden=true;$('routeActions').hidden=true;document.body.classList.remove('has-route-action');$('lock').hidden=false;$('lockText').textContent=message;if($('incomingDialog').open)$('incomingDialog').close();if($('issueDialog').open)$('issueDialog').close();}
function reveal(){ $('loading').hidden=true;$('lock').hidden=true;$('app').hidden=false;$('tabbar').hidden=false; }
function authRequired(){lock('Войди в подтверждённый аккаунт курьера. Доступ назначает владелец TEPLO.');}
async function allEarnings(userId){const rows=[];for(let start=0;;start+=500){const {data,error}=await db.from('teplo_pilot_earnings').select('job_id,amount_uah,recorded_at').eq('courier_id',userId).order('recorded_at',{ascending:false}).order('job_id').range(start,start+499);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<500)return rows;}}
const jobColumns='id,shop_name_snapshot,shop_address_snapshot,order_summary,ready_in_minutes,ready_at,customer_name,customer_phone,delivery_address,status,created_at,assigned_at,accepted_at,picked_up_at,delivered_at,delivery_fee_uah,courier_reward_uah';
async function load(){
 if(preview){await loadPreview();return;}
 if(loading){refreshAgain=true;return;}loading=true;$('refresh').disabled=true;
 try{
  const {data:auth,error:authError}=await db.auth.getUser();if(authError)throw authError;const user=auth?.user;
  if(!user){authRequired();return;}
  if(!user.email_confirmed_at){lock('Сначала подтверди электронную почту и войди ещё раз.');return;}
  if(sessionId!==user.id){sessionId=user.id;state=null;view.selected=null;assignedSeen=new Set();noticeQueue=[];historyLimit=80;}
  uid=user.id;
  const {data:profile,error:profileError}=await db.from('profiles').select('role,full_name').eq('id',uid).single();if(profileError)throw profileError;
  if(!['courier','admin'].includes(profile?.role)){lock('Для этого кабинета нужна роль курьера. Попроси владельца проверить доступ в панели команды.');return;}
  const [activeResult,historyResult,shiftResult,earnings,openResult]=await Promise.all([
   db.from('teplo_pilot_jobs').select(jobColumns).eq('courier_id',uid).in('status',ACTIVE).order('created_at'),
   db.from('teplo_pilot_jobs').select(jobColumns).eq('courier_id',uid).in('status',['delivered','cancelled']).order('created_at',{ascending:false}).order('id').range(0,historyLimit),
   db.from('courier_shifts').select('id,started_at,ended_at').eq('courier_id',uid).is('ended_at',null).order('started_at',{ascending:false}).limit(1),
   allEarnings(uid),db.rpc('teplo_pilot_open_jobs_eta')
  ]);
  for(const r of [activeResult,historyResult,shiftResult,openResult])if(r.error)throw r.error;
  const active=activeResult.data||[],stops=new Map();
  if(active.length){const {data,error}=await db.from('teplo_pilot_job_stops').select('job_id,stop_number,shop_name_snapshot,shop_address_snapshot,ready_at').in('job_id',active.map(j=>j.id)).order('stop_number');if(error)throw error;for(const row of data||[]){if(!stops.has(row.job_id))stops.set(row.job_id,[]);stops.get(row.job_id).push(row);}}
  const currentShift=shiftResult.data?.[0];
  state={active,history:(historyResult.data||[]).slice(0,historyLimit),moreHistory:(historyResult.data||[]).length>historyLimit,open:openResult.data||[],earnings,stops,shift:!!currentShift,shiftStarted:currentShift?.started_at,role:profile.role,name:profile.full_name||'Курьер',email:user.email||''};
  if(document.activeElement!==$('profileName'))$('profileName').value=profile.full_name||'';
  reveal();refreshView();notice('');announceAssignments(active);
 }catch(e){if(!state)lock('Не удалось загрузить кабинет. Проверь интернет и нажми обновление.');notice(navigator.onLine?'Нет связи с сервером. На экране последние полученные данные. Повтори обновление.':'Нет интернета. На экране последние полученные данные.');}
 finally{loading=false;$('refresh').disabled=false;if(refreshAgain){refreshAgain=false;queueMicrotask(()=>void load());}}
}
async function mutation(action,success){
 if(preview){notify('Это предпросмотр. Данные заказов не меняются.');return false;}
 if(mutating)return false;
 if(!navigator.onLine){notify('Нет интернета. Действие не отправлено.','error');return false;}
 mutating=true;refreshView();
 try{const {error}=await action();if(error)throw error;notify(success,'success');await load();return true;}
 catch(e){notify(e.message||'Не удалось подтвердить действие. Обнови заказ и повтори.','error');await load();return false;}
 finally{mutating=false;refreshView();}
}
async function step(job,action){
 if(preview){notify('Предпросмотр: этап заказа не меняется.');return;}
 if(action==='declined'&&!confirm('Вернуть назначенный заказ в очередь?'))return;
 if(action==='picked_up'&&!confirm(view.stopList(job).length>1?'Подтверждаешь, что получил заказ во всех заведениях?':'Подтверждаешь, что забрал заказ?'))return;
 if(action==='delivered'&&!confirm('Подтверждаешь, что заказ вручен получателю?'))return;
 await mutation(()=>db.rpc('teplo_pilot_courier_step',{p_job_id:job.id,p_action:action}),action==='declined'?'Заказ возвращён в очередь':'Этап доставки сохранён');
}
async function claim(job){const ok=await mutation(()=>db.rpc('teplo_pilot_claim_job',{p_job_id:job.id}),'Заказ закреплён за тобой');if(ok)view.openJob(job.id);}
async function reportIssue(job,text){
 if(preview)throw new Error('Предпросмотр: сообщение не отправляется.');
 if(!job||!state?.active.some(j=>j.id===job.id))throw new Error('Заказ уже недоступен. Обнови список.');
 if(!navigator.onLine)throw new Error('Нет интернета. Текст остаётся здесь — повтори после подключения.');
 const {error}=await db.rpc('teplo_courier_report_issue',{p_job_id:job.id,p_note:text});if(error)throw error;
}
$('refresh').onclick=()=>void load();
$('shiftButton').onclick=()=>void mutation(()=>db.rpc('teplo_toggle_courier_shift',{p_start:!state.shift}),state.shift?'Смена завершена':'Смена открыта');
$('saveProfile').onclick=async()=>{if(preview){notify('Предпросмотр: имя не сохраняется.');return;}const name=$('profileName').value.trim().replace(/\s+/g,' ');if(name.length<2||name.length>80){$('profileMsg').textContent='Введи имя от 2 до 80 символов.';return;}const b=$('saveProfile');b.disabled=true;try{const {data,error}=await db.from('profiles').update({full_name:name}).eq('id',uid).select('full_name').single();if(error)throw error;if(data?.full_name!==name)throw new Error('Изменение не подтверждено');$('profileMsg').textContent='Имя сохранено.';await load();}catch(e){$('profileMsg').textContent=e.message||'Не удалось сохранить имя.';}finally{b.disabled=false;}};
$('logout').onclick=async()=>{if(preview){notify('Предпросмотр: вход в аккаунт не выполнялся.');return;}if(!confirm('Выйти из аккаунта? Смена останется открытой до её завершения.'))return;const {error}=await db.auth.signOut();if(error){notify(error.message,'error');return;}location.replace('courier-start.html?v=65');};
function announceAssignments(active){const fresh=active.filter(j=>j.status==='assigned'&&!assignedSeen.has(j.id));for(const j of fresh){assignedSeen.add(j.id);noticeQueue.push(j.id);}if(noticeJob&&!active.some(j=>j.id===noticeJob&&j.status==='assigned')){$('incomingDialog').close();noticeJob=null;}noticeQueue=noticeQueue.filter(id=>active.some(j=>j.id===id&&j.status==='assigned'));showIncoming();}
function showIncoming(){if(noticeJob||!noticeQueue.length||$('issueDialog').open)return;noticeJob=noticeQueue.shift();const job=state.active.find(j=>j.id===noticeJob);if(!job){noticeJob=null;return;}$('incomingTitle').textContent='Заказ №'+job.id.slice(0,8).toUpperCase();$('incomingRoute').textContent=(job.shop_name_snapshot||'Заведение')+' → '+job.delivery_address;$('incomingReward').textContent='За доставку '+Number(job.courier_reward_uah||0)+' ₴';$('incomingDialog').showModal();try{navigator.vibrate?.([200,100,200]);}catch{}}
function dismissIncoming(open){const id=noticeJob;$('incomingDialog').close();noticeJob=null;if(open&&id)view.openJob(id);showIncoming();}
$('incomingOpen').onclick=()=>dismissIncoming(true);$('incomingLater').onclick=()=>dismissIncoming(false);$('incomingDialog').addEventListener('cancel',()=>{noticeJob=null;});$('issueDialog').addEventListener('close',()=>showIncoming());
window.addEventListener('offline',()=>{notice('Нет интернета. Действия временно недоступны. Заказы на экране сохранены.');refreshView();});
window.addEventListener('online',()=>void load());
let resumeLoad=false;document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
async function loadPreview(){const {makePreview}=await import('./courier-preview.js?v=65');state=makePreview(previewStage);reveal();refreshView();$('profileName').value=state.name;$('loading').hidden=true;}
if(preview){$('previewBanner').hidden=false;$('previewStage').onchange=()=>{previewStage=$('previewStage').value;view.selected=null;void loadPreview();};document.querySelector('[data-teplo-push-settings]').textContent='Уведомления подключаются в рабочем кабинете после входа.';await loadPreview();}
else{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');db.auth.onAuthStateChange(()=>{if(resumeLoad)return;resumeLoad=true;setTimeout(()=>{resumeLoad=false;void load();},0);});await load();await import('./teplo-push-client.js?v=65');setInterval(()=>{if(!document.hidden&&navigator.onLine&&!mutating&&!$('issueDialog').open&&!$('incomingDialog').open)void load();},8000);}
