import {appendCustomerComment} from './customer-comment.js?v=74';
import {deliveryTimer,deliveryClock} from './delivery-timer.js?v=75';
import {DELIVERY_ZONES} from './delivery-policy.js?v=75';
import {mapLink,phoneLink,clock,money,stamp} from './courier-model.js?v=68';
import {deliveryHistory} from './dispatcher-history.js?v=58';
import {deliveryNotes} from './dispatcher-notes.js?v=69';
import {dispatchActions,dispatchStatus,dispatchAttention} from './dispatcher-board-model.js?v=69';
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=String(text??'');if(cls)n.className=cls;return n};
function button(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
function disclosure(label,...nodes){const d=el('details','','dispatch-disclosure');d.append(el('summary',label),...nodes);return d;}
function link(label,url,icon){const a=el('a',label,'dispatch-link');a.href=url;if(url.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer';}if(icon){const i=el('span');i.dataset.teploIcon=icon;a.prepend(i);}return a;}
function field(label,key){const s=el('select');s.setAttribute('aria-label',label);s.dataset.draft=key;return s;}
function option(text,value){const o=el('option',text);o.value=value;return o;}
export function dispatchCard({job,couriers=[],stops=[],slots=[],issues=new Map(),db,callbacks}){
 const card=el('article','','job dispatch-card');card.dataset.jobId=job.id;
 const head=el('div','','dispatch-card-head');head.append(el('h2','№'+job.id.slice(0,8).toUpperCase()),el('span',dispatchStatus[job.status]||job.status,'pill'));card.append(head);
 const reasons=dispatchAttention(job,slots,couriers,issues,deliveryClock.now());
 if(reasons.length){const warning=el('div','','dispatch-problem');warning.append(el('strong','Требует внимания'),el('p',reasons.join(' · ')));card.append(warning);}
 card.append(deliveryTimer(job));
 const rider=couriers.find(c=>c.id===job.courier_id);
 const assigned=el('div','','assigned-rider');assigned.append(el('span','Курьер','muted'),el('strong',rider?.name||(job.courier_id?'Назначен':'Не назначен')));if(rider)assigned.append(el('span',rider.onShift?rider.activeJobs+'/2 в работе':'Не на смене','muted'));card.append(assigned);
 const route=el('section','','dispatch-route');
 const pickups=stops.length?stops:[{shop_name_snapshot:job.shop_name_snapshot,shop_address_snapshot:job.shop_address_snapshot,ready_at:job.ready_at}];
 for(const [index,stop] of pickups.entries()){const point=el('div','','dispatch-stop');point.append(el('span','ЗАБРАТЬ'+(pickups.length>1?' · '+(index+1):''),'eyebrow'),el('h3',stop.shop_name_snapshot||'Заведение'),el('p',stop.shop_address_snapshot||'Адрес не указан','dispatch-address'),el('p','Готовность к '+clock(stop.ready_at),'muted'));if(stop.shop_address_snapshot)point.append(link('Карта',mapLink(stop.shop_address_snapshot),'pin'));route.append(point);}
 const drop=el('div','','dispatch-stop destination');drop.append(el('span','ПОЛУЧАТЕЛЬ','eyebrow'),el('h3',job.delivery_address||'Адрес не указан','dispatch-address'),el('p',job.customer_name||'Имя не указано','recipient-name'));const contacts=el('div','','dispatch-contacts');if(job.delivery_address)contacts.append(link('Карта',mapLink(job.delivery_address),'pin'));const phone=phoneLink(job.customer_phone);if(phone)contacts.append(link('Позвонить',phone,'phone'));drop.append(contacts);if(job.customer_phone)drop.append(el('p',job.customer_phone,'muted'));route.append(drop);card.append(route);appendCustomerComment(card,job.customer_comment);
 const feedback=el('p','','dispatch-feedback');feedback.setAttribute('role','status');
 const allowed=dispatchActions(job.status),available=couriers.filter(c=>c.onShift&&c.activeJobs<2);
 if(allowed.assign){const controls=el('section','','assign-section'),select=field('Курьер для заказа '+job.id.slice(0,8),'assign');select.append(option('Выбери курьера',''));for(const courier of available)select.append(option(courier.name+' · '+(courier.activeJobs?'ещё 1 заказ':'свободен'),courier.id));const assign=button('Назначить курьера',()=>callbacks.assign(job,select.value,assign,feedback),'dispatch-primary');assign.disabled=!available.length;controls.append(el('h3','Назначить доставку'),select,assign);if(!available.length)controls.append(el('p','Нет доступных курьеров на смене. Проверь раздел «Курьеры».','muted'));card.append(controls);}
 card.append(feedback);
 const content=disclosure('Состав и суммы',el('p',job.order_summary||'Состав не указан'),el('p','Доставка: '+money(job.delivery_fee_uah)+' · Курьеру: '+money(job.courier_reward_uah),'muted'),el('p','Создан: '+stamp(job.created_at),'muted'));
 if(job.source_order_id)content.append(button('Заведения и заказ покупателя',()=>callbacks.openSource(job.source_order_id),'secondary full'));
 card.append(content);
 const admin=disclosure('Управление заказом');
 if(allowed.release)admin.append(button('Вернуть в очередь',event=>callbacks.release(job,event.currentTarget,feedback),'secondary full'));
 if(allowed.move){const select=field('Новый слот для заказа '+job.id.slice(0,8),'slot');select.append(option('Выбери другое окно забора',''));for(const slot of slots.filter(s=>s.is_open&&s.booked<s.capacity&&s.id!==job.slot_id))select.append(option(stamp(slot.slot_start)+' · '+slot.booked+'/'+slot.capacity,slot.id));const move=button('Перенести в слот',()=>callbacks.move(job,select.value,move,feedback),'secondary full');admin.append(select,move);}
 if(['new','assigned','accepted'].includes(job.status)||(job.status==='picked_up'&&!job.delivery_due_at)){
  const select=field('Зона доставки','zone');select.append(option('Уточни зону',''));for(const [code,policy] of Object.entries(DELIVERY_ZONES))select.append(option(policy.label+' · '+policy.minutes+' мин',code));select.value=job.delivery_zone||'';const apply=button('Уточнить зону',()=>callbacks.zone(job,select.value,apply,feedback),'secondary full');admin.append(select,apply);
 }
 if(allowed.manual){const note=el('textarea');note.rows=3;note.maxLength=400;note.minLength=12;note.dataset.draft='manual';note.setAttribute('aria-label','Причина ручного подтверждения вручения');note.placeholder='Почему курьер не может завершить заказ и кто подтвердил вручение';const finish=button('Подтвердить вручение вручную',()=>callbacks.manual(job,note.value.trim(),finish,feedback),'secondary full');admin.append(el('p','Только после подтверждённого вручения получателю.','muted'),note,finish);}
 if(allowed.cancel)admin.append(button('Отменить заказ',event=>callbacks.cancel(job,event.currentTarget,feedback),'secondary full danger-action'));
 if(admin.childElementCount>1)card.append(admin);
 const notes=deliveryNotes(db,job.id);notes.classList.add('dispatch-disclosure');const history=deliveryHistory(db,job.id);history.classList.add('dispatch-disclosure');card.append(notes,history);
 window.TEPLOIcons?.mount(card);return card;
}
export function readCardDraft(root){const card=root.querySelector('[data-job-id]');if(!card)return null;return {id:card.dataset.jobId,fields:[...root.querySelectorAll('input,select,textarea')].map(input=>({key:input.dataset.draft||input.getAttribute('aria-label'),value:input.value})).filter(x=>x.key),open:[...root.querySelectorAll('details[open]')].map(node=>node.querySelector('summary')?.textContent)};}
export function restoreCardDraft(root,draft){if(!draft||root.querySelector('[data-job-id]')?.dataset.jobId!==draft.id)return;for(const input of root.querySelectorAll('input,select,textarea')){const value=draft.fields.find(x=>x.key===(input.dataset.draft||input.getAttribute('aria-label')));if(value&&(input.tagName!=='SELECT'||[...input.options].some(o=>o.value===value.value)))input.value=value.value;}for(const node of root.querySelectorAll('details'))if(draft.open.includes(node.querySelector('summary')?.textContent))node.open=true;}
