import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('role-portal.js','utf8').replace(/^import .*;\n/gm,'').replace(/^const client=.*;\n/gm,'').replace(/await check\(\);\s*$/,'');
async function run(page,role,{guest=false,offline=false,publicNav=true}={}){
 const redirects=[],nav={rewrites:0,hasAttribute:key=>publicNav&&key==='data-buyer-navigation',replaceChildren(){this.rewrites++},style:{},append(){}},user={id:'same-account'};let reads=0;
 const ctx=vm.createContext({client:{auth:{getUser:async()=>({data:{user:guest?null:user}})},from:()=>({select(){return this},eq(){return this},single:async()=>{reads++;return offline?{error:new Error('Network')}:{data:{role}}}})},location:{pathname:'/teplo-app/'+page,replace:url=>redirects.push(url)},document:{getElementById:()=>null,querySelector:selector=>selector.includes('nav[')?nav:null},window:{TEPLOIcons:{mount(){}}}});
 vm.runInContext(source+'\nthis.check=check;',ctx);await ctx.check();return {redirects,nav,reads,user};
}
for(const page of ['','index.html','felicita.html','order.html'])for(const role of ['customer','courier','dispatcher','venue','admin']){const result=await run(page,role);assert.equal(result.redirects.length,0,page+': '+role+' can browse and buy without a workspace redirect');assert.equal(result.nav.rewrites,0,'buyer navigation is retained');assert.equal(result.user.id,'same-account');}
assert.equal((await run('order.html','courier',{guest:true})).redirects.length,0,'guest can view menu');
assert.equal((await run('order.html','courier',{offline:true})).redirects.length,0,'network failure must not route to a work account');
for(const [page,role,destination] of [['pilot-dispatch.html','courier','pilot-courier.html'],['team.html','customer','courier-start.html'],['partner.html','customer','courier-start.html'],['shop.html','courier','pilot-courier.html'],['courier.html','customer','courier-start.html']]){const result=await run(page,role);assert.equal(result.redirects.length,1);assert.ok(result.redirects[0].startsWith(destination),'staff-only page stays protected: '+page);}
for(const [page,role] of [['pilot-dispatch.html','dispatcher'],['team.html','admin'],['partner.html','venue'],['courier.html','courier']])assert.equal((await run(page,role)).redirects.length,0);
console.log('PASS: buyer menu stays open for guests and every signed-in role; identity/navigation retained, workspaces protected, network errors do not redirect.');
