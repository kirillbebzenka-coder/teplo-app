/* Read-only delivery audit trail. Access remains governed by existing Supabase RLS. */
const labels={created:'Заявка создана',assigned:'Курьер назначен',accepted:'Курьер принял заказ',picked_up:'Курьер забрал заказ',delivered:'Доставка завершена',cancelled:'Заявка отменена',released:'Возвращена в очередь',rejected:'Курьер отказался',declined:'Курьер отказался',slot_changed:'Изменён временной слот'};
const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
export function deliveryHistory(db,jobId){
 const box=node('details'),title=node('summary','История действий'),list=node('div'),more=node('button','Загрузить ещё','secondary'),message=node('p','','muted');
 more.type='button';more.hidden=true;box.append(title,list,message,more);
 let offset=0,busy=false,loaded=false;
 async function load(){
  if(busy)return;busy=true;more.disabled=true;message.textContent='Загружаем историю…';
  try{
   const {data,error}=await db.from('teplo_pilot_job_events').select('id,event,actor_id,created_at').eq('job_id',jobId).order('created_at').order('id').range(offset,offset+49);
   if(error)throw error;
   const rows=data||[],ids=[...new Set(rows.map(x=>x.actor_id).filter(Boolean))];
   let people=[];
   if(ids.length){const result=await db.from('profiles').select('id,full_name,role').in('id',ids);if(!result.error)people=result.data||[];}
   for(const event of rows){
    const person=people.find(p=>p.id===event.actor_id),row=node('p');
    const actor=person?.full_name?.trim()||({admin:'Администратор',dispatcher:'Диспетчер',courier:'Курьер',venue:'Заведение',customer:'Покупатель'}[person?.role])||(event.actor_id?'Участник '+event.actor_id.slice(0,8):'Система');
    row.append(node('strong',labels[event.event]||event.event),node('br'),node('span',new Date(event.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv'})+' · '+actor,'muted'));list.append(row);
   }
   offset+=rows.length;loaded=true;more.hidden=rows.length<50;
   message.textContent=offset?'Время по Киеву. Журнал показывает сохранённые события; причины и прошлый назначенный курьер в старых записях могут отсутствовать.':'Событий пока нет.';
  }catch(e){message.textContent='Не удалось загрузить историю: '+(e?.message||String(e));more.textContent='Повторить';more.hidden=false;}
  finally{busy=false;more.disabled=false;}
 }
 box.addEventListener('toggle',()=>{if(box.open&&!loaded)void load()});more.onclick=()=>void load();return box;
}
