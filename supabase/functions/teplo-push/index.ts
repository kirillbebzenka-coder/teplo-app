import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl=Deno.env.get("SUPABASE_URL")!;
const serverKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(projectUrl,serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
const origin="https://kirillbebzenka-coder.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"};
function answer(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}})}
async function config(){
 const {data,error}=await admin.rpc("teplo_push_internal_config");
 if(error)throw error;
 return data as {webhookKey:string|null,vapid:string|null};
}
async function vapid(){
 let cfg=await config();
 if(!cfg.vapid){
  const keys=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const pair={publicKey:await crypto.subtle.exportKey("jwk",keys.publicKey),privateKey:await crypto.subtle.exportKey("jwk",keys.privateKey)};
  const {error}=await admin.rpc("teplo_push_internal_store_vapid",{p_value:pair});
  if(error)throw error;
  cfg=await config();
 }
 if(!cfg.vapid)throw new Error("No VAPID keypair");
 const keys=await webpush.importVapidKeys(JSON.parse(cfg.vapid));
 return {keys,publicKey:await webpush.exportApplicationServerKey(keys),webhookKey:cfg.webhookKey};
}
async function signedInStaff(req:Request){
 const auth=req.headers.get("Authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return null;
 const {data:{user},error}=await admin.auth.getUser(token);
 if(error||!user||!user.email_confirmed_at)return null;
 const {data:profile}=await admin.from("profiles").select("role").eq("id",user.id).single();
 if(!["admin","dispatcher","courier"].includes(profile?.role))return null;
 return {id:user.id,role:profile.role};
}
async function sendTo(ids:string[],payload:{title:string,body:string,url:string,tag:string}){
 if(!ids.length)return {sent:0,attempted:0};
 const unique=[...new Set(ids)];
 const {data:subs,error}=await admin.from("teplo_push_subscriptions").select("endpoint,user_id,payload").in("user_id",unique).limit(300);
 if(error)throw error;
 if(!subs?.length)return {sent:0,attempted:0};
 const {keys}=await vapid();
 const server=await webpush.ApplicationServer.new({
  contactInformation:"https://kirillbebzenka-coder.github.io/teplo-app/",
  vapidKeys:keys
 });
 let sent=0;
 await Promise.all(subs.map(async(sub)=>{
  try{
   // Avoid outbound requests to arbitrary user-supplied hostnames.
   const host=new URL(sub.endpoint).hostname;
   if(!(host==="fcm.googleapis.com"||host==="updates.push.services.mozilla.com"||host.endsWith(".push.apple.com")||host.endsWith(".notify.windows.com")))return;
   const subscriber=server.subscribe(sub.payload);
   await subscriber.pushTextMessage(JSON.stringify(payload),{ttl:3600,urgency:webpush.Urgency.High});
   sent++;
  }catch(e){
   const status=Number((e as {status?:number,statusCode?:number})?.status||(e as {statusCode?:number})?.statusCode||0);
   if(status===404||status===410)await admin.from("teplo_push_subscriptions").delete().eq("endpoint",sub.endpoint);
   console.warn("Push delivery failed",status||"unavailable");
  }
 }));
 return {sent,attempted:subs.length};
}
async function handleEvent(evt:{type?:string,id?:string}){
 if(typeof evt.id!=="string"||!/^[a-f0-9-]{36}$/i.test(evt.id))return answer({error:"Invalid job id"},400);
 const type=evt.type;
 if(type==="bootstrap"){
  const {publicKey}=await vapid();
  return answer({configured:true,vapidPublicKeyLength:publicKey.length});
 }
 let recipients:string[]=[];
 let payload={title:"TEPLO · Новый заказ",body:"Открой рабочий кабинет",url:"/teplo-app/pilot-dispatch.html?v=49",tag:"teplo-order-"+evt.id};
 if(type==="delivery_delay"){
  const reasons:Record<string,string>={no_courier:"Нет свободных курьеров на смене",unclaimed:"Заказ не принимают более 5 минут",unconfirmed:"Назначение не подтверждено",pickup:"Нужно проверить забор заказа",delivery:"Нужно проверить завершение доставки",slot:"Временной слот закончился",closed_slot:"Слот закрыт для принятия"};
  const reason=(evt as {reason?:string}).reason||"";
  if(!reasons[reason])return answer({error:"Invalid delay reason"},400);
  const {data:job}=await admin.from("teplo_pilot_jobs").select("id,is_test,status").eq("id",evt.id).single();
  if(!job?.is_test||!["new","assigned","accepted","picked_up"].includes(job.status))return answer({ignored:true,sent:0,attempted:0});
  const expected:Record<string,string>={no_courier:"new",unclaimed:"new",closed_slot:"new",unconfirmed:"assigned",pickup:"accepted",delivery:"picked_up"};
  if(expected[reason]&&job.status!==expected[reason])return answer({ignored:true,sent:0,attempted:0});
  const {data:staff,error}=await admin.from("profiles").select("id").in("role",["admin","dispatcher"]);
  if(error)throw error;
  return answer(await sendTo((staff||[]).map(p=>p.id),{
   title:"TEPLO · Требует внимания",body:reasons[reason]+" · №"+evt.id.slice(0,8).toUpperCase(),
   url:"/teplo-app/pilot-dispatch.html?v=59&tab=calls&job="+evt.id,tag:"teplo-delay-"+evt.id+"-"+job.status
  }));
 }
 if(type==="buyer_order"){
  const {data:order}=await admin.from("orders").select("id,is_test").eq("id",evt.id).single();
  if(!order?.is_test)return answer({ignored:true});
  const {data:people}=await admin.from("profiles").select("id").in("role",["admin","dispatcher"]);
  recipients=(people||[]).map(p=>p.id);
  payload={...payload,title:"TEPLO · Заказ покупателя",body:"Поступил новый заказ. Требуется обработка.",url:"/teplo-app/pilot-dispatch.html?v=49&tab=buyers&order="+evt.id};
 }else if(["courier_call","courier_pool","courier_assigned"].includes(type||"")){
  const {data:job}=await admin.from("teplo_pilot_jobs").select("id,is_test,status,courier_id,slot_id,source_order_id").eq("id",evt.id).single();
  if(!job?.is_test)return answer({ignored:true});
  if(type==="courier_assigned"){
   if(!job.courier_id)return answer({ignored:true});
   recipients=[job.courier_id];
   payload={...payload,title:"TEPLO · Тебе назначен заказ",body:"Новая доставка в твоём кабинете.",url:"/teplo-app/pilot-courier.html?v=49"};
  }else{
   const {data:shifts}=await admin.from("courier_shifts").select("courier_id").is("ended_at",null);
   const onShift=(shifts||[]).map(x=>x.courier_id);
   if(type==="courier_call"){
    const {data:staff}=await admin.from("profiles").select("id").in("role",["admin","dispatcher"]);
    const dispatcherResult=await sendTo((staff||[]).map(p=>p.id),{
     ...payload,title:"TEPLO · Вызов курьера",body:"Ресторан создал заявку. Требуется диспетчер.",
     url:"/teplo-app/pilot-dispatch.html?v=49&tab=calls&job="+evt.id
    });
    const courierResult=await sendTo(onShift,{
     ...payload,title:"TEPLO · Свободный заказ",body:"Доступна доставка из заведения.",
     url:"/teplo-app/pilot-courier.html?v=49"
    });
    return answer({sent:dispatcherResult.sent+courierResult.sent,attempted:dispatcherResult.attempted+courierResult.attempted});
   }
   recipients=onShift;
   payload={...payload,title:"TEPLO · Свободная доставка",body:"Доступен заказ в общей очереди.",
    url:"/teplo-app/pilot-courier.html?v=49"};
  }
 }else return answer({ignored:true});
 return answer(await sendTo(recipients,payload));
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors,status:204});
 try{
  if(req.headers.get("Origin")&&req.headers.get("Origin")!==origin)return answer({error:"Origin not allowed"},403);
  const u=new URL(req.url);
  if(u.pathname.endsWith("/event")&&req.method==="POST"){
   const key=req.headers.get("x-teplo-webhook")||"";
   const cfg=await config();
   if(!cfg.webhookKey||!key||key.length!==cfg.webhookKey.length||key!==cfg.webhookKey)return answer({error:"Unauthorized"},401);
   return await handleEvent(await req.json());
  }
  const staff=await signedInStaff(req);
  if(!staff)return answer({error:"Staff sign-in required"},401);
  if(u.pathname.endsWith("/config")&&req.method==="GET"){
   const keys=await vapid();
   return answer({publicKey:keys.publicKey});
  }
  if(u.pathname.endsWith("/test")&&req.method==="POST"){
   return answer(await sendTo([staff.id],{title:"TEPLO · Push работает",body:"Тестовое уведомление на твоём устройстве.",url:"/teplo-app/pilot-dispatch.html?v=49",tag:"teplo-push-test"}));
  }
  return answer({error:"Unknown endpoint"},404);
 }catch(e){console.error("TEPLO push function error",String(e));return answer({error:"Push service temporarily unavailable"},500)}
});
