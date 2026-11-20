import {attentionReasons} from './dispatcher-attention.js?v=68';
export const ACTIVE_DELIVERIES=['new','assigned','accepted','picked_up'];
export const dispatchStatus={new:'Нужен курьер',assigned:'Ждём принятия',accepted:'Забор заказа',picked_up:'В пути',delivered:'Доставлен',cancelled:'Отменён'};
export function unresolvedDispatchIssues(notes=[]){const latest=new Map();for(const note of notes){if(!['issue','resolved'].includes(note.kind))continue;const previous=latest.get(note.job_id);const newer=!previous||Date.parse(note.created_at)>Date.parse(previous.created_at)||(note.created_at===previous.created_at&&BigInt(note.id||0)>BigInt(previous.id||0));if(newer)latest.set(note.job_id,note);}return new Map([...latest].filter(([,note])=>note.kind==='issue'));}
export function dispatchAttention(job,slots=[],couriers=[],issues=new Map(),now=Date.now()){const reasons=attentionReasons(job,slots,couriers,now);if(ACTIVE_DELIVERIES.includes(job.status)&&issues.has(job.id))reasons.unshift('Курьер / диспетчер: '+issues.get(job.id).note);return reasons;}
export function visibleDispatchJobs(jobs,{filter='active',search='',courierId=null,slots=[],couriers=[],issues=new Map(),now=Date.now()}={}){
 const query=String(search).trim().toLocaleLowerCase().replaceAll('ё','е');
 return jobs.filter(job=>{const active=ACTIVE_DELIVERIES.includes(job.status);if(filter==='active'&&!active)return false;if(filter==='new'&&job.status!=='new')return false;if(filter==='done'&&active)return false;if(filter==='attention'&&!dispatchAttention(job,slots,couriers,issues,now).length)return false;if(courierId&&job.courier_id!==courierId)return false;if(!query)return true;const rider=couriers.find(c=>c.id===job.courier_id);return [job.id,job.source_order_id,job.customer_name,job.customer_phone,job.delivery_address,job.shop_name_snapshot,job.order_summary,rider?.name].join(' ').toLocaleLowerCase().replaceAll('ё','е').includes(query);}).sort((a,b)=>{
  if(filter==='done')return Date.parse(b.delivered_at||b.created_at)-Date.parse(a.delivered_at||a.created_at)||a.id.localeCompare(b.id);
  const rank=job=>dispatchAttention(job,slots,couriers,issues,now).length?0:({new:1,assigned:2,accepted:3,picked_up:4}[job.status]??9);
  return rank(a)-rank(b)||(Date.parse(a.delivery_due_at)||Infinity)-(Date.parse(b.delivery_due_at)||Infinity)||Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id);
 });
}
export function dispatchCounts(jobs,couriers,slots,issues,now){return {active:jobs.filter(j=>ACTIVE_DELIVERIES.includes(j.status)).length,new:jobs.filter(j=>j.status==='new').length,attention:jobs.filter(j=>dispatchAttention(j,slots,couriers,issues,now).length).length,available:couriers.filter(c=>c.onShift&&c.activeJobs<2&&c.role!=='admin').length};}
export function dispatchActions(status){return {assign:status==='new',release:['assigned','accepted'].includes(status),move:status==='new',cancel:['new','assigned'].includes(status),manual:status==='picked_up'};}
