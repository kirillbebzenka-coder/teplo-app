export const ACTIVE=['assigned','accepted','picked_up'];
export const statusText={assigned:'Назначен',accepted:'Забрать заказ',picked_up:'В пути',delivered:'Доставлен',cancelled:'Отменён'};
export const money=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
export const clock=t=>t?new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'}):'Уточняется';
export const day=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:'Europe/Kyiv'});
export const stamp=t=>new Date(t).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function pickups(job,stops=[]){return stops.length?stops.map(s=>({name:s.shop_name_snapshot,address:s.shop_address_snapshot,readyAt:s.ready_at})): [{name:job.shop_name_snapshot,address:job.shop_address_snapshot,readyAt:job.ready_at}];}
export function nextAction(job,stopCount=1){return {assigned:{action:'accepted',label:'Принять заказ'},accepted:{action:'picked_up',label:stopCount>1?'Все точки забраны':'Подтвердить забор'},picked_up:{action:'delivered',label:'Подтвердить вручение'}}[job.status]||null;}
export function mapLink(address){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address||'');}
export function phoneLink(phone){const cleaned=String(phone||'').replace(/[^+\d]/g,'');return /^\+?\d{7,15}$/.test(cleaned)?'tel:'+cleaned:null;}
export function earningsForPeriod(rows,period='today',now=Date.now()){
 const key=day(now),cutoff=new Date(now);cutoff.setUTCDate(cutoff.getUTCDate()-6);
 return rows.filter(e=>period==='all'||(period==='today'?day(e.recorded_at)===key:day(e.recorded_at)>=day(cutoff)&&day(e.recorded_at)<=key));
}
export function earningsSummary(rows){const total=rows.reduce((s,e)=>s+Number(e.amount_uah||0),0);return {total,count:rows.length,average:rows.length?total/rows.length:0};}
export function canClaim({activeCount,shift,role,busy=false,online=true}){return online&&!busy&&activeCount<2&&(shift||role==='admin');}
