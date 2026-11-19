import {DELIVERY_AREAS} from '../delivery-policy.js';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('order.html','utf8');
const save=html.slice(html.indexOf('async function saveDemoCheckout(){'),html.indexOf('async function createDemoOrder(){'));
const adjust=html.slice(html.indexOf('function adjustCart('),html.indexOf('function addToCart('));
const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'Тестовая строка',style:{},disabled:false,scrollIntoView(){}});return nodes.get(id)};
get('demoArea').value='teplodar';
get('paymentMethod').value='cash_on_delivery';
let rejectFirst,networkCalls=0;const requests=[];
const ctx=vm.createContext({DELIVERY_AREAS,$:get,navigator:{onLine:true},crypto:{randomUUID:()=> 'same-request'},cartItems:new Map([['p',{id:'p',quantity:1}]]),cartRequestId:null,cartShopId:'shop',checkoutBusy:false,
 lockCheckout(b){ctx.checkoutBusy=b},saveCartDraft(){},renderCart(){},orders:async()=>{},
 db:{auth:{getUser:async()=>({data:{user:{id:'buyer'}}})},rpc:async(name,payload)=>{networkCalls++;requests.push(payload.p_request_id);if(networkCalls===1)return new Promise((resolve,reject)=>{rejectFirst=reject});return {data:'order-123',error:null}}}});
vm.runInContext(adjust+'\n'+save+'\nthis.submit=saveDemoCheckout;this.adjust=adjustCart;',ctx);
const first=ctx.submit();await new Promise(resolve=>setImmediate(resolve));
assert.equal(networkCalls,1);assert.equal(ctx.checkoutBusy,true);
await ctx.submit();assert.equal(networkCalls,1,'double tap must not submit twice');
ctx.adjust({id:'p',quantity:1},1);assert.equal(ctx.cartItems.get('p').quantity,1,'cart cannot change mid-flight');
rejectFirst(new Error('Failed to fetch'));await first;
assert.equal(ctx.cartItems.size,1);assert.equal(ctx.cartRequestId,'same-request');assert.equal(ctx.checkoutBusy,false);
assert.match(get('demoCheckoutStatus').textContent,/мог сохраниться/);
await ctx.submit();assert.deepEqual(requests,['same-request','same-request']);assert.equal(ctx.cartItems.size,0);assert.equal(ctx.cartRequestId,null);
ctx.cartItems.set('p',{id:'p',quantity:1});ctx.navigator.onLine=false;await ctx.submit();assert.equal(networkCalls,2,'offline submit must not send');assert.equal(ctx.cartItems.size,1);
console.log('PASS: duplicate tap, cart lock, uncertain network failure, stable retry ID, success cleanup, offline preservation.');
