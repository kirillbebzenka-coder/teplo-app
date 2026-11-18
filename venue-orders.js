/* Venue-scoped RPCs, separate from direct courier calls. Existing TEPLO theme is inherited. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const el=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
const root=document.getElementById('venueOrders');
const heading=el('h2','Заказы покупателей'),hint=el('p','Подтверди свою часть заказа и время готовности. Сборную доставку передают курьеру после подтверждения всех заведений.','muted'),refresh=el('button','Обновить','secondary'),status=el('p','','muted'),list=el('div');
refresh.type='button';status.setAttribute('role','status');root.append(heading,hint,refresh,status,list);
let busy=false,saving=false,signature='',identity=null;
const labels={pending:'Новый заказ',ordered:'Ожидает подтверждения',confirmed:'Подтверждён',issue:'Проблема'};
const delivery={new:'Поиск курьера',assigned:'Курьер назначен',accepted:'Курьер принял',picked_up:'Заказ забран',delivered:'Доставлен',cancelled:'Доставка отменена'};
function render(rows){
 list.replaceChildren();
 if(!rows.length)list.append(el('p','Заказов пока нет. Для сотрудника администратор должен привязать заведение в панели команды.','muted'));
 for(const row of rows){
  const card=el('article'),title=el('h3',row.shop_name_snapshot+' · №'+row.order_id.slice(0,8).toUpperCase());
  card.append(title,el('p',row.delivery_status?(delivery[row.delivery_status]||row.delivery_status):(labels[row.state]||row.state)));
  for(const item of row.items||[])card.append(el('p',item.name+' × '+item.quantity+' · '+Number(item.total).toLocaleString('ru-RU')+' ₴'));
  if(row.ready_at)card.append(el('p','Готовность: '+new Date(row.ready_at).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv'}),'muted'));
  if(row.operator_note)card.append(el('p',row.operator_note,'muted'));
  if(!row.delivery_status){
   const select=document.createElement('select'),note=document.createElement('textarea'),msg=el('p','','muted'),confirm=el('button',row.state==='confirmed'?'Обновить готовность':'Принять заказ'),issue=el('button','Сообщить о проблеме','secondary');
   select.setAttribute('aria-label','Время готовности '+row.shop_name_snapshot);
   for(const mins of [0,10,15,20,30,45,60,90,120,180]){const o=el('option',mins===0?'Уже готово':'Через '+mins+' минут');o.value=String(mins);o.selected=mins===20;select.append(o)}
   note.maxLength=400;note.placeholder='Комментарий / причина проблемы';note.setAttribute('aria-label','Комментарий '+row.shop_name_snapshot);confirm.type='button';issue.type='button';
   async function respond(action){
    if(saving)return;
    const text=note.value.trim();if(action==='issue'&&text.length<5){msg.textContent='Опиши причину: минимум 5 символов.';return}
    saving=true;confirm.disabled=true;issue.disabled=true;msg.textContent='Сохраняем…';
    try{const {error}=await db.rpc('teplo_venue_respond',{p_order_id:row.order_id,p_shop_id:row.shop_id,p_action:action,p_ready_minutes:Number(select.value),p_note:text});if(error)throw error;
     msg.textContent='Сохранено.';signature='';
    }catch(e){msg.textContent='Не удалось сохранить: '+(e?.message||String(e))}
    finally{saving=false;confirm.disabled=false;issue.disabled=false;}
   }
   confirm.onclick=()=>void respond('confirmed');issue.onclick=()=>void respond('issue');card.append(select,note,confirm,issue,msg);
  }else card.append(el('p','Изменения после передачи курьеру — через диспетчера.','muted'));
  list.append(card);
 }
}
async function load(force=false){
 if(busy||saving)return;busy=true;refresh.disabled=true;
 try{
  const {data,error:authError}=await db.auth.getUser();if(authError)throw authError;
  if(identity!==data?.user?.id){identity=data?.user?.id;signature='';list.replaceChildren()}
  if(!identity){root.hidden=true;return}
  const {data:profile,error:roleError}=await db.from('profiles').select('role').eq('id',identity).single();if(roleError)throw roleError;
  if(!['venue','admin','dispatcher'].includes(profile?.role)){root.hidden=true;list.replaceChildren();return}
  root.hidden=false;
  const {data:rows,error}=await db.rpc('teplo_venue_order_board');if(error)throw error;
  const next=JSON.stringify(rows||[]),editing=list.contains(document.activeElement)&&['TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  if(next!==signature&&(!editing||force)){signature=next;render(rows||[])}
  status.textContent='Обновлено · '+new Date().toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'})+' · последние 100 частей заказов';
 }catch(e){status.textContent='Не удалось обновить: '+(e?.message||String(e))}
 finally{busy=false;refresh.disabled=false}
}
refresh.onclick=()=>void load(true);db.auth.onAuthStateChange(()=>setTimeout(()=>void load(),0));
setInterval(()=>{if(!document.hidden&&navigator.onLine)void load()},8000);
window.addEventListener('online',()=>void load());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});void load();
