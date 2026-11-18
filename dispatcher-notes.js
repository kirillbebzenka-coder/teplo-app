/* Existing role-checked demo RPC; no direct writes to tables. */
const el=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
const kinds={note:'Комментарий',issue:'Проблема',resolved:'Проблема решена',manual_delivery:'Ручное подтверждение доставки'};
export function deliveryNotes(db,jobId){
 const box=el('details'),summary=el('summary','Проблемы и комментарии'),list=el('div'),select=document.createElement('select'),input=document.createElement('textarea'),save=el('button','Сохранить запись','secondary'),message=el('p','','muted'),more=el('button','Ещё записи','secondary');
 select.setAttribute('aria-label','Тип записи');input.setAttribute('aria-label','Описание проблемы или комментарий');input.placeholder='Что произошло и что нужно сделать';input.minLength=5;input.maxLength=400;input.rows=3;
 for(const kind of ['note','issue','resolved']){const option=el('option',kinds[kind]);option.value=kind;select.append(option)}
 save.type='button';more.type='button';more.hidden=true;message.setAttribute('role','status');box.append(summary,list,more,select,input,save,message);
 let busy=false,offset=0,loaded=false;
 async function load(reset=false){
  if(reset){offset=0;list.replaceChildren()}
  const {data,error}=await db.from('teplo_dispatch_notes').select('id,kind,note,created_at').eq('job_id',jobId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+29);
  if(error)throw error;
  for(const row of data||[]){const p=el('p');p.append(el('strong',kinds[row.kind]||row.kind),el('br'),el('span',row.note),el('br'),el('small',new Date(row.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv'}),'muted'));list.append(p)}
  offset+=(data||[]).length;more.hidden=(data||[]).length<30;loaded=true;
 }
 async function read(reset=false){if(busy)return;busy=true;more.disabled=true;try{await load(reset)}catch(e){message.textContent='Не удалось прочитать записи: '+(e?.message||String(e))}finally{busy=false;more.disabled=false}}
 box.addEventListener('toggle',()=>{if(box.open&&!loaded)void read()});more.onclick=()=>void read();
 save.onclick=async()=>{
  const note=input.value.trim();if(note.length<5){message.textContent='Напиши от 5 до 400 символов.';return}
  if(busy)return;busy=true;save.disabled=true;
  try{
   const {error}=await db.rpc('teplo_dispatch_record_note',{p_job_id:jobId,p_kind:select.value,p_note:note});if(error)throw error;
   input.value='';message.textContent='Запись сохранена.';await load(true);
  }catch(e){message.textContent='Ошибка: '+(e?.message||String(e))}finally{busy=false;save.disabled=false}
 };return box;
}
