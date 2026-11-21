import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CourierView} from '../courier-view.js';
import {makePreview} from '../courier-preview.js';

// Render the real card, including assigned orders, without accepting the job.
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=value;}
 set innerHTML(value){throw Error('Order text must never be interpreted as markup');}
}
globalThis.document={createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag),head:new Element('head'),getElementById:()=>null};
const walk=node=>[node,...node.children.flatMap(walk)];
const text=node=>walk(node).map(n=>n.textContent).join('\n');
const view=Object.create(CourierView.prototype),steps=[];
view.callbacks={step:(job,action)=>steps.push([job.id,action])};
for(const [stage,label,action] of [['assigned','Принять заказ','accepted'],['accepted','Все точки забраны','picked_up'],['picked_up','Подтвердить вручение','delivered']]){
 view.state={...makePreview(stage),online:true,mutating:false};
 const job=view.state.active[0];job.customer_phone='+380501234567';
 const card=view.activeCard(job),nodes=walk(card),content=text(card);
 assert.equal(card.tag,'article','card cannot be a button containing nested controls');
 for(const required of [job.customer_name,job.customer_phone,job.delivery_address,job.order_summary,job.customer_comment,'TEPLO TEST 2','Твой доход: 55','Стоимость доставки: 65'])assert.ok(content.includes(required),'visible before acceptance: '+required);
 assert.ok(!nodes.some(n=>n.tag==='details'),'essential order data must not require disclosure');
 assert.equal(card.children[1].dataset.customerComment,'','comment immediately follows the order heading');
 const accept=nodes.find(n=>n.tag==='button'&&n.textContent===label);assert.ok(accept);assert.equal(accept.disabled,false);accept.onclick();assert.deepEqual(steps.at(-1),[job.id,action]);
 assert.equal(job.status,stage,'rendering/click delegation must not optimistically alter status');
 assert.ok(nodes.some(n=>n.attributes.href===undefined&&n.href==='tel:+380501234567'));
 assert.ok(nodes.filter(n=>n.tag==='a'&&n.href?.startsWith('https:')).every(n=>n.rel==='noopener noreferrer'));
 view.state.online=false;
 assert.equal(walk(view.activeCard(job)).find(n=>n.textContent===label).disabled,true);
 view.state.online=true;view.state.mutating=true;
 assert.equal(walk(view.activeCard(job)).find(n=>n.textContent===label).disabled,true);
}
view.state={...makePreview('accepted'),online:true,mutating:false};
const unknown=view.state.active[0];unknown.delivery_zone=null;
assert.ok(text(view.activeCard(unknown)).includes('Адрес не распознан. Выбери зону до забора.'),'zone correction remains available on the main card');
assert.match(fs.readFileSync('courier-view.js','utf8'),/for\(const job of this.state.active\)root.append\(this.activeCard\(job\)\)/,'full card stays on the main active-orders screen');
delete globalThis.document;
console.log('PASS: complete assigned/accepted/in-transit cards, prominent notes, all pickup points, recipient phone, direct stage controls and offline/busy guards.');
