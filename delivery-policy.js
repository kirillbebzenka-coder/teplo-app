/* Display values mirror server defaults; the database stamps the authoritative deadline. */
export const DELIVERY_ZONES={local:{label:'Теплодар',minutes:20},dachi:{label:'Дачи',minutes:30},nearby:{label:'Ближайшие населённые пункты',minutes:40}};
export const DELIVERY_AREAS={teplodar:{label:'Теплодар',zone:'local'},dachi:{label:'Дачи',zone:'dachi'},shyroka_balka:{label:'Широкая Балка',zone:'nearby'},myrne:{label:'Мирное',zone:'nearby'},prom:{label:'Пром',zone:'nearby'}};
export function detectedZone(address){const text=String(address||'').toLocaleLowerCase();if(/широк(?:ая|а)\s+балка|(?:^|[\s,.])(?:мирне|мирное|мірне|пром|промзона)(?:[\s,.]|$)/u.test(text))return 'nearby';if(/(?:^|[\s,.])дач[иі](?:[\s,.]|$)/u.test(text))return 'dachi';if(text.includes('теплодар'))return 'local';return null;}
export function formatRemaining(milliseconds){const seconds=Math.ceil(Math.abs(milliseconds)/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
export function timerState(job,now){
 const zone=DELIVERY_ZONES[job.delivery_zone],minutes=Number(job.delivery_minutes||zone?.minutes||0);
 const suffix=zone?' · '+zone.label:'';
 if(job.status==='delivered'||job.status==='cancelled'){
  if(job.status==='cancelled')return {kind:'neutral',title:'Заказ отменён',value:''};
  const late=Date.parse(job.delivered_at)-Date.parse(job.delivery_due_at);
  return Number.isFinite(late)?{kind:late>0?'late':'done',title:late>0?'Вручён с задержкой':'Вручён вовремя',value:late>0?formatRemaining(late):''}:{kind:'done',title:'Доставлен',value:''};
 }
 if(job.status==='picked_up'){
  const due=Date.parse(job.delivery_due_at);if(!Number.isFinite(due))return {kind:'unknown',title:'Срок не установлен. Уточни зону у диспетчера',value:''};
  if(!Number.isFinite(now))return {kind:'neutral',title:'Сверяем время с сервером…',value:''};
  const left=due-now;return {kind:left<0?'late':left<=300000?'warning':'running',title:(left<0?'Просрочка':'До вручения')+suffix,value:formatRemaining(left),due};
 }
 if(!zone)return {kind:'unknown',title:'Уточни зону доставки до забора',value:''};
 const ready=Date.parse(job.ready_at);
 if(job.status==='accepted'&&Number.isFinite(ready)&&Number.isFinite(now))return {kind:now>ready+900000?'warning':'neutral',title:now<ready?'До готовности по плану':'После плановой готовности',value:formatRemaining(ready-now),caption:minutes+' мин на доставку после забора'+suffix};
 return {kind:'neutral',title:'Доставка после забора'+suffix,value:minutes+' мин'};
}
export class ServerClock{
 constructor(monotonic=()=>performance.now()){this.monotonic=monotonic;this.anchor=null;}
 set(stamp,started=this.monotonic(),finished=this.monotonic()){const server=Date.parse(stamp);if(!Number.isFinite(server))throw new Error('Сервер не подтвердил время');this.anchor={server:server+Math.max(0,finished-started)/2,mono:finished};}
 now(){return this.anchor?this.anchor.server+this.monotonic()-this.anchor.mono:NaN;}
}
