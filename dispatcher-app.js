import {loadJobCustomerComments} from './customer-comment.js?v=74';
import {syncDeliveryTiming,deliveryClock} from './delivery-timer.js?v=68';
import {dispatchCard,readCardDraft,restoreCardDraft} from './dispatcher-card.js?v=74';
import {dispatchStatus,dispatchAttention,dispatchCounts,visibleDispatchJobs,unresolvedDispatchIssues} from './dispatcher-board-model.js?v=69';
import {initDispatcherWorkspace} from './dispatcher-workspace.js?v=69';
import {mountBuyerOrders} from './pilot-buyer-dispatch.js?v=74';
const preview=new URLSearchParams(location.search).get('preview')==='1';
const db=preview?(await import('./dispatcher-preview.js?v=74')).previewDatabase():
 (await import('https://esm.sh/@supabase/supabase-js@2')).createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
initDispatcherWorkspace();
if(preview){document.getElementById('demoLabel').textContent='ПРЕВЬЮ · вымышленные данные';document.getElementById('roleLinks').hidden=true;}
else {void import('./role-portal.js?v=68');void import('./teplo-push-client.js?v=64');}
const $=id=>document.getElementById(id),txt=(tag,t='',cls='')=>{const e=document.createElement(tag);e.textContent=String(t??'');if(cls)e.className=cls;return e};
const uah=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
let canManage=false;let busy=false;let currentUser=null;let couriers=[];let slots=[],selectedSlotDate='';
let authEpoch=0;
let mutation=false,search='',courierId=null,issues=new Map(),jobStops=new Map();const drafts=new Map();
let selectedCallId=new URLSearchParams(location.search).get('job')||null,callFilter='active',callRows=[],lastCallSignature=null,lastSlotsSignature=null;
const slotDay=t=>new Date(t).toLocaleDateString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',weekday:'short'});
const slotClock=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
const slotDateKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
let initialQueue=true,noticeUser=null,announcedRequests=new Set(),incomingQueue=[],incomingShowing=null,focusBeforeIncoming=null;
function displayIncoming(){
 if(incomingShowing||!incomingQueue.length)return;
 const j=incomingQueue.shift();
 incomingShowing=j;focusBeforeIncoming=document.activeElement;
 const buyer=j.noticeKind==='buyer';
 $('incomingTitle').textContent=(buyer?'Заказ покупателя №':'Новая заявка №')+j.id.slice(0,8).toUpperCase();
 $('incomingCaption').textContent=buyer?'Поступил заказ покупателя. Начни обработку заведений.':'Новая заявка ожидает назначения.';
 $('incomingOpen').textContent=buyer?'Открыть заказ':'Открыть заявку';
 $('incomingShop').textContent=j.shop_name_snapshot||'Сборный заказ TEPLO';
 $('incomingPickup').textContent=j.noticeKind==='buyer'?'Несколько заведений — смотри состав внутри заказа':j.shop_address_snapshot||'Адрес забора не указан';
 $('incomingDropoff').textContent=j.delivery_address||'Адрес доставки не указан';
 $('incomingPrice').textContent=uah(j.delivery_fee_uah);
 $('incomingOverlay').hidden=false;$('incomingOpen').focus();
 try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)navigator.vibrate?.([290,120,380,130,330])}catch{}
}
function closeIncoming(){
 $('incomingOverlay').hidden=true;incomingShowing=null;
 if(focusBeforeIncoming?.isConnected)focusBeforeIncoming.focus();
 focusBeforeIncoming=null;
 displayIncoming();
}
$('incomingLater').onclick=closeIncoming;
$('incomingOpen').onclick=()=>{
 const job=incomingShowing;const id=job?.id;closeIncoming();
 if(job?.noticeKind==='buyer'){
  window.TEPLOWorkspace?.show('buyers');window.TEPLOBuyerOrders?.open(id);return;
 }
 window.TEPLOWorkspace?.show('calls');selectedCallId=id;callFilter='active';renderCallQueue();
 $('deliveryArea').dataset.mobileView='detail';
 $('deliveryDetail').scrollIntoView({behavior:'smooth',block:'start'});
};
document.addEventListener('keydown',e=>{
 if($('incomingOverlay').hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeIncoming();return}
 if(e.key!=='Tab')return;
 const buttons=[...$('incomingDialog').querySelectorAll('button:not(:disabled)')];
 const first=buttons[0],last=buttons[buttons.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});
function alertForIncoming(rows){
 const pending=rows.filter(j=>j.status==='new');
 incomingQueue=incomingQueue.filter(j=>j.noticeKind==='buyer'||pending.some(x=>x.id===j.id));
 if(incomingShowing?.noticeKind!=='buyer'&&incomingShowing&&!pending.some(x=>x.id===incomingShowing.id))closeIncoming();
 if(initialQueue){initialQueue=false;for(const job of pending)announcedRequests.add(job.id);return}
 const fresh=pending.filter(j=>!announcedRequests.has(j.id));
 for(const job of fresh){announcedRequests.add(job.id);incomingQueue.push(job)}
 if(fresh.length){
  $('message').textContent='Новых заявок: '+fresh.length;
  displayIncoming();
 }
}
window.TEPLODispatcherAlert={buyer(order){
 if(!order?.id)return;
 incomingQueue.push({...order,noticeKind:'buyer',delivery_fee_uah:order.delivery_fee});
 displayIncoming();
}};
function renderSlots(){
 const root=$('slotManager'),picker=$('slotDayFilter');root.replaceChildren();
 const days=[...new Map(slots.map(s=>[slotDateKey(s.slot_start),s.slot_start])).entries()];
 if(!days.some(x=>x[0]===selectedSlotDate))selectedSlotDate=days[0]?.[0]||'';
 picker.replaceChildren();
 for(const [key,start] of days){const option=txt('option',slotDay(start));option.value=key;picker.append(option)}
 picker.value=selectedSlotDate;
 for(const slot of slots.filter(x=>slotDateKey(x.slot_start)===selectedSlotDate)){
  const card=txt('div','','courier-row');
  const info=txt('div','','teplo-slot-manager-cap');info.append(txt('div',slotClock(slot.slot_start)+' – '+slotClock(slot.slot_end),'teplo-slot-manager-time'),txt('div','Свободно '+Math.max(0,slot.capacity-slot.booked)+' из '+slot.capacity+' · '+(slot.is_open?'Приём открыт':'Приём закрыт'),'teplo-slot-manager-free'));
  const actions=txt('div','','actions'),selector=document.createElement('select');
  selector.setAttribute('aria-label','Вместимость слота '+slotDay(slot.slot_start));
  for(let n=1;n<=12;n++){const option=txt('option',String(n)+' мест');option.value=n;selector.append(option)}
  if(slot.capacity>12){const option=txt('option',slot.capacity+' мест');option.value=slot.capacity;selector.append(option)}
  selector.value=String(slot.capacity);
  const toggle=txt('button',slot.is_open?'Закрыть слот':'Открыть слот','secondary');
  const save=txt('button','Сохранить места','secondary');
  const msg=txt('p','','muted');
  async function change(capacity,open){
   toggle.disabled=true;save.disabled=true;
   try{const {error}=await db.rpc('teplo_pilot_manage_slot',{p_slot_id:slot.id,p_capacity:capacity,p_is_open:open});
    if(error)throw error;TEPLOTouch.notify('Слот обновлён','success');await load();
   }catch(e){msg.textContent='Ошибка: '+(e?.message||String(e))}
   finally{toggle.disabled=false;save.disabled=false}
  }
  toggle.onclick=()=>mutate(()=>change(Number(selector.value),!slot.is_open));
  save.onclick=()=>mutate(()=>change(Number(selector.value),slot.is_open));
  actions.append(selector,save,toggle,msg);card.append(info,actions);root.append(card);
 }
 if(!root.children.length)root.append(txt('p','Нет доступных слотов на этот день.','muted'));
}
$('slotDayFilter').addEventListener('change',e=>{selectedSlotDate=e.target.value;renderSlots()});
async function release(job,btn,feedback){
 if(!confirm('Вернуть ещё не забранный тестовый заказ в общую очередь?'))return;
 btn.disabled=true;
 try{const {error}=await db.rpc('teplo_pilot_release_job',{p_job_id:job.id});
 if(error)throw error;TEPLOTouch.notify('Заказ возвращён в очередь','success');await load()}
 catch(e){feedback.textContent='Ошибка: '+(e?.message||String(e))}
 finally{btn.disabled=false}
}
async function move(job,target,btn,feedback){
 if(!target){feedback.textContent='Выбери слот';return}
 btn.disabled=true;
 try{const {error}=await db.rpc('teplo_pilot_move_job',{p_job_id:job.id,p_slot_id:target});
 if(error)throw error;TEPLOTouch.notify('Заказ перенесён','success');await load()}
 catch(e){feedback.textContent='Ошибка: '+(e?.message||String(e))}
 finally{btn.disabled=false}
}
async function assign(job,id,button,feedback){
 if(!id){feedback.textContent='Сначала выбери курьера.';return}
 TEPLOTouch.busy(button,true,'Назначаем');feedback.textContent='Назначаем…';TEPLOTouch.notify('Передаём заявку курьеру…','progress');
 try{
  const {error}=await db.rpc('teplo_assign_pilot_job',{p_job_id:job.id,p_courier_id:id});
  if(error)throw error;
  feedback.textContent='Курьер назначен.';TEPLOTouch.notify('Курьер назначен','success');TEPLOTouch.done(button);await load();
 }catch(e){feedback.textContent='Ошибка: '+(e?.message||String(e));TEPLOTouch.notify('Не удалось назначить: '+(e?.message||String(e)),'error')}
 finally{TEPLOTouch.busy(button,false)}
}
async function cancel(job,button,feedback){
 if(!confirm('Отменить тестовую заявку?'))return;
 TEPLOTouch.busy(button,true,'Отменяем');feedback.textContent='Отменяем…';
 try{
  const {error}=await db.rpc('teplo_cancel_pilot_job',{p_job_id:job.id});
  if(error)throw error;TEPLOTouch.notify('Заявка отменена','success');await load();
 }catch(e){feedback.textContent='Ошибка: '+(e?.message||String(e));TEPLOTouch.notify('Не удалось отменить','error')}
 finally{TEPLOTouch.busy(button,false)}
}
function renderCallQueue(){
 const list=$('list'),details=$('deliveryDetail'),section=$('deliveryArea');
 const draft=readCardDraft(details);if(draft)drafts.set(draft.id,draft);
 list.replaceChildren();details.replaceChildren();
 const counts=dispatchCounts(callRows,couriers,slots,issues,deliveryClock.now());
 const visible=visibleDispatchJobs(callRows,{filter:callFilter,search,courierId,slots,couriers,issues,now:deliveryClock.now()});
 if(!visible.some(j=>j.id===selectedCallId))selectedCallId=visible[0]?.id||null;
 if(new URLSearchParams(location.search).get('job')===selectedCallId)section.dataset.mobileView='detail';
 const controls=$('callFilters');controls.replaceChildren();
 for(const [key,label] of [['active','В работе'],['new','Назначить'],['attention','Внимание']]){
  const b=txt('button',label+' · '+counts[key],'secondary');b.type='button';b.setAttribute('aria-pressed',String(callFilter===key));
  b.onclick=()=>selectFilter(key);controls.append(b);
 }
 $('archiveButton').setAttribute('aria-pressed',String(callFilter==='done'));
 $('queueCaption').textContent=(callFilter==='done'?'Архив · последние 80':callFilter==='all'?'Все заказы':courierId?'Заказы курьера':'Очередь доставок')+' · '+visible.length;
 $('clearCourier').hidden=!courierId;
 window.TEPLOWorkspace?.setCount('calls',counts.active);
 if(!visible.length)list.append(txt('p',search?'Поиск ничего не нашёл.':callFilter==='attention'?'Всё под контролем. Проблемных доставок нет.':'Заказов в этом разделе пока нет.','empty-state'));
 for(const job of visible){
  const b=txt('button','','queue-entry'),top=txt('span','','queue-top');b.type='button';b.setAttribute('aria-current',String(job.id===selectedCallId));
  const problems=dispatchAttention(job,slots,couriers,issues,deliveryClock.now());if(problems.length)b.classList.add('needs-attention');
  top.append(txt('strong','№'+job.id.slice(0,8).toUpperCase()),txt('span',dispatchStatus[job.status]||job.status,'queue-state'));
  b.append(top,txt('span',job.delivery_address||'Адрес не указан','queue-address'),txt('span',job.shop_name_snapshot||'Заведение','queue-venue'));
  if(problems.length)b.append(txt('small',problems[0],'queue-warning'));
  else b.append(txt('small',couriers.find(c=>c.id===job.courier_id)?.name||'Ожидает назначения','muted'));
  b.onclick=()=>{selectedCallId=job.id;section.dataset.mobileView='detail';renderCallQueue();details.scrollIntoView({block:'start'})};list.append(b);
 }
 const current=callRows.find(j=>j.id===selectedCallId);
 if(!current){section.dataset.mobileView='list';details.append(txt('p','Здесь появятся детали выбранного заказа.','empty-state'));return}
 const back=txt('button','← Все заказы','detail-back');back.type='button';back.onclick=()=>{section.dataset.mobileView='list';list.querySelector('[aria-current="true"]')?.focus()};
 details.append(back,dispatchCard({job:current,couriers,slots,issues,stops:jobStops.get(current.id)||[],db,callbacks:{
  assign:(...args)=>mutate(()=>assign(...args)),release:(...args)=>mutate(()=>release(...args)),move:(...args)=>mutate(()=>move(...args)),cancel:(...args)=>mutate(()=>cancel(...args)),zone,manual,
  openSource:id=>{window.TEPLOWorkspace.show('buyers');window.TEPLOBuyerOrders?.open(id)}
 }}));restoreCardDraft(details,drafts.get(current.id));
}
function selectFilter(filter){callFilter=filter;selectedCallId=null;$('deliveryArea').dataset.mobileView='list';renderCallQueue()}
async function mutate(action){if(mutation||busy||!canManage||!navigator.onLine)return;mutation=true;try{await action()}finally{mutation=false;await load()}}
async function zone(job,code,button,feedback){
 if(!code){feedback.textContent='Выбери зону.';return}const note=prompt('Причина уточнения зоны (от 5 символов):');if(!note||note.trim().length<5)return;
 await mutate(async()=>{button.disabled=true;try{const {error}=await db.rpc('teplo_set_delivery_zone',{p_job_id:job.id,p_zone:code,p_note:note.trim()});if(error)throw error;TEPLOTouch.notify('Зона уточнена','success')}catch(e){feedback.textContent=e.message||String(e)}finally{button.disabled=false}});
}
async function manual(job,note,button,feedback){
 if(note.length<12){feedback.textContent='Укажи причину и подтверждение вручения: от 12 символов.';return}if(!confirm('Подтверждаешь, что тестовый заказ вручен получателю?'))return;
 await mutate(async()=>{button.disabled=true;try{const {error}=await db.rpc('teplo_dispatch_confirm_manual_delivery',{p_job_id:job.id,p_note:note});if(error)throw error;TEPLOTouch.notify('Вручение подтверждено','success')}catch(e){feedback.textContent=e.message||String(e)}finally{button.disabled=false}});
}
async function loadBoardExtras(rows){
 const notes=[],stops=[];
 for(let i=0;i<rows.length;i+=100){const ids=rows.slice(i,i+100).map(j=>j.id);
  for(let offset=0;;offset+=500){const {data,error}=await db.from('teplo_dispatch_notes').select('id,job_id,kind,note,created_at').in('job_id',ids).in('kind',['issue','resolved']).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);if(error)throw error;notes.push(...(data||[]));if((data||[]).length<500)break;}
  for(let offset=0;;offset+=500){const {data,error}=await db.from('teplo_pilot_job_stops').select('job_id,shop_name_snapshot,shop_address_snapshot,ready_at,stop_number').in('job_id',ids).order('stop_number').range(offset,offset+499);if(error)throw error;stops.push(...(data||[]));if((data||[]).length<500)break;}
 }
 return {issues:unresolvedDispatchIssues(notes),stops:new Map(rows.map(j=>[j.id,stops.filter(s=>s.job_id===j.id)]))};
}
function renderRoster(){
 const root=$('courierRoster');root.replaceChildren();
 for(const c of [...couriers].sort((a,b)=>Number(b.onShift)-Number(a.onShift)||a.activeJobs-b.activeJobs)){
  const row=txt('article','','courier-row'),info=txt('div','','courier-label');info.append(txt('strong',c.name),txt('p',c.role==='admin'?'Тестовый аккаунт администратора':!c.onShift?'Вне смены':c.activeJobs>=2?'Занят · 2 из 2':c.activeJobs?'На смене · 1 из 2':'Свободен · 0 из 2','muted'));const open=txt('button','Заказы','secondary');open.type='button';open.onclick=()=>{courierId=c.id;callFilter='active';window.TEPLOWorkspace.show('calls');renderCallQueue()};row.append(info,open);root.append(row);
 }
 if(!couriers.length)root.append(txt('p','Подтверждённых курьеров пока нет.','empty-state'));
 const free=couriers.filter(c=>c.onShift&&c.activeJobs<2&&c.role!=='admin');$('courierQuickStrip').replaceChildren(txt('span',free.length?'На смене · '+free.map(c=>c.name.split(' ')[0]+' '+c.activeJobs+'/2').join(' · '):'Нет доступных курьеров на смене'));
 const go=txt('button','Открыть','text-button');go.onclick=()=>window.TEPLOWorkspace.show('couriers');$('courierQuickStrip').append(go);
}
function clearPrivate(message){authEpoch++;canManage=false;currentUser=null;couriers=[];callRows=[];issues=new Map();jobStops=new Map();drafts.clear();lastCallSignature=null;for(const id of ['courierRoster','list','deliveryDetail','stats','slotManager','courierQuickStrip'])$(id).replaceChildren();$('message').textContent=message;$('role').textContent='Нужен вход';$('incomingOverlay').hidden=true;incomingShowing=null;incomingQueue=[];window.TEPLOWorkspace?.setCount('calls',0);window.TEPLOWorkspace?.setCount('buyers',0);$('dispatchAccess').hidden=false;window.dispatchEvent(new Event('teplo:dispatch-signed-out'));}
async function loadDeliveryJobs(){
 const columns='id,slot_id,source_order_id,shop_name_snapshot,shop_address_snapshot,order_summary,ready_in_minutes,customer_name,customer_phone,delivery_address,status,courier_id,created_at,updated_at,assigned_at,accepted_at,picked_up_at,ready_at,delivery_fee_uah,courier_reward_uah,delivery_zone,delivery_minutes,delivery_due_at,delivered_at';
 const active=[];
 for(let start=0;;start+=500){
  const {data,error}=await db.from('teplo_pilot_jobs').select(columns).in('status',['new','assigned','accepted','picked_up']).order('created_at').order('id').range(start,start+499);
  if(error)return {error};active.push(...(data||[]));if((data||[]).length<500)break;
 }
 const {data,error}=await db.from('teplo_pilot_jobs').select(columns).in('status',['delivered','cancelled']).order('created_at',{ascending:false}).order('id').limit(80);
 return error?{error}:{data:[...active,...(data||[])]};
}
window.addEventListener('teplo:open-delivery',async event=>{
 const id=event.detail?.id;if(typeof id!=='string')return;
 await load();
 if(!canManage)return;
 if(!callRows.some(j=>j.id===id)){
  try{
   const {data,error}=await db.from('teplo_pilot_jobs').select('*').eq('id',id).single();
   if(error)throw error;callRows.push(data);
  }catch{$('message').textContent='Не удалось открыть доставку. Обнови список и проверь доступ.';return}
 }
 selectedCallId=id;callFilter='all';window.TEPLOWorkspace?.show('calls');renderCallQueue();$('deliveryArea').dataset.mobileView='detail';
});
async function load(){
 if(busy||mutation)return;const accessVersion=authEpoch;busy=true;$('refresh').disabled=true;
 try{
  const {data:session,error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
  if(!session?.session){clearPrivate('Войди в TEPLO, чтобы открыть диспетчерскую.');return}
  const {data,error:ae}=await db.auth.getUser();if(ae){if(ae.status===401||ae.status===403||ae.name==='AuthSessionMissingError'){clearPrivate('Сессия завершена. Войди снова.');return}throw ae;}
  if(accessVersion!==authEpoch)return;
  const user=data?.user;if(!user){clearPrivate('Сессия завершена. Войди снова.');return}
  if(currentUser?.id&&currentUser.id!==user.id){clearPrivate('Проверяем доступ…');setTimeout(()=>void load(),0);return}currentUser=user;canManage=false;
  if(user.id!==noticeUser){noticeUser=user.id;initialQueue=true;announcedRequests=new Set();incomingQueue=[];incomingShowing=null;$('incomingOverlay').hidden=true;}
  const {data:p,error:pe}=await db.from('profiles').select('role').eq('id',user.id).single();if(pe)throw pe;
  if(!['admin','dispatcher'].includes(p.role)||!user.email_confirmed_at){clearPrivate('Нужен подтверждённый аккаунт диспетчера или администратора.');$('role').textContent='Нет доступа';return}
  if(accessVersion!==authEpoch)return;canManage=true;$('dispatchAccess').hidden=true;
  $('role').textContent=p.role==='admin'?'Администратор':'Диспетчер';
  const [{data:roster,error:re},{data:jobs,error:je},{count:adminActive,error:adminCountError},{data:slotRows,error:slotError}]=await Promise.all([
    db.rpc('teplo_dispatch_courier_roster'),
    loadDeliveryJobs(),
    db.from('teplo_pilot_jobs').select('id',{count:'exact',head:true}).eq('courier_id',currentUser.id).in('status',['assigned','accepted','picked_up']),
    db.rpc('teplo_pilot_list_slots')
  ]);
  if(re)throw re;if(je)throw je;if(adminCountError)throw adminCountError;if(slotError)throw slotError;
  await loadJobCustomerComments(db,jobs||[]);
  const extra=await loadBoardExtras(jobs||[]);if(accessVersion!==authEpoch)return;issues=extra.issues;jobStops=extra.stops;
  slots=slotRows||[];
  const slotSignature=JSON.stringify(slots.map(x=>[x.id,x.slot_start,x.capacity,x.is_open,x.booked]));
  if(slotSignature!==lastSlotsSignature && !($('slotManager').contains(document.activeElement) && document.activeElement?.tagName==='SELECT')){
   lastSlotsSignature=slotSignature;renderSlots();
  }
  window.dispatchEvent(new Event('teplo:sync-ok'));

  
  await syncDeliveryTiming(db);if(accessVersion!==authEpoch)return;
  const rows=jobs||[];
  callRows=rows;
  couriers=(roster||[]).map(x=>({
    id:x.id,
    name:x.full_name?.trim()||x.email||'Курьер',
    email:x.email,
    onShift:x.on_shift===true,
    activeJobs:Number(x.active_jobs||0)
  }));
  if(p.role==='admin')couriers.push({id:currentUser.id,name:'Я · тест курьера',email:'',role:'admin',onShift:true,activeJobs:Number(adminActive||0)});
  renderRoster();
  $('message').textContent='На связи · '+slotClock(Date.now());$('message').classList.remove('warning');
  const counts=dispatchCounts(rows,couriers,slots,issues,deliveryClock.now());
  $('stats').replaceChildren();for(const [label,count,target] of [['Назначить',counts.new,'new'],['Внимание',counts.attention,'attention'],['Курьеры',counts.available,'couriers']]){const item=txt('button','','stat-button');item.type='button';item.append(txt('strong',count),txt('span',label));item.onclick=()=>target==='couriers'?window.TEPLOWorkspace.show('couriers'):selectFilter(target);$('stats').append(item);}
  const signature=JSON.stringify({issues:[...issues],jobs:rows.map(j=>[j.id,j.status,j.courier_id,j.slot_id,j.updated_at,j.customer_comment,j.delivery_due_at,j.delivery_zone,dispatchAttention(j,slots,couriers,issues,deliveryClock.now()).join('|')]),couriers:couriers.map(c=>[c.id,c.activeJobs,c.onShift]),slots:slots.map(s=>[s.id,s.booked,s.capacity,s.is_open])});
  const editing=$('deliveryDetail').contains(document.activeElement)&&['SELECT','INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
  if(signature!==lastCallSignature&&!editing){lastCallSignature=signature;renderCallQueue()}
  alertForIncoming(rows);
 }catch(e){window.dispatchEvent(new Event('teplo:sync-error'));$('message').classList.add('warning');$('message').textContent='Нет обновления:  '+(e?.message||String(e))+'. Уже показанные заявки сохранены на экране.'}
 finally{busy=false;$('refresh').disabled=false}
}
$('refresh').onclick=()=>void load();
$('orderSearch').oninput=event=>{search=event.target.value;$('deliveryArea').dataset.mobileView='list';renderCallQueue()};
$('archiveButton').onclick=()=>selectFilter(callFilter==='done'?'active':'done');
$('allOrdersButton').onclick=()=>{window.TEPLOWorkspace.show('calls');selectFilter('all')};
$('clearCourier').onclick=()=>{courierId=null;renderCallQueue()};
window.addEventListener('teplo:dispatch-note-saved',()=>{lastCallSignature=null;void load()});
mountBuyerOrders(db,{preview});

document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
window.addEventListener('online',()=>void load());
window.setInterval(()=>{if(!document.hidden&&navigator.onLine)void load()},8000);
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clearPrivate('Сессия завершена. Войди снова.');setTimeout(()=>void load(),0)});
await load();
