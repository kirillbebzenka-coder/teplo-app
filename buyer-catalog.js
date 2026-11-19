/* Public catalog; reuse TEPLO cards and palette. Only demo shops accept demo checkout. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const root=document.getElementById('restaurants'),input=document.getElementById('search'),count=document.getElementById('count'),empty=document.getElementById('noResults');
const template=root.querySelector('a[href^="order.html"]');const example=template?.cloneNode(true);
let kind='all';
function filter(){let n=0;for(const card of root.querySelectorAll('.restaurant')){const show=(kind==='all'||(card.dataset.tags||'').split(' ').includes(kind))&&(!input.value.trim()||(card.dataset.search||'').includes(input.value.trim().toLocaleLowerCase('ru')));card.hidden=!show;if(show)n++}count.textContent=n+' '+(n===1?'место':n<5?'места':'мест');empty.hidden=n>0;}
input.addEventListener('input',filter);
for(const button of document.querySelectorAll('.chip-row button'))button.onclick=()=>{kind=button.dataset.kind;for(const b of document.querySelectorAll('.chip-row button')){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))}filter()};
const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');root.before(status);
async function load(){
 status.textContent='Загружаем заведения…';
 try{
  const [{data:shops,error:se},{data:products,error:pe}]=await Promise.all([db.from('shops').select('id,name,description,is_active').eq('is_active',true).order('name'),db.from('products').select('id,shop_id,name,is_available').eq('is_available',true)]);
  if(se||pe)throw se||pe;
  for(const old of root.querySelectorAll('[data-live-shop],a[href^="order.html"]'))old.remove();
  for(const shop of shops||[]){
   const card=example.cloneNode(true),items=(products||[]).filter(p=>p.shop_id===shop.id),demo=/^TEPLO TEST/i.test(shop.name);
   card.dataset.liveShop=shop.id;card.href='order.html?v=68&shop='+encodeURIComponent(shop.id);card.dataset.tags='test '+(items.some(p=>/пицц|pizza/i.test(p.name))?'pizza':'');card.dataset.search=[shop.name,shop.description,...items.map(x=>x.name)].join(' ').toLocaleLowerCase('ru');
   card.querySelector('h3').textContent=shop.name;card.querySelector('.brand-tag').textContent=shop.name;card.querySelector('.flag').textContent=demo?'ТЕСТ · БЕЗ ОПЛАТЫ':'МЕНЮ';
   card.querySelector('.restaurant-body p').textContent=shop.description||'Выбери товары в меню заведения';
   const tags=card.querySelector('.tags');tags.replaceChildren();for(const text of [items.length+' позиций',demo?'Тестовое заведение':'Каталог']){const tag=document.createElement('span');tag.className='tag';tag.textContent=text;tags.append(tag)}
   card.querySelector('.action span').textContent='Открыть меню →';card.querySelector('.action strong').textContent=demo?'Демо · без доставки':'Оформление пока недоступно';root.append(card);
  }
  status.textContent='Можно собрать товары из нескольких тестовых заведений в одну корзину.';filter();
 }catch{status.textContent='Не удалось обновить заведения. Проверь соединение.';const retry=document.createElement('button');retry.textContent='Повторить';retry.onclick=()=>void load();status.append(retry);filter();}
}
void load();
