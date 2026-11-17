/* Single workspace switcher for TEPLO dispatcher; no changes to palette or order logic. */
(() => {
 const tabs=[
  {id:'buyers',label:'Покупатели',panel:'buyerOrderArea'},
  {id:'calls',label:'Вызовы',panel:'deliveryArea'},
  {id:'couriers',label:'Курьеры',panel:'courierArea'},
  {id:'slots',label:'Слоты',panel:'slotArea'}
 ];
 let active='buyers';
 function init(){
  const bar=document.getElementById('workspaceTabs');
  if(!bar)return;
  function show(id){
   if(!tabs.some(t=>t.id===id))id='buyers';
   active=id;
   for(const t of tabs){
    const panel=document.getElementById(t.panel),button=document.getElementById('workspace-'+t.id);
    if(panel)panel.hidden=t.id!==id;
    if(button){button.setAttribute('aria-selected',String(t.id===id));button.tabIndex=t.id===id?0:-1}
   }
   const panel=document.getElementById(tabs.find(t=>t.id===id).panel);
   if(panel)panel.setAttribute('data-workspace-active','true');
  }
  for(const t of tabs){
   const button=document.createElement('button');
   button.type='button';button.id='workspace-'+t.id;
   button.setAttribute('role','tab');button.setAttribute('aria-controls',t.panel);
   button.append(document.createTextNode(t.label+' '));
   const badge=document.createElement('span');badge.className='tab-count';badge.id='workspace-count-'+t.id;badge.textContent='0';
   button.append(badge);button.onclick=()=>show(t.id);
   bar.append(button);
  }
  bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Рабочие разделы диспетчерской');
  bar.addEventListener('keydown',ev=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
   ev.preventDefault();
   let i=tabs.findIndex(t=>t.id===active);
   if(ev.key==='ArrowRight')i=(i+1)%tabs.length;
   if(ev.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;
   if(ev.key==='Home')i=0;
   if(ev.key==='End')i=tabs.length-1;
   show(tabs[i].id);document.getElementById('workspace-'+tabs[i].id)?.focus();
  });
  window.TEPLOWorkspace={
   show,
   get active(){return active},
   setCount(id,n){const b=document.getElementById('workspace-count-'+id);if(b)b.textContent=String(Math.max(0,Number(n)||0))}
  };
  const requested=new URLSearchParams(window.location.search).get('tab');
  show(tabs.some(t=>t.id===requested)?requested:'buyers');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
