import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('buyer-theme.js','utf8');
function page(storage,{blocked=false,loading=false}={}){
 const root={dataset:{}},button={attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.listeners[k]=fn}},metas=new Map();
 const events={},dom={};
 for(const name of ['theme-color','color-scheme'])metas.set(name,{setAttribute(k,v){this[k]=v}});
 vm.runInNewContext(source,{document:{documentElement:root,readyState:loading?'loading':'complete',getElementById:()=>loading?null:button,querySelector:s=>metas.get(s.includes('theme-color')?'theme-color':'color-scheme'),addEventListener:(k,fn)=>dom[k]=fn},localStorage:{getItem:k=>{if(blocked)throw Error('denied');return storage.get(k)},setItem:(k,v)=>{if(blocked)throw Error('denied');storage.set(k,v)}},window:{addEventListener:(k,fn)=>events[k]=fn}});
 return {root,button,metas,events,dom};
}
const saved=new Map(),a=page(saved);
assert.equal(a.root.dataset.buyerTheme,'light');
a.button.listeners.click();assert.equal(a.root.dataset.buyerTheme,'dark');assert.equal(a.button.attrs['aria-pressed'],'true');assert.match(a.button.attrs['aria-label'],/светлый/);assert.equal(a.metas.get('theme-color').content,'#0b090f');
const b=page(saved);assert.equal(b.root.dataset.buyerTheme,'dark','navigation restores the saved theme');
b.button.listeners.click();a.events.storage({key:'teplo:buyer-theme'});assert.equal(a.root.dataset.buyerTheme,'light','another customer tab synchronises the choice');
saved.set('teplo:buyer-theme','dark');a.events.pageshow();assert.equal(a.root.dataset.buyerTheme,'dark','back navigation restores the preference');
saved.clear();a.events.storage({key:null});assert.equal(a.root.dataset.buyerTheme,'light','cleared storage restores the light default');
const privatePage=page(new Map(),{blocked:true});privatePage.button.listeners.click();assert.equal(privatePage.root.dataset.buyerTheme,'dark');privatePage.events.pageshow();assert.equal(privatePage.root.dataset.buyerTheme,'dark','storage denial does not break the current page');
const early=page(new Map([['teplo:buyer-theme','dark']]),{loading:true});assert.equal(early.root.dataset.buyerTheme,'dark','the theme is selected before body rendering');
assert.equal(page(new Map([['teplo:buyer-theme','unknown']])).root.dataset.buyerTheme,'light');
for(const file of ['index.html','order.html','felicita.html']){const html=fs.readFileSync(file,'utf8');assert.equal((html.match(/id="buyerThemeToggle"/g)||[]).length,1);assert.match(html,/buyer-theme.js\?v=81/);assert.match(html,/buyer-theme.css\?v=81/);}
for(const file of ['pilot-courier.html','pilot-dispatch.html','partner.html','shop.html','team.html'])assert.ok(!fs.readFileSync(file,'utf8').includes('buyer-theme'),'staff workspace does not load the customer preference');
console.log('PASS: light default, saved preference, early application, accessible toggle, navigation/tab sync, blocked storage, and customer-only scope.');
