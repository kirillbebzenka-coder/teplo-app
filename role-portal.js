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
 courier:'pilot-courier.html?v=35',
 customer:'courier-start.html?v=35'
};
function applyRoleNavigation(role){
 const teamLinks=document.querySelector('footer details');
 if(teamLinks&&role!=='admin')teamLinks.hidden=true;
 const legacy=document.querySelector('nav.teplo-tabs,nav.nav-bottom,nav.buyer-nav,nav[aria-label="Рабочие разделы"],nav[aria-label="Разделы TEPLO"]');
 if(!legacy)return;
 legacy.replaceChildren();
 const pages=role==='admin'?
 [['🏪','Ресторан','partner.html?v=35'],['📋','Диспетчер','pilot-dispatch.html?v=35'],['🛵','Курьер · тест','courier-start.html?v=35'],['⚙️','Команда','team.html?v=35']]:
 role==='dispatcher'? [['📋','Заявки','pilot-dispatch.html?v=35']]:
 role==='venue'? [['🏪','Мои заявки','partner.html?v=35']]:
 role==='courier'? [['🛵','Мои заказы','pilot-courier.html?v=35']]:
 role==='customer'? [['🏪','Магазины','./?v=35'],['🧾','Мои заказы','order.html?v=35#orders-section']]: [];
 if(!pages.length){legacy.hidden=true;return}
 legacy.hidden=false;
 legacy.style.gridTemplateColumns='repeat('+pages.length+',minmax(0,1fr))';
 if(page==='partner.html'&&role==='venue'){
  const headerLink=document.querySelector('main>header a[href*="dispatcher"]');
  if(headerLink)headerLink.hidden=true;
 }
 for(const [emoji,label,href] of pages){
  const a=document.createElement('a');a.href=href;a.textContent=emoji+' '+label;
  if(location.pathname.endsWith(href.split('?')[0])){a.className='active';a.setAttribute('aria-current','page')}
  legacy.append(a);
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
