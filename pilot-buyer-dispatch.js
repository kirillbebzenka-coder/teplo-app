export function mountBuyerOrders(db,{preview=false}={}){
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=String(text??'');if(cls)node.className=cls;return node};
const money=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
const day=t=>new Date(t).toLocaleDateString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit'});
const clock=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
const deliveryStates={new:'Ищем курьера',assigned:'Курьер назначен',accepted:'Курьер принял',picked_up:'Курьер забрал',delivered:'Доставлен',cancelled:'Отменён'};
const states={pending:'Не размещён',ordered:'Заказ размещён',confirmed:'Подтверждено',issue:'Проблема'};
const section=document.getElementById('buyerOrderArea');
const header=el('div','','row'),h2=el('h2','Подтверждения заведений'),refresh=el('button','Обновить','secondary');
refresh.type='button';header.append(h2,refresh);
section.append(header,el('p','Один заказ — одна карточка. Подтверждения заведений внутри.','muted'));
const filters=el('div','','buyer-filters'),extraFilters=el('details','','dispatch-disclosure buyer-extra-filters'),extraButtons=el('div','','buyer-filters');extraFilters.append(el('summary','История заказов покупателей'),extraButtons);
const shell=el('div','','queue-shell');
const root=el('div','','queue-list');root.id='buyerOrders';
const details=el('div','','queue-detail');details.id='buyerDetails';
shell.append(root,details);section.append(filters,extraFilters,shell);
let accessEpoch=0;
let busy=false,reloadPending=false,selectedId=new URLSearchParams(location.search).get('order')||null,activeFilter=new URLSearchParams(location.search).get('order')?'all':'work',lastSignature=null,seenBuyerIds=null,ordersCache=[],tasksCache=[],slotsCache=[],linksCache=[],autoCache=[];
const filterList=[['work','В обработке'],['issue','Проблемы'],['ready','К передаче'],['sent','Доставка'],['done','Завершены'],['all','Все']];
function orderState(order){
 const pieces=tasksCache.filter(t=>t.order_id===order.id);
 const link=linksCache.find(x=>x.source_order_id===order.id);
 if(link)return [['delivered','cancelled'].includes(link.status)?'done':'sent',deliveryStates[link.status]||link.status];
 if(!pieces.length||pieces.some(t=>t.state==='issue'))return ['issue','Требует решения'];
 if(pieces.every(t=>t.state==='confirmed'))return ['ready','Готов к передаче'];
 return ['work',pieces.filter(t=>t.state==='confirmed').length+'/'+pieces.length+' подтверждено'];
}
function matches(order){const state=orderState(order)[0];return activeFilter==='all'||(activeFilter==='work'?['work','ready','issue'].includes(state):state===activeFilter)}
function renderQueue(){
 const visible=ordersCache.filter(matches).sort((a,b)=>{
  const rank={issue:0,ready:1,work:2,sent:3};
  return (rank[orderState(a)[0]]??4)-(rank[orderState(b)[0]]??4)||new Date(a.created_at)-new Date(b.created_at);
 });
 if(!visible.some(o=>o.id===selectedId))selectedId=visible[0]?.id||null;
 if(new URLSearchParams(location.search).get('order')===selectedId)section.dataset.mobileView='detail';
 filters.replaceChildren();extraButtons.replaceChildren();
 for(const [key,label] of filterList){
  const count=ordersCache.filter(o=>key==='all'||(key==='work'?['work','ready','issue'].includes(orderState(o)[0]):orderState(o)[0]===key)).length;
  const b=el('button',label+' · '+count);b.type='button';b.setAttribute('aria-pressed',String(activeFilter===key));
  b.onclick=()=>{activeFilter=key;selectedId=null;section.dataset.mobileView='list';renderQueue()};(['sent','done','all'].includes(key)?extraButtons:filters).append(b);
 }
 root.replaceChildren();
 window.TEPLOWorkspace?.setCount('buyers',ordersCache.filter(o=>['work','issue','ready'].includes(orderState(o)[0])).length);
 if(!visible.length)root.append(el('p','Нет заказов по выбранному фильтру.','muted'));
 for(const order of visible){
  const state=orderState(order),item=el('button','','queue-entry'),top=el('span','','queue-top');
  item.type='button';item.setAttribute('aria-current',String(order.id===selectedId));
  top.append(el('strong','№'+order.id.slice(0,8).toUpperCase()),el('span',state[1],'queue-state'));
  const venues=tasksCache.filter(t=>t.order_id===order.id).map(t=>t.shop_name_snapshot);
  item.append(top,el('span',venues.length>1?'Сборный · '+venues.join(' + '):(venues[0]||'Заказ покупателя')),
   el('small',order.order_items.length+' позиций · '+tasksCache.filter(t=>t.order_id===order.id).length+' заведений · '+money(order.total)));
  item.onclick=()=>{selectedId=order.id;section.dataset.mobileView='detail';renderQueue();details.scrollIntoView({block:'start',behavior:'smooth'})};
  root.append(item);
 }
 details.replaceChildren();
 const current=ordersCache.find(o=>o.id===selectedId);
 if(!current){details.append(el('p','Выбери заказ из списка.','muted'));return}
 const back=el('button','← К списку','detail-back');back.onclick=()=>{section.dataset.mobileView='list';root.querySelector('[aria-current="true"]')?.focus()};
 details.append(back,card(current,tasksCache,slotsCache,linksCache));
}
function card(o,tasks,slots,links){
 const c=el('article','','job'),top=el('div','','row'),pieces=tasks.filter(t=>t.order_id===o.id);
 const linked=links.find(l=>l.source_order_id===o.id);
 const confirmed=pieces.length>0&&pieces.every(t=>t.state==='confirmed');
 top.append(el('strong','Заказ №'+o.id.slice(0,8).toUpperCase()),el('span',linked?(deliveryStates[linked.status]||linked.status):confirmed?'Подтверждён':'Ожидает обработки','pill'));
 const automatic=autoCache.find(x=>x.order_id===o.id);
 if(automatic&&!linked)c.append(el('p','Автопередача: '+automatic.reason,automatic.state==='error'?'warning':'muted'));
 c.append(top,el('p','Покупатель · '+new Date(o.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),'muted'));
 c.append(el('p','Получатель: '+o.customer_name+' · '+o.customer_phone));
 c.append(el('p','Адрес доставки: '+o.delivery_address));
 c.append(el('p','Стоимость товаров: '+money(o.subtotal)+' · Доставка: '+money(o.delivery_fee)+' · Итого: '+money(o.total)));
 if(linked){
  c.append(el('p','Доставка №'+linked.id.slice(0,8).toUpperCase()+' · '+(deliveryStates[linked.status]||linked.status),'muted'));
  const manage=el('button','Открыть управление доставкой','secondary');manage.type='button';
  manage.onclick=()=>window.dispatchEvent(new CustomEvent('teplo:open-delivery',{detail:{id:linked.id}}));c.append(manage);
 }
 if(!pieces.length)c.append(el('p','Не указаны заведения. Нельзя передать курьеру.','warning'));
 for(const task of pieces){
  const part=el('div','','route');part.append(el('strong',task.shop_name_snapshot+' · '+states[task.state]));
  part.append(el('p','Точка забора: '+(task.shop_address_snapshot||'Не указана'),'muted'));
  for(const item of o.order_items.filter(i=>i.shop_id===task.shop_id))
   part.append(el('p',item.product_name_snapshot+' ×'+item.quantity+' · '+money(item.line_total)));
  if(task.operator_note)part.append(el('p','Примечание: '+task.operator_note,'muted'));
  if(task.state==='confirmed')part.append(el('p',task.ready_at
   ?'Ориентир готовности: '+new Date(task.ready_at).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'})
   :'Время готовности не указано — задай его ниже.','muted'));
  if(!linked||(['new','assigned','accepted'].includes(linked.status)&&task.state==='confirmed')){
   const controls=el('div','','actions'),note=document.createElement('input'),msg=el('p','','muted');
   const readySelect=document.createElement('select');
   readySelect.setAttribute('aria-label','Через сколько минут готов заказ в '+task.shop_name_snapshot);
   for(const mins of [0,10,15,20,30,45,60,90,120,180]){
    const option=el('option',mins===0?'Уже готово':'Через '+mins+' мин');
    option.value=String(mins);if(mins===20)option.selected=true;readySelect.append(option);
   }
   if(task.state==='ordered'||task.state==='confirmed')part.append(el('p','Готовность по ответу заведения','mini-section-heading'),readySelect);
   note.placeholder='Комментарий / причина проблемы';note.maxLength=400;
   const choices=task.state==='pending'?[['ordered','Заказ размещён'],['issue','Проблема']]
    :task.state==='ordered'?[['confirmed','Подтверждено'],['issue','Проблема']]
    :task.state==='issue'?[['ordered','Разместить повторно']]:[['issue','Проблема']];
   for(const [next,label] of (linked?[]:choices)){
    const b=el('button',label,'secondary');b.type='button';
    b.onclick=async()=>{
     b.disabled=true;msg.textContent='Сохраняем…';
     try{
      const {error}=next==='confirmed'
       ?await db.rpc('teplo_dispatch_confirm_venue',{
        p_order_id:o.id,p_shop_id:task.shop_id,p_ready_minutes:Number(readySelect.value),p_note:note.value.trim()
       })
       :await db.rpc('teplo_dispatch_update_venue',{
        p_order_id:o.id,p_shop_id:task.shop_id,p_action:next,p_note:note.value.trim()
       });
      if(error)throw error;
      msg.textContent='Статус сохранён. Обновляем карточку…';
      await load(true);
     }catch(e){msg.textContent='Ошибка сохранения: '+(e?.message||String(e));b.disabled=false}
    };controls.append(b)
   }
   if(task.state==='confirmed'){
    const edit=el('button',task.ready_at?'Изменить готовность':'Указать готовность','secondary');
    edit.type='button';edit.onclick=async()=>{
     edit.disabled=true;msg.textContent='Сохраняем время готовности…';
     try{
      const {error}=await db.rpc('teplo_dispatch_set_venue_readiness',{
       p_order_id:o.id,p_shop_id:task.shop_id,p_ready_minutes:Number(readySelect.value)
      });
      if(error)throw error;
      await load(true);
     }catch(e){msg.textContent='Ошибка: '+(e?.message||String(e));edit.disabled=false}
    };
    controls.append(edit);
   }
   if(!linked&&task.state!=='confirmed')part.append(note);
   part.append(controls,msg);
  }
  c.append(part);
 }
 if(!linked){
  const select=document.createElement('select');select.setAttribute('aria-label','Слот заказа');select.hidden=true;
  const initial=el('option','Выбери временной слот');initial.value='';select.append(initial);
  for(const slot of slots.filter(s=>s.is_open&&s.booked<s.capacity)){
   const option=el('option',day(slot.slot_start)+' · '+clock(slot.slot_start)+'–'+clock(slot.slot_end)+' · '+slot.booked+'/'+slot.capacity);
   option.value=slot.id;select.append(option);
  }
  const picker=TEPLOSlotPicker.create(slots,{onChange:id=>{select.value=id}});
  const action=el('button','Передать курьерам');action.type='button';action.disabled=!confirmed||!pieces.every(t=>Boolean(t.ready_at))||select.options.length===1;
  const msg=el('p',confirmed?(pieces.every(t=>Boolean(t.ready_at))?'Все части подтверждены. Сервер подбирает слот автоматически. При необходимости выбери слот вручную.':'Укажи время готовности каждого заведения.'):'Сначала подтверди каждое заведение.','muted');
  action.onclick=async()=>{
   if(!select.value){msg.textContent='Выбери слот';return}
   action.disabled=true;msg.textContent='Формируем доставку…';
   try{
    const {error}=await db.rpc('teplo_dispatch_send_to_couriers',{p_order_id:o.id,p_slot_id:select.value});
    if(error)throw error;
    activeFilter='sent';
    msg.textContent='Передано курьерам. Обновляем статус…';
    await load(true);
    window.dispatchEvent(new Event('teplo:buyer-handoff'));
   }catch(e){msg.textContent='Ошибка: '+(e?.message||String(e));action.disabled=false}
  };
  c.append(picker.element,select,action,msg);
 }
 return c;
}
async function load(force=false){
 if(busy){if(force)reloadPending=true;return}
 const accessVersion=accessEpoch;busy=true;refresh.disabled=true;
 try{
  const {data:session,error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;if(!session?.session){root.replaceChildren();details.replaceChildren();ordersCache=[];return}
  const {data:auth,error:ae}=await db.auth.getUser();if(ae)throw ae;
  if(!auth?.user){root.replaceChildren();details.replaceChildren();ordersCache=[];return}
  const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',auth.user.id).single();
  if(pe)throw pe;
  if(!['admin','dispatcher'].includes(profile.role)||!auth.user.email_confirmed_at){root.replaceChildren();details.replaceChildren();ordersCache=[];return}
  section.hidden=Boolean(window.TEPLOWorkspace && window.TEPLOWorkspace.active!=='buyers');
  const [{data:orders,error:oe},{data:tasks,error:te},{data:slots,error:se},{data:links,error:le},{data:auto,error:autoError}]=await Promise.all([
   db.from('orders').select('id,customer_name,customer_phone,delivery_address,subtotal,delivery_fee,total,created_at,is_test,order_items(shop_id,product_name_snapshot,quantity,line_total)').eq('is_test',true).order('created_at',{ascending:false}).limit(70),
   db.from('teplo_order_venue_tasks').select('order_id,shop_id,shop_name_snapshot,shop_address_snapshot,state,operator_note,ready_at').limit(350),
   db.rpc('teplo_pilot_list_slots'),
   db.from('teplo_pilot_jobs').select('id,source_order_id,status').not('source_order_id','is',null).limit(100),
   db.from('teplo_auto_dispatch_state').select('order_id,state,reason,job_id').order('checked_at',{ascending:false}).limit(100)
  ]);
  if(oe)throw oe;if(te)throw te;if(se)throw se;if(le)throw le;if(autoError)throw autoError;
  if(accessVersion!==accessEpoch)return;
  ordersCache=orders||[];tasksCache=tasks||[];slotsCache=slots||[];linksCache=links||[];autoCache=auto||[];
  const nextIds=new Set(ordersCache.map(o=>o.id));
  if(seenBuyerIds!==null){
   for(const order of ordersCache.filter(o=>!seenBuyerIds.has(o.id)))window.TEPLODispatcherAlert?.buyer(order);
  }
  seenBuyerIds=nextIds;
  const signature=JSON.stringify({auto:autoCache,o:ordersCache.map(o=>[o.id,o.total]),t:tasksCache.map(t=>[t.order_id,t.shop_id,t.state,t.operator_note,t.ready_at]),j:linksCache.map(j=>[j.id,j.status]),s:slotsCache.map(x=>[x.id,x.booked,x.capacity,x.is_open])});
  const editing=details.contains(document.activeElement)&&['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);
  if((force||signature!==lastSignature)&&(!editing||force)){lastSignature=signature;renderQueue()}
 }catch(e){root.querySelector('.buyer-load-error')?.remove();const p=el('p','Не удалось загрузить заказы: '+(e?.message||String(e)),'warning buyer-load-error');root.prepend(p)}
 finally{
  busy=false;refresh.disabled=false;
  if(reloadPending){reloadPending=false;void load(true)}
 }
}
window.TEPLOBuyerOrders={open(id){
 selectedId=id;activeFilter='all';section.dataset.mobileView='detail';renderQueue();
 details.scrollIntoView({block:'start',behavior:'smooth'});
}};
refresh.onclick=()=>void load(true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
window.addEventListener('online',()=>void load());
window.addEventListener('teplo:buyer-handoff',()=>void load(true));
setInterval(()=>{if(!document.hidden&&navigator.onLine)void load()},8000);
window.addEventListener('teplo:dispatch-signed-out',()=>{accessEpoch++;root.replaceChildren();details.replaceChildren();ordersCache=[];tasksCache=[];linksCache=[];lastSignature=null;window.TEPLOWorkspace?.setCount('buyers',0)});
db.auth.onAuthStateChange(()=>setTimeout(()=>void load(),0));
void load();

}
