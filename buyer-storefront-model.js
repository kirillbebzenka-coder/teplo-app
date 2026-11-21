/* Public catalogue metadata only. No availability, ETA or partner claims are invented. */
export const normaliseSearch=value=>String(value??'').toLocaleLowerCase('ru').replaceAll('ё','е').trim();
export function quantityLabel(count){const n=Math.abs(Number(count)||0),last=n%10,teen=n%100;return n+' '+(last===1&&teen!==11?'товар':last>=2&&last<=4&&(teen<12||teen>14)?'товара':'товаров');}
export function venueFromShop(shop,products=[]){
 const items=products.filter(p=>p.shop_id===shop.id&&p.is_available!==false),text=normaliseSearch([shop.name,shop.description,...items.map(p=>p.name)].join(' '));
 const food=/пицц|pizza|суш|ролл|шаверм|шаурм|бургер|паст[аы]|ресторан|кафе/.test(text),drinks=!food&&/напит|вод[аы]|сок|cola|drink|кофе|чай/.test(text);
 const demo=/^TEPLO TEST/i.test(shop.name);
 return {id:shop.id,name:shop.name,kind:food?'food':'stores',art:food?'pizza':drinks?'drink':'bag',subtitle:food?'Еда':drinks?'Напитки':'Магазин',mode:demo?'Тестовое меню':'Каталог',demo,count:items.length,search:text,href:'order.html?v=74&shop='+encodeURIComponent(shop.id)};
}
export const previewVenue={id:'preview-felicita',name:'Фелічіта',kind:'food',art:'pizza',subtitle:'Пицца и паста',mode:'Превью меню',demo:false,preview:true,count:null,search:'фелічіта феличита felicita пицца паста бургеры салаты десерты',href:'felicita.html?v=72'};
export function visibleVenues(venues,{kind='all',search=''}={}){const query=normaliseSearch(search);return venues.filter(v=>(kind==='all'||v.kind===kind)&&(!query||normaliseSearch(v.search).includes(query)));}
export function savedCartUnits(raw){try{const parsed=JSON.parse(raw||'{}'),seen=new Set();return (Array.isArray(parsed.items)?parsed.items:[]).reduce((n,item)=>{if(typeof item.id!=='string'||seen.has(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20)return n;seen.add(item.id);return n+item.quantity;},0);}catch{return 0;}}
