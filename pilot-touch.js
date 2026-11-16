/* TEPLO pilot tactile layer — browser-native, no external libraries */
(()=>{
  let toastTimer=null,pressedTimer=null;
  const tactileAllowed=()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toast=document.createElement('div');
  toast.id='teplo-action-toast';
  toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');
  document.addEventListener('DOMContentLoaded',()=>document.body.append(toast),{once:true});
  function vibrate(ms){try{if(tactileAllowed()&&navigator.vibrate)navigator.vibrate(ms)}catch{}}
  function notify(message,kind='info'){
    if(!toast.isConnected)document.body.append(toast);
    if(toastTimer)clearTimeout(toastTimer);
    toast.textContent=message;toast.dataset.kind=kind;
    toast.classList.add('visible');
    if(kind==='success')vibrate(17);
    else if(kind==='error')vibrate([20,45,20]);
    toastTimer=setTimeout(()=>{toast.classList.remove('visible')},kind==='error'?6000:kind==='progress'?2500:3800);
  }
  function busy(button,state,label){
    if(!button)return;
    if(state){
      if(!button.dataset.tapLabel)button.dataset.tapLabel=button.textContent;
      button.classList.remove('is-done');button.classList.add('is-busy');
      button.textContent=label||'Обрабатываем…';button.disabled=true;
      button.setAttribute('aria-busy','true');
    }else{
      button.classList.remove('is-busy');
      if(button.dataset.tapLabel){button.textContent=button.dataset.tapLabel;delete button.dataset.tapLabel}
      button.disabled=false;button.removeAttribute('aria-busy');
    }
  }
  function done(button){
    button?.classList.add('is-done');
    setTimeout(()=>button?.classList.remove('is-done'),1300);
  }
  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button:not(:disabled)');if(!b)return;
    if(pressedTimer)clearTimeout(pressedTimer);
    b.classList.add('is-pressed');
    vibrate(9);
  },{passive:true});
  document.addEventListener('pointerup',e=>{
    const b=e.target.closest('button');if(!b)return;
    pressedTimer=setTimeout(()=>b.classList.remove('is-pressed'),115);
  },{passive:true});
  document.addEventListener('pointercancel',()=>{
    document.querySelectorAll('button.is-pressed').forEach(b=>b.classList.remove('is-pressed'));
  },{passive:true});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button:not(:disabled)');if(!b||!tactileAllowed())return;
    const rect=b.getBoundingClientRect(),r=Math.max(rect.width,rect.height,70)*1.4;
    const mark=document.createElement('span');
    mark.className='teplo-ripple';
    mark.style.cssText='width:'+r+'px;height:'+r+'px;left:'+(e.clientX?e.clientX-rect.left:rect.width/2)+'px;top:'+(e.clientY?e.clientY-rect.top:rect.height/2)+'px;';
    b.append(mark);
    mark.addEventListener('animationend',()=>mark.remove(),{once:true});
    setTimeout(()=>mark.remove(),650);
  });
  document.addEventListener('invalid',e=>{
    const el=e.target;if(!el.matches('input,textarea,select'))return;
    el.setAttribute('aria-invalid','true');
    notify('Заполни поле «'+(document.querySelector('label[for="'+el.id+'"]')?.textContent||el.getAttribute('placeholder')||'обязательное поле')+'»','error');
  },true);
  document.addEventListener('input',e=>{if(e.target.matches('input,textarea,select'))e.target.removeAttribute('aria-invalid')},true);
  window.TEPLOTouch={notify,busy,done};
})();
