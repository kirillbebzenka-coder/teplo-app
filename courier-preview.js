/* Explicit design preview. No auth, backend requests, or persistent writes. */
export function makePreview(stage='accepted'){
 const now=Date.now(),ts=offset=>new Date(now+offset*60000).toISOString();
 const job={id:'d6500001-0000-4000-8000-000000000001',shop_name_snapshot:'Два тестовых заведения',shop_address_snapshot:'Тестовая точка №1, Теплодар',delivery_address:'Теплодар, Тестовая улица, 24',customer_name:'Тестовый получатель',customer_phone:'0000000000',order_summary:'Тестовая пицца × 1 · Тестовый напиток × 1',status:stage==='empty'?'accepted':stage,courier_reward_uah:55,delivery_fee_uah:65,ready_at:ts(8),created_at:ts(-15),assigned_at:ts(-12),accepted_at:ts(-10)};
 const stops=[{shop_name_snapshot:'TEPLO TEST',shop_address_snapshot:'Теплодар, тестовая точка №1',ready_at:ts(5)},{shop_name_snapshot:'TEPLO TEST 2',shop_address_snapshot:'Теплодар, тестовая точка №2',ready_at:ts(8)}];
 const history=[{...job,id:'d6500002-0000-4000-8000-000000000002',status:'delivered',shop_name_snapshot:'TEPLO TEST',delivered_at:ts(-90)},{...job,id:'d6500003-0000-4000-8000-000000000003',status:'delivered',shop_name_snapshot:'TEPLO TEST 2',delivered_at:ts(-150)}];
 const earnings=history.map((j,i)=>({job_id:j.id,amount_uah:i?45:55,recorded_at:j.delivered_at}));
 return {name:'Курьер TEPLO',email:'Тестовый профиль',role:'courier',active:stage==='empty'?[]:[job],history,open:[{...job,id:'d6500004-0000-4000-8000-000000000004',status:'new',shop_name_snapshot:'TEPLO TEST',order_summary:'Тестовый заказ × 1',slot_start:ts(0),slot_end:ts(90)}],stops:new Map([[job.id,stops]]),earnings,shift:true,shiftStarted:ts(-180),moreHistory:false};
}
