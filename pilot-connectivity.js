/* TEPLO: Network state shown separately from empty or missing job data.
   No personal data is cached. Real DB success, not navigator.onLine, confirms sync. */
(()=>{
  let lastSync=null;
  function status(){
    let el=document.getElementById('teplo-net-state');
    if(el)return el;
    const main=document.querySelector('main');
    if(!main)return null;
    el=document.createElement('div');
    el.id='teplo-net-state';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.style.cssText='margin:12px 0;padding:10px 13px;border:1px solid #503b67;border-radius:12px;background:#17121e;color:#d6c2e8;font-size:13px;line-height:1.45';
    const header=main.querySelector('header');
    if(header)header.insertAdjacentElement('afterend',el);
    else main.prepend(el);
    return el;
  }
  function show(message,kind){
    const el=status();if(!el)return;
    el.textContent=message;
    el.dataset.kind=kind;
    el.style.borderColor=kind==='error'?'#ab566b':kind==='ok'?'#346a6b':'#654b86';
    el.style.color=kind==='error'?'#ffd3db':kind==='ok'?'#b9f5e6':'#dfc9f8';
  }
  function offline(){
    const stamp=lastSync?' Последняя проверка: '+new Date(lastSync).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'.':'';
    show('⚠️ Нет интернета — заявки сейчас не обновляются.'+stamp+' После восстановления сети обновим список автоматически.','error');
  }
  window.addEventListener('teplo:auth-required',()=>{show('Вход ещё не выполнен. Подтверди электронную почту, затем войди. Заказы не удалены.','checking')});
  window.addEventListener('teplo:sync-ok',()=>{
    lastSync=Date.now();
    show('● Данные получены с сервера · '+new Date(lastSync).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),'ok');
  });
  window.addEventListener('teplo:sync-error',()=>{
    if(!navigator.onLine){offline();return}
    const stamp=lastSync?' Последняя успешная загрузка: '+new Date(lastSync).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'.':'';
    show('⚠️ Не удалось получить данные с сервера. Это не означает, что заявки удалены.'+stamp+' Нажми «Обновить», когда соединение восстановится.','error');
  });
  window.addEventListener('offline',offline);
  window.addEventListener('online',()=>{
    show('↻ Интернет появился. Проверяем соединение с базой…','checking');
    const b=document.getElementById('refresh');
    if(b)b.click();
  });
  document.addEventListener('DOMContentLoaded',()=>{
    if(!navigator.onLine)offline();
    else if(!lastSync)show('↻ Проверяем соединение с базой…','checking');
  },{once:true});
})();