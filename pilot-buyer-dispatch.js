/* TEPLO demo buyer orders. This module only adds a dispatcher workspace; the legacy pilot courier flow stays unchanged. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=String(text??'');if(cls)node.className=cls;return node};
const money=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
const day=t=>new Date(t).toLocaleDateString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit'});
const clock=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
const states={pending:'Не размещён',ordered:'Заказ размещён',confirmed:'Подтверждено',issue:'Проблема'};
const section=el('section');section.id='buyerOrderArea';section.hidden=true;
const header=el('div','','row'),h2=el('h2','Заказы покупателей'),refresh=el('button','Обновить','secondary');
refresh.type='button';header.append(h2,refresh);
section.append(header,el('p','Оператор размещает заказ в каждом заведении, подтверждает все части и передаёт одну доставку курьерам. Только демо.','muted'));
const root=el('div');root.id='buyerOrders';section.append(root);
document.querySelector('#stats')?.after(section);
let busy=false;
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
  const select=document.createElement('select');select.setAttribute('aria-label','Слот заказа');
  const initial=el('option','Выбери временной слот');initial.value='';select.append(initial);
  for(const slot of slots.filter(s=>s.is_open&&s.booked<s.capacity)){
   const option=el('option',day(slot.slot_start)+' · '+clock(slot.slot_start)+'–'+clock(slot.slot_end)+' · '+slot.booked+'/'+slot.capacity);
   option.value=slot.id;select.append(option);
  }
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
  c.append(select,action,msg);
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
  section.hidden=false;
  const [{data:orders,error:oe},{data:tasks,error:te},{data:slots,error:se},{data:links,error:le}]=await Promise.all([
   db.from('orders').select('id,customer_name,customer_phone,delivery_address,subtotal,delivery_fee,total,created_at,is_test,order_items(shop_id,product_name_snapshot,quantity,line_total)').eq('is_test',true).order('created_at',{ascending:false}).limit(70),
   db.from('teplo_order_venue_tasks').select('order_id,shop_id,shop_name_snapshot,shop_address_snapshot,state,operator_note').limit(350),
   db.rpc('teplo_pilot_list_slots'),
   db.from('teplo_pilot_jobs').select('id,source_order_id,status').not('source_order_id','is',null).limit(100)
  ]);
  if(oe)throw oe;if(te)throw te;if(se)throw se;if(le)throw le;
  root.replaceChildren();
  if(!orders?.length)root.append(el('p','Пока заказов покупателей нет.','muted'));
  else for(const o of orders)root.append(card(o,tasks||[],slots||[],links||[]));
 }catch(e){const p=el('p','Не удалось загрузить заказы: '+(e?.message||String(e)),'warning');root.prepend(p)}
 finally{busy=false;refresh.disabled=false}
}
refresh.onclick=()=>void load();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
window.addEventListener('online',()=>void load());
window.addEventListener('teplo:buyer-handoff',()=>void load());
setInterval(()=>{if(!document.hidden&&navigator.onLine)void load()},8000);
db.auth.onAuthStateChange(()=>setTimeout(()=>void load(),0));
void load();
