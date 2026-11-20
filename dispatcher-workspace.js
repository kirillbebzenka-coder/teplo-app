/* Local navigation only; all authority remains in the existing Supabase guards. */
export function initDispatcherWorkspace(){
 const tabs=[{id:'calls',label:'Заказы',icon:'clipboard',panel:'deliveryArea'},{id:'couriers',label:'Курьеры',icon:'users',panel:'courierArea'},{id:'buyers',label:'Заведения',icon:'store',panel:'buyerOrderArea'},{id:'more',label:'Ещё',icon:'list',panel:'settingsArea'}];
 const bar=document.getElementById('workspaceTabs');if(!bar)return;
 let active='calls';
 function show(requested){let id=requested==='slots'?'more':requested;if(!tabs.some(t=>t.id===id))id='calls';active=id;for(const t of tabs){document.getElementById(t.panel).hidden=t.id!==id;const button=document.getElementById('workspace-'+t.id);button.setAttribute('aria-current',t.id===id?'page':'false');}document.getElementById('stats').hidden=id!=='calls';document.getElementById('courierQuickStrip').hidden=id!=='calls';document.getElementById('dispatchScreenTitle').textContent=tabs.find(t=>t.id===id).label==='Ещё'?'Настройки':id==='buyers'?'Подтверждения':tabs.find(t=>t.id===id).label;if(requested==='slots')document.getElementById('slotSettings').open=true;window.dispatchEvent(new CustomEvent('teplo:workspace-change',{detail:{id}}));window.scrollTo({top:0});}
 for(const tab of tabs){const b=document.createElement('button');b.type='button';b.id='workspace-'+tab.id;b.dataset.workspace=tab.id;const icon=document.createElement('span');icon.dataset.teploIcon=tab.icon;const label=document.createElement('span');label.textContent=tab.label;const count=document.createElement('span');count.id='workspace-count-'+tab.id;count.className='nav-count';count.hidden=true;b.append(icon,label,count);b.onclick=()=>show(tab.id);bar.append(b);}
 window.TEPLOWorkspace={show,get active(){return active},setCount(id,n){const count=document.getElementById('workspace-count-'+id);if(!count)return;count.textContent=String(Math.max(0,Number(n)||0));count.hidden=!(Number(n)>0)||id==='more';}};
 show(new URLSearchParams(location.search).get('tab')||'calls');window.TEPLOIcons?.mount(bar);
 return window.TEPLOWorkspace;
}
