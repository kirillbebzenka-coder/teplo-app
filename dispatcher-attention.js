/* Advisory demo thresholds; no automatic cancellation, assignment or money movement. */
const minute=60000;
const time=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:null};
export function attentionReasons(job,slots=[],couriers=[],now=Date.now()){
 if(!['new','assigned','accepted','picked_up'].includes(job.status))return [];
 const reasons=[],slot=slots.find(s=>s.id===job.slot_id);
 const started=time(slot?.slot_start),ended=time(slot?.slot_end);
 const updated=time(job.updated_at)??time(job.created_at)??now;
 if(!job.slot_id)reasons.push('Не выбран временной слот');
 if(job.status!=='picked_up'&&ended!==null&&ended<now)reasons.push('Временной слот закончился');
 if(job.status==='new'){
  if(slot&&slot.is_open===false)reasons.push('Слот закрыт: курьер не сможет принять заказ');
  const offerFrom=Math.max(updated,started===null?updated:started-15*minute);
  if(now>=offerFrom){
   if(!couriers.some(c=>c.onShift&&c.activeJobs<2&&c.role!=='admin'))reasons.push('Нет свободных курьеров на смене');
   if(now-offerFrom>=5*minute)reasons.push('Заказ не принимают более 5 минут');
  }
 }
 if(job.status==='assigned'&&now-(time(job.assigned_at)??updated)>=3*minute)reasons.push('Назначение не подтверждено более 3 минут');
 if(job.status==='accepted'){
  const ready=time(job.ready_at);
  if(ready!==null&&now-ready>=15*minute)reasons.push('Прошло 15 минут после готовности: проверь забор');
 }
 if(job.status==='picked_up'){const due=time(job.delivery_due_at);if(due!==null&&now>due)reasons.push('Срок доставки истёк: проверь вручение');else if(due===null&&now-(time(job.picked_up_at)??updated)>=60*minute)reasons.push('Более часа после забора: проверь доставку');}
 return reasons;
}
