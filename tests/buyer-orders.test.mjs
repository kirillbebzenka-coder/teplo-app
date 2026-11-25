import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buyerOrderFinished,buyerOrderStatus} from '../buyer-orders-model.js';
class Node {
 constructor(tag='',text='',className=''){Object.assign(this,{tag,textContent:text,className,children:[],dataset:{},open:false});}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 setAttribute(){}
 querySelectorAll(){return this.children.flatMap(x=>[...(x.tag==='details'&&x.open?[x]:[]),...x.querySelectorAll()])}
}
const nodes=new Map(),el=(...args)=>new Node(...args),$=id=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id)};
const order=(id,extra={})=>({id,shop_name_snapshot:'Кафе',is_test:true,status:'new',demo_status:'pending',created_at:'2026-11-25T10:00:00Z',total:300,delivery_fee:65,order_items:[],...extra});
const done=order('done',{demo_status:'delivered',customer_comment:'Подъезд 2\nБез звонка'}),cancel=order('cancel',{status:'cancelled'}),waiting=order('waiting');
assert.equal(buyerOrderFinished(waiting,{state:'accepted'}),false);
assert.equal(buyerOrderFinished(done,null),true);
assert.equal(buyerOrderFinished(waiting,{state:'delivered'}),true);
assert.equal(buyerOrderFinished(order('real',{is_test:false,demo_status:'delivered'}),null),false);
assert.equal(buyerOrderStatus(cancel,null),'Отменён');
let signedIn=true,fail=false,progressFail=false,rows=[done,cancel,waiting],timerCalls=0;
const filters=[];
const ctx=vm.createContext({$,el,buyerOrderFinished,buyerOrderStatus,session:async()=>signedIn?{id:'owner'}:null,
 db:{from(){return {select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return this},limit(){return Promise.resolve(fail?{error:new Error('offline')}:{data:rows})}}},rpc:async()=>progressFail?{error:new Error('offline')}:{data:[{order_id:'done',state:'delivered',delivery_due_at:'old'},{order_id:'waiting',state:'accepted',message:'Курьер принял'}]}},
 money:n=>String(n),deliveryClock:{set(){}},deliveryTimer:()=>{timerCalls++;return el('timer')},appendCustomerComment:(card,text)=>{if(text)card.append(el('note',text))}});
const html=fs.readFileSync('order.html','utf8');
vm.runInContext(html.slice(html.indexOf('let ordersBusy=false;'),html.indexOf('const EMAIL_COOLDOWN_MS'))+'\nthis.refresh=orders;',ctx);
await ctx.refresh();
let [active,history]=$('orders').children;
assert.deepEqual(active.children.filter(x=>x.tag==='article').map(x=>x.children[0].textContent.includes('WAITING')),[true]);
assert.equal(history.children.filter(x=>x.tag==='details').length,2);
assert.equal(timerCalls,0,'a delivered order never retains its running delivery timer');
assert.ok(filters.every(([k,v])=>k==='customer_id'&&v==='owner'),'history reads only the signed-in owner');
const detail=history.children.find(x=>x.dataset.orderId==='done');
assert.equal(detail.open,false);assert.equal(detail.children[0].tag,'summary');
assert.ok(detail.children.some(x=>x.textContent==='Подъезд 2\nБез звонка'),'the exact comment remains in expanded history');
detail.open=true;await ctx.refresh();
assert.equal($('orders').children[1].children.find(x=>x.dataset.orderId==='done').open,true,'refresh preserves expanded details');
progressFail=true;await ctx.refresh();
assert.equal($('orders').children[1].children.filter(x=>x.tag==='details').length,2,'terminal snapshots remain archived without progress RPC');
const retained=$('orders').children;fail=true;await ctx.refresh();assert.equal($('orders').children,retained,'failed refresh retains displayed orders');assert.match($('ordersStatus').textContent,/Не удалось/);
signedIn=false;await ctx.refresh();assert.equal($('orders').children.length,1);assert.match($('orders').children[0].textContent,/Войди/);
console.log('PASS: terminal-only compact history, owner filtering, comment retention, stale refresh handling, guest clearing and preserved expansion.');
