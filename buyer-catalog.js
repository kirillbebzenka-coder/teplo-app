/* Guest browsing uses public catalog reads only; checkout retains existing authentication. */
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {venueFromShop,previewVenue,visibleVenues,savedCartUnits,quantityLabel} from './buyer-storefront-model.js?v=80';
import './buyer-storefront.js?v=77';
const db=createClient('https://bgtegxdekqsajttkhhrj.supabase.co','sb_publishable_aSOKkJ_F47sGj9e8v8uJ3g_24rlQ8XG');
const $=id=>document.getElementById(id),el=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n};
let venues=[previewVenue],kind='all',loading=false;
const venuePhotos={
 pizza:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=640&q=80',
 drink:'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=640&q=80'
};
function card(venue){
 const a=el('a','','venue-tile');a.href=venue.href;a.dataset.venueId=venue.id;a.setAttribute('aria-label',venue.name+' · '+venue.mode);
 const art=el('div','','venue-art '+venue.art);const icon=el('span');icon.dataset.teploIcon=venue.art==='pizza'?'pizza':venue.art==='drink'?'cup':'bag';const monogram=el('span',venue.preview?'F':venue.name.replace(/^TEPLO\s*/i,'').slice(0,1),'venue-monogram');art.append(icon,monogram);
 if(venuePhotos[venue.art]){const photo=el('img','','venue-photo');photo.src=venuePhotos[venue.art];photo.alt='Иллюстративная фотография категории, не товар заведения';photo.loading='lazy';photo.decoding='async';photo.onerror=()=>{photo.hidden=true};art.append(photo);}
 art.append(el('span',venue.mode,'venue-label'));
 const copy=el('div','','venue-copy');copy.append(el('h3',venue.name),el('p',venue.subtitle,'venue-subtitle'),el('span',venue.preview?'Посмотреть превью':'Открыть меню','venue-mode'));a.append(art,copy);return a;
}
function render(){const visible=visibleVenues(venues,{kind,search:$('search').value});$('restaurants').replaceChildren(...visible.map(card));$('count').textContent=visible.length+' из '+venues.length;$('noResults').hidden=visible.length>0;window.TEPLOIcons?.mount($('restaurants'));}
function showCart(){let units=0;try{units=savedCartUnits(sessionStorage.getItem('teplo:buyer-cart'))}catch{}$('homeCartCount').textContent=units?String(units):'';$('homeCartCount').hidden=!units;$('homeCart').setAttribute('aria-label',units?'Корзина · '+quantityLabel(units):'Корзина');}
async function load(){
 if(loading)return;loading=true;$('catalogRetry').hidden=true;$('catalogStatus').textContent='Загружаем заведения…';
 try{
  const [{data:shops,error:se},{data:products,error:pe}]=await Promise.all([db.from('shops').select('id,name,description,is_active').eq('is_active',true).order('name'),db.from('products').select('id,shop_id,name,is_available').eq('is_available',true)]);if(se||pe)throw se||pe;
  const live=(shops||[]).map(s=>venueFromShop(s,products||[]));venues=[...live,...(live.some(v=>/фел[іи]ч[іи]та|felicita/i.test(v.name))?[]:[previewVenue])];
  $('catalogStatus').textContent='';render();
 }catch{$('catalogStatus').textContent='Не удалось обновить заведения. Проверь интернет и повтори.';$('catalogRetry').hidden=false;render();}
 finally{loading=false;}
}
$('search').addEventListener('input',render);for(const button of document.querySelectorAll('[data-kind]'))button.onclick=()=>{kind=button.dataset.kind;for(const b of document.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b===button));render();};
$('catalogRetry').onclick=()=>void load();window.addEventListener('online',()=>void load());window.addEventListener('pageshow',showCart);document.addEventListener('visibilitychange',()=>{if(!document.hidden)showCart()});showCart();render();void load();
