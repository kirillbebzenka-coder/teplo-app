import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const elements=new Map();const node=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',value:'',open:false,classList:{remove(){},toggle(){}},addEventListener(){},close(){this.open=false},showModal(){this.open=true}});return elements.get(id);};
const job={id:'own-job',status:'accepted',courier_id:'rider',created_at:'2026-11-19T12:00:00Z',courier_reward_uah:55};
let identity={id:'rider',email:'test@example.invalid',email_confirmed_at:'2026-11-01'},profileRole='courier',offlineError=false,rpcCalls=0,resolveRpc;
const ownership=[];
class Query{constructor(table){this.table=table;this.filters=[];}select(){return this;}eq(k,v){this.filters.push([k,v]);ownership.push([this.table,k,v]);return this;}in(k,v){this.statuses=v;return this;}is(){return this;}order(){return this;}limit(){return this;}range(){return this;}single(){return this;}then(resolve){let data=[];if(this.table==='profiles')data={role:profileRole,full_name:'Тест'};else if(this.table==='teplo_pilot_jobs')data=this.statuses?.includes('accepted')?[job]:[];else if(this.table==='courier_shifts')data=[{id:'shift',started_at:'2026-11-19T10:00:00Z'}];else if(this.table==='teplo_pilot_earnings')data=[{job_id:job.id,amount_uah:55,recorded_at:'2026-11-19T12:00:00Z'}];return Promise.resolve({data,error:offlineError?new Error('Connection lost'):null}).then(resolve);}}
const database={auth:{getUser:async()=>({data:{user:identity}})},from:table=>new Query(table),rpc:async name=>name==='teplo_pilot_open_jobs_eta'?{data:[]}:(rpcCalls++,new Promise(resolve=>{resolveRpc=resolve;}))};
let lastRendered;
class View{constructor(callbacks){this.callbacks=callbacks;}update(s){lastRendered=s;}openJob(){}stopList(){return [{}];}}
const ctx=vm.createContext({CourierView:View,ACTIVE:['assigned','accepted','picked_up'],canClaim:({activeCount,shift,busy,online})=>online&&!busy&&shift&&activeCount<2,document:{getElementById:node,querySelector:()=>({textContent:''}),addEventListener(){},body:{classList:{remove(){}}}},window:{addEventListener(){},TEPLOTouch:{notify(){}}},navigator:{onLine:true},location:{search:'',pathname:'/pilot-courier.html'},URLSearchParams,setTimeout,queueMicrotask,console});
const source=fs.readFileSync('courier-app.js','utf8').replace(/^import .*;\n/gm,'');
vm.runInContext(source.slice(0,source.indexOf("\nif(preview){$('previewBanner')"))+`\nthis.setDatabase=x=>{db=x};this.currentState=()=>state;this.runLoad=load;this.runMutation=mutation;this.report=reportIssue;`,ctx);
ctx.setDatabase(database);await ctx.runLoad();
assert.equal(ctx.currentState().active.length,1);assert.equal(node('app').hidden,false);assert.equal(node('lock').hidden,true);
for(const table of ['teplo_pilot_jobs','courier_shifts','teplo_pilot_earnings'])assert.ok(ownership.some(x=>x[0]===table&&x[1]==='courier_id'&&x[2]==='rider'),'owner filter: '+table);
offlineError=true;await ctx.runLoad();assert.equal(ctx.currentState().active.length,1,'network failure retains last received jobs');assert.match(node('connectionNotice').textContent,/Нет связи/);offlineError=false;
const mutation=ctx.runMutation(()=>database.rpc('claim'),'Сохранено');await new Promise(resolve=>setImmediate(resolve));
assert.equal(await ctx.runMutation(()=>database.rpc('claim'),'Сохранено'),false,'parallel mutation is rejected');assert.equal(rpcCalls,1);assert.equal(lastRendered.mutating,true);
resolveRpc({error:null});assert.equal(await mutation,true);assert.equal(lastRendered.mutating,false);
ctx.navigator.onLine=false;assert.equal(await ctx.runMutation(()=>database.rpc('claim'),'Сохранено'),false);assert.equal(rpcCalls,1);ctx.navigator.onLine=true;
await assert.rejects(ctx.report({id:'someone-else'},'Тестовая проблема'),/недоступен/);
profileRole='customer';await ctx.runLoad();assert.equal(ctx.currentState(),null);assert.equal(node('app').hidden,true);assert.equal(node('routeActions').hidden,true);
identity=null;await ctx.runLoad();assert.equal(node('tabbar').hidden,true);
console.log('PASS: owner-scoped queries, preserved orders on network failure, duplicate mutation lock, offline guard, foreign issue guard, role revocation and signed-out lock.');
