/* Read-only, local fixtures. No authentication, network or persistent writes. */
export function previewDatabase(){
 const now=Date.now(),at=minutes=>new Date(now+minutes*60000).toISOString();
 const profile={id:'preview-dispatcher',role:'admin',full_name:'Диспетчер TEPLO'};
 const roster=[{id:'preview-anton',full_name:'Антон · тест',on_shift:true,active_jobs:0},{id:'preview-maria',full_name:'Мария · тест',on_shift:true,active_jobs:2},{id:'preview-oleg',full_name:'Олег · тест',on_shift:false,active_jobs:0}];
 const slots=[{id:'preview-slot',slot_start:at(-5),slot_end:at(85),capacity:4,booked:3,is_open:true},{id:'preview-next',slot_start:at(85),slot_end:at(175),capacity:4,booked:0,is_open:true}];
 const base={slot_id:slots[0].id,source_order_id:null,shop_name_snapshot:'TEPLO TEST',shop_address_snapshot:'Теплодар, тестовая точка №1',order_summary:'Тестовая пицца × 1 · Тестовый напиток × 1',ready_in_minutes:20,customer_name:'Тестовый получатель',customer_phone:'0000000000',delivery_address:'Теплодар, Тестовая улица, 24',status:'new',courier_id:null,created_at:at(-2),updated_at:at(-2),assigned_at:null,accepted_at:null,picked_up_at:null,ready_at:at(12),delivery_fee_uah:65,courier_reward_uah:55,delivery_zone:'local',delivery_minutes:20,delivery_due_at:null,delivered_at:null};
 const jobs=[{...base,id:'d6900001-0000-4000-8000-000000000001',shop_name_snapshot:'Два тестовых заведения'},
 {...base,id:'d6900002-0000-4000-8000-000000000002',status:'picked_up',courier_id:'preview-maria',delivery_address:'Дачи, Тестовая улица, 8',delivery_zone:'dachi',delivery_minutes:30,picked_up_at:at(-34),delivery_due_at:at(-4),created_at:at(-50),updated_at:at(-34)},
 {...base,id:'d6900003-0000-4000-8000-000000000003',status:'accepted',courier_id:'preview-maria',accepted_at:at(-5),delivery_address:'Широкая Балка, Тестовая улица, 12',delivery_zone:'nearby',delivery_minutes:40},
 {...base,id:'d6900004-0000-4000-8000-000000000004',status:'delivered',courier_id:'preview-anton',picked_up_at:at(-70),delivery_due_at:at(-50),delivered_at:at(-56),created_at:at(-90)}];
 const notes=[{id:'1',job_id:jobs[1].id,kind:'issue',note:'Получатель не отвечает. Нужна помощь диспетчера.',created_at:at(-3)}];
 const stops=[{job_id:jobs[0].id,stop_number:1,shop_name_snapshot:'TEPLO TEST',shop_address_snapshot:'Теплодар, тестовая точка №1',ready_at:at(8)},{job_id:jobs[0].id,stop_number:2,shop_name_snapshot:'TEPLO TEST 2',shop_address_snapshot:'Теплодар, тестовая точка №2',ready_at:at(12)}];
 const order={id:'b6900001-0000-4000-8000-000000000001',customer_name:'Тестовый покупатель',customer_phone:'0000000000',delivery_address:'Теплодар, Тестовая улица, 12',subtotal:200,delivery_fee:65,total:265,created_at:at(-3),is_test:true,order_items:[{shop_id:'preview-venue',product_name_snapshot:'Тестовая пицца',quantity:1,line_total:200}]};
 const tables={profiles:[profile,...roster.map(r=>({...r,role:'courier'}))],teplo_pilot_jobs:jobs,teplo_dispatch_notes:notes,teplo_pilot_job_stops:stops,orders:[order],teplo_order_venue_tasks:[{order_id:order.id,shop_id:'preview-venue',shop_name_snapshot:'TEPLO TEST',shop_address_snapshot:base.shop_address_snapshot,state:'ordered',operator_note:'Тестовое подтверждение заведения',ready_at:null}],teplo_auto_dispatch_state:[],teplo_pilot_job_events:[{id:'1',job_id:jobs[0].id,event:'created',actor_id:profile.id,created_at:base.created_at}]};
 class Query{
  constructor(table){this.rows=[...(tables[table]||[])];this.head=false;}
  select(columns,options={}){this.head=options.head===true;return this;}
  eq(key,value){this.rows=this.rows.filter(row=>row[key]===value);return this;}
  in(key,values){this.rows=this.rows.filter(row=>values.includes(row[key]));return this;}
  not(key,operator,value){this.rows=this.rows.filter(row=>row[key]!==value);return this;}
  order(key,options={}){this.rows.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''))*(options.ascending===false?-1:1));return this;}
  range(start,end){this.rows=this.rows.slice(start,end+1);return this;}
  limit(n){this.rows=this.rows.slice(0,n);return this;}
  single(){this.one=true;return this;}
  then(resolve,reject){return Promise.resolve({data:this.head?null:this.one?this.rows[0]:this.rows,count:this.rows.length,error:null}).then(resolve,reject);}
 }
 const user={id:profile.id,email_confirmed_at:at(-200)};
 return {from:table=>new Query(table),auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async name=>{
  if(name==='teplo_dispatch_courier_roster')return {data:roster};
  if(name==='teplo_pilot_list_slots')return {data:slots};
  if(name==='teplo_delivery_timing')return {data:{server_now:new Date().toISOString(),jobs:[]}};
  return {error:new Error('Предпросмотр: изменения отключены. В рабочем кабинете действие доступно по роли.')};
 }};
}
