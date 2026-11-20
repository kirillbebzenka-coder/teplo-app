import {DELIVERY_AREAS} from './delivery-policy.js?v=68';
export function initBuyerArea(){
 const selector=document.getElementById('areaSelect'),label=document.getElementById('areaLabel'),dialog=document.getElementById('areaDialog'),open=document.getElementById('areaOpen'),checkout=document.getElementById('demoArea');
 const stored=()=>{try{return sessionStorage.getItem('teplo:buyer-area')||''}catch{return ''}};
 function save(value){if(!DELIVERY_AREAS[value])return;try{sessionStorage.setItem('teplo:buyer-area',value)}catch{}if(label)label.textContent=DELIVERY_AREAS[value].label;if(selector)selector.value=value;if(checkout&&!checkout.value)checkout.value=value;}
 if(DELIVERY_AREAS[stored()])save(stored());
 if(open&&dialog){open.onclick=()=>dialog.showModal();document.getElementById('areaClose').onclick=()=>dialog.close();document.getElementById('areaSave').onclick=()=>{save(selector.value);dialog.close()};}
 if(checkout)checkout.addEventListener('change',()=>{const value=checkout.value;if(DELIVERY_AREAS[value]){try{sessionStorage.setItem('teplo:buyer-area',value)}catch{}}});
}
export function initBuyerNavigation(){
 function route(){const hash=location.hash;for(const a of document.querySelectorAll('[data-buyer-navigation] a')){const current=a.getAttribute('href').includes(hash)&&hash.length>1;a.classList.toggle('active',current);if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}if(hash==='#accountSection'){document.getElementById('authDetails').open=true;}if(hash==='#cart-section')document.getElementById('cart-section').hidden=false;const target=document.getElementById(hash.slice(1));if(target)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}
 window.addEventListener('hashchange',route);window.addEventListener('teplo:buyer-ready',route);if(location.hash)route();
}
initBuyerArea();if(document.getElementById('market'))initBuyerNavigation();
const menuSearch=document.getElementById('menuSearch');
if(menuSearch){const filter=()=>{const query=menuSearch.value.trim().toLocaleLowerCase('ru').replaceAll('ё','е');let found=0;for(const product of document.querySelectorAll('#catalog .product')){product.hidden=!String(product.dataset.search||'').toLocaleLowerCase('ru').replaceAll('ё','е').includes(query);if(!product.hidden)found++;}document.getElementById('menuNoResults').hidden=!query||found>0;};menuSearch.addEventListener('input',filter);window.addEventListener('teplo:buyer-ready',filter);}
