/* TEPLO demo buyer orders. This module only adds a dispatcher workspace; the legacy pilot courier flow stays unchanged. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=String(text??'');if(cls)node.className=cls;return node};
const money=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
const day=t=>new Date(t).toLocaleDateString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit'});
const clock=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
const states={pending:'Не размещён',ordered:'Заказ размещён',confirmed:'Подтверждено',issue:'Проблема'};
const section=document.getElementById('buyerOrderArea');
const header=el('div','','row'),h2=el('h2','Заказы покупателей'),refresh=el('button','Обновить','secondary');
refresh.type='button';header.append(h2,refresh);
section.append(header,el('p','Один заказ — одна карточка. Подтверждения заведений внутри.','muted'));
const filters=el('div','','buyer-filters'),shell=el('div','','queue-shell');
const root=el('div','','queue-list');root.id='buyerOrders';
const details=el('div','','queue-detail');details.id='buyerDetails';
shell.append(root,details);section.append(filters,shell);
let busy=false,selectedId=new URLSearchParams(location.search).get('order')||null,activeFilter=new URLSearchParams(location.search).get('order')?'all':'work',lastSignature=null,seenBuyerIds=null,ordersCache=[],tasksCache=[],slotsCache=[],linksCache=[];
const filterList=[['work','В обработке'],['issue','Проблемы'],['ready','К передаче'],['sent','У курьеров'],['all','Все']];
function orderState(order){
 const pieces=tasksCache.filter(t=>t.order_id===order.id);
 const link=linksCache.find(x=>x.source_order_id===order.id);
 if(link)return ['sent',link.status==='delivered'?'Доставлен':'У курьеров'];
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
 filters.replaceChildren();
 for(const [key,label] of filterList){
  const count=ordersCache.filter(o=>key==='all'||(key==='work'?['work','ready','issue'].includes(orderState(o)[0]):orderState(o)[0]===key)).length;
  const b=el('button',label+' · '+count);b.type='button';b.setAttribute('aria-pressed',String(activeFilter===key));
  b.onclick=()=>{activeFilter=key;selectedId=null;section.dataset.mobileView='list';renderQueue()};filters.append(b);
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
 top.append(el('strong','Заказ №'+o.id.slice(0,8).toUpperCase()),el('span',linked?'Передан курьерам':confirmed?'Подтверждён':'Ожидает обработки','pill'));
 c.append(top,el('p','Покупатель · '+new Date(o.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),'muted'));
 c.append(el('p','Получатель: '+o.customer_name+' · '+o.customer_phone));
 c.append(el('p','Адрес доставки: '+o.delivery_address));
 c.append(el('p','Стоимость товаров: '+money(o.subtotal)+' · Доставка: '+money(o.delivery_fee)+' · Итого: '+money(o.total)));
 if(linked)c.append(el('p','Общая курьерская доставка №'+linked.id.slice(0,8).toUpperCase()+' · '+linked.status,'muted'));
 if(!pieces.length)c.append(el('p','Не указаны заведения. Нельзя передать курьеру.','warning'));
 for(const task of pieces){
  const part=el('div','','route');part.append(el('strong',task.shop_name_snapshot+' · '+states[task.state]));
  part.append(el('p','Точка забора: '+(task.shop_address_snapshot||'Не указана'),'muted'));
  for(const item of o.order_items.filter(i=>i.shop_id===task.shop_id))
   part.append(el('p',item.product_name_snapshot+' ×'+item.quantity+' · '+money(item.line_total)));
  if(task.operator_note)part.append(el('p','Примечание: '+task.operator_note,'muted'));
  if(!linked){
   const controls=el('div','','actions'),note=document.createElement('input'),msg=el('p','','muted');
   note.placeholder='Комментарий / причина проблемы';note.maxLength=400;
   const choices=task.state==='pending'?[['ordered','Заказ размещён'],['issue','Проблема']]
    :task.state==='ordered'?[['confirmed','Подтверждено'],['issue','Проблема']]
    :task.state==='issue'?[['ordered','Разместить повторно']]:[['issue','Проблема']];
   for(const [next,label] of choices){
    const b=el('button',label,'secondary');b.type='button';
    b.onclick=async()=>{
     b.disabled=true;msg.textContent='Сохраняем…';
     try{
      const {error}=await db.rpc('teplo_dispatch_update_venue',{
       p_order_id:o.id,p_shop_id:task.shop_id,p_action:next,p_note:note.value.trim()
      });
      if(error)throw error;await load();
     }catch(e){msg.textContent='Ошибка: '+(e?.message||String(e));b.disabled=false}
    };controls.append(b)
   }
   part.append(note,controls,msg);
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
  const action=el('button','Передать курьерам');action.type='button';action.disabled=!confirmed||select.options.length===1;
  const msg=el('p',confirmed?'Все части подтверждены, выбери слот.':'Сначала подтверди каждое заведение.','muted');
  action.onclick=async()=>{
   if(!select.value){msg.textContent='Выбери слот';return}
   action.disabled=true;msg.textContent='Формируем доставку…';
   try{
    const {error}=await db.rpc('teplo_dispatch_send_to_couriers',{p_order_id:o.id,p_slot_id:select.value});
    if(error)throw error;await load();
    window.dispatchEvent(new Event('teplo:buyer-handoff'));
   }catch(e){msg.textContent='Ошибка: '+(e?.message||String(e));action.disabled=false}
  };
  c.append(picker.element,select,action,msg);
 }
 return c;
}
async function load(){
 if(busy)return;busy=true;refresh.disabled=true;
 try{
  const {data:auth,error:ae}=await db.auth.getUser();if(ae)throw ae;
  if(!auth?.user){section.hidden=true;return}
  const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',auth.user.id).single();
  if(pe)throw pe;
  if(!['admin','dispatcher'].includes(profile.role)){section.hidden=true;return}
  section.hidden=Boolean(window.TEPLOWorkspace && window.TEPLOWorkspace.active!=='buyers');
  const [{data:orders,error:oe},{data:tasks,error:te},{data:slots,error:se},{data:links,error:le}]=await Promise.all([
   db.from('orders').select('id,customer_name,customer_phone,delivery_address,subtotal,delivery_fee,total,created_at,is_test,order_items(shop_id,product_name_snapshot,quantity,line_total)').eq('is_test',true).order('created_at',{ascending:false}).limit(70),
   db.from('teplo_order_venue_tasks').select('order_id,shop_id,shop_name_snapshot,shop_address_snapshot,state,operator_note').limit(350),
   db.rpc('teplo_pilot_list_slots'),
   db.from('teplo_pilot_jobs').select('id,source_order_id,status').not('source_order_id','is',null).limit(100)
  ]);
  if(oe)throw oe;if(te)throw te;if(se)throw se;if(le)throw le;
  ordersCache=orders||[];tasksCache=tasks||[];slotsCache=slots||[];linksCache=links||[];
  const nextIds=new Set(ordersCache.map(o=>o.id));
  if(seenBuyerIds!==null){
   for(const order of ordersCache.filter(o=>!seenBuyerIds.has(o.id)))window.TEPLODispatcherAlert?.buyer(order);
  }
  seenBuyerIds=nextIds;
  const signature=JSON.stringify({o:ordersCache.map(o=>[o.id,o.total]),t:tasksCache.map(t=>[t.order_id,t.shop_id,t.state,t.operator_note]),j:linksCache.map(j=>[j.id,j.status]),s:slotsCache.map(x=>[x.id,x.booked,x.capacity,x.is_open])});
  const editing=details.contains(document.activeElement)&&['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);
  if(signature!==lastSignature&&!editing){lastSignature=signature;renderQueue()}
 }catch(e){const p=el('p','Не удалось загрузить заказы: '+(e?.message||String(e)),'warning');root.prepend(p)}
 finally{busy=false;refresh.disabled=false}
}
window.TEPLOBuyerOrders={open(id){
 selectedId=id;activeFilter='all';section.dataset.mobileView='detail';renderQueue();
 details.scrollIntoView({block:'start',behavior:'smooth'});
}};
refresh.onclick=()=>{lastSignature=null;void load()};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
window.addEventListener('online',()=>void load());
window.addEventListener('teplo:buyer-handoff',()=>{lastSignature=null;void load()});
setInterval(()=>{if(!document.hidden&&navigator.onLine)void load()},8000);
db.auth.onAuthStateChange(()=>setTimeout(()=>void load(),0));
void load();
