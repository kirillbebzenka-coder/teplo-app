/* TEPLO role portal: client navigation only; actual access is enforced by Supabase RLS/RPC. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const client=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const page=location.pathname.split('/').pop().toLowerCase();
const permissions={
 'team.html':['admin'],
 'dispatcher.html':['admin','dispatcher'],
 'pilot-dispatch.html':['admin','dispatcher'],
 'shop.html':['admin','venue'],
 'partner.html':['admin','venue'],
 'courier.html':['admin','courier'],
 'order.html':['admin','customer']
};
const destinations={
 admin:'team.html?v=35',
 dispatcher:'pilot-dispatch.html?v=35',
 venue:'partner.html?v=35',
 courier:'pilot-courier.html?v=67',
 customer:'courier-start.html?v=35'
};
function applyRoleNavigation(role){
 const teamLinks=document.querySelector('footer details');
 if(teamLinks&&role!=='admin')teamLinks.hidden=true;
 const legacy=document.querySelector('nav.teplo-tabs,nav.nav-bottom,nav.buyer-nav,nav[aria-label="Рабочие разделы"],nav[aria-label="Разделы TEPLO"]');
 if(!legacy)return;
 legacy.replaceChildren();
 const pages=role==='admin'?
 [['store','Ресторан','partner.html?v=55'],['clipboard','Диспетчер','pilot-dispatch.html?v=55'],['bike','Курьер · тест','pilot-courier.html?v=67'],['users','Команда','team.html?v=55']]:
 role==='dispatcher'? [['clipboard','Заявки','pilot-dispatch.html?v=55']]:
 role==='venue'? [['store','Мои заявки','partner.html?v=55']]:
 role==='courier'? [['bike','Мои заказы','pilot-courier.html?v=67']]:
 role==='customer'? [['store','Магазины','./?v=55'],['history','Мои заказы','order.html?v=55#orders-section']]: [];
 if(!pages.length){legacy.hidden=true;return}
 legacy.hidden=false;
 legacy.style.gridTemplateColumns='repeat('+pages.length+',minmax(0,1fr))';
 if(page==='partner.html'&&role==='venue'){
  const headerLink=document.querySelector('main>header a[href*="dispatcher"]');
  if(headerLink)headerLink.hidden=true;
 }
 for(const [icon,label,href] of pages){
  const a=document.createElement('a');a.href=href;
  const figure=document.createElement('span');figure.setAttribute('data-teplo-icon',icon);figure.setAttribute('aria-hidden','true');
  const text=document.createElement('span');text.textContent=label;
  a.append(figure,text);
  if(location.pathname.endsWith(href.split('?')[0])){a.className='active';a.setAttribute('aria-current','page')}
  legacy.append(a);
 }
 if(window.TEPLOIcons)window.TEPLOIcons.mount(legacy);
 else if(!document.querySelector('script[data-teplo-icons-loader]')){
  const script=document.createElement('script');script.src='./pilot-ui-icons.js?v=55';script.defer=true;
  script.dataset.teploIconsLoader='true';script.onload=()=>window.TEPLOIcons?.mount(legacy);
  document.head.append(script);
 }
}
async function check(){
 try{
  const {data,error}=await client.auth.getUser();if(error)throw error;
  const user=data?.user;if(!user){if(page==='index.html'||page==='order.html'||page==='')applyRoleNavigation('customer');return}
  const {data:profile,error:pe}=await client.from('profiles').select('role').eq('id',user.id).single();
  if(pe)throw pe;
  const role=profile?.role||'customer';
  if(permissions[page]&&!permissions[page].includes(role)){
   location.replace(destinations[role]||'courier-start.html?v=35');return;
  }
  applyRoleNavigation(role);
 }catch(e){
  // When connection drops, don't misidentify the person or redirect.
  const target=document.getElementById('notice')||document.getElementById('message');
  if(target)target.textContent='Не удалось проверить роль. Обнови страницу после восстановления сети.';
 }
}
await check();
