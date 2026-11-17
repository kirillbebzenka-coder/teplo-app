/* Shared accessible slot picker: Kyiv dates, large times and availability.
   Preserves TEPLO palette, does not touch backend booking rules. */
(() => {
 const dateKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
 const dateLabel=t=>new Date(t).toLocaleDateString('ru-RU',{timeZone:'Europe/Kyiv',weekday:'short',day:'2-digit',month:'short'});
 const timeLabel=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
 function create(slots,options={}){
  const items=(slots||[]).filter(s=>s.is_open&&Number(s.booked)<Number(s.capacity));
  const wrap=document.createElement('div');wrap.className='teplo-slot-picker';
  let value=options.value||'',day=items.find(s=>s.id===value)?dateKey(items.find(s=>s.id===value).slot_start):items.length?dateKey(items[0].slot_start):'';
  const dates=document.createElement('div'),grid=document.createElement('div'),summary=document.createElement('div');
  dates.className='teplo-slot-days';dates.setAttribute('aria-label','Выбрать дату');
  grid.className='teplo-slot-times';grid.setAttribute('role','group');grid.setAttribute('aria-label','Доступные интервалы');
  summary.className='teplo-slot-summary';summary.setAttribute('aria-live','polite');
  wrap.append(dates,grid,summary);
  function render(){
   dates.replaceChildren();grid.replaceChildren();
   const allDays=[...new Map(items.map(s=>[dateKey(s.slot_start),s.slot_start])).entries()];
   for(const [key,start]of allDays){
    const btn=document.createElement('button');btn.type='button';btn.className='teplo-slot-day';
    btn.textContent=dateLabel(start);btn.setAttribute('aria-pressed',String(key===day));
    btn.onclick=()=>{day=key;render()};dates.append(btn);
   }
   for(const s of items.filter(s=>dateKey(s.slot_start)===day)){
    const btn=document.createElement('button');btn.type='button';btn.className='teplo-slot-time';
    btn.setAttribute('aria-pressed',String(s.id===value));
    const time=document.createElement('strong');time.className='teplo-slot-hours';time.textContent=timeLabel(s.slot_start)+' – '+timeLabel(s.slot_end);
    const free=document.createElement('span');free.className='teplo-slot-free';free.textContent='Свободно '+(Number(s.capacity)-Number(s.booked))+' из '+s.capacity;
    const bar=document.createElement('span');bar.className='teplo-slot-bar';
    const fill=document.createElement('span');fill.style.width=(100*Number(s.booked)/Math.max(1,Number(s.capacity)))+'%';
    bar.append(fill);btn.append(time,free,bar);
    btn.onclick=()=>{value=s.id;options.onChange?.(s.id,s);render()};grid.append(btn);
   }
   const selected=items.find(s=>s.id===value);
   summary.textContent=selected?'Выбрано: '+dateLabel(selected.slot_start)+', '+timeLabel(selected.slot_start)+' – '+timeLabel(selected.slot_end):'Выбери дату и удобный интервал';
   if(!items.length)summary.textContent='Сейчас нет свободных слотов';
  }
  render();
  return {element:wrap,get value(){return value},update(newSlots){/* Rebuild from caller to update availability */}};
 }
 window.TEPLOSlotPicker={create,dateKey,dateLabel,timeLabel};
})();