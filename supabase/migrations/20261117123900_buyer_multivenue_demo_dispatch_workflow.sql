
-- TEPLO pilot: buyer-order dispatch and separate per-venue confirmations.
-- Only explicitly labeled TEPLO TEST venues are permitted at demo checkout.
-- The existing "Need a courier" flow is unchanged; real delivery stays OFF.

alter table public.order_items
 add column shop_id uuid references public.shops(id);

update public.order_items i set shop_id = coalesce(p.shop_id,o.shop_id)
from public.orders o
left join public.products p on false
where i.order_id=o.id and i.shop_id is null;
-- For historical single-store orders, order.shop_id is the correct snapshot.

create index order_items_shop_snapshot_idx on public.order_items(order_id,shop_id);

create table public.teplo_order_venue_tasks(
 order_id uuid not null references public.orders(id) on delete cascade,
 shop_id uuid not null references public.shops(id),
 shop_name_snapshot text not null,
 shop_address_snapshot text not null default '',
 state text not null default 'pending'
   check (state in ('pending','ordered','confirmed','issue')),
 operator_note text not null default '',
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(order_id,shop_id),
 check (char_length(operator_note)<=400)
);
alter table public.teplo_order_venue_tasks enable row level security;
revoke all on public.teplo_order_venue_tasks from public,anon,authenticated;
grant select on public.teplo_order_venue_tasks to authenticated;
create policy venue_tasks_dispatch_read
 on public.teplo_order_venue_tasks for select to authenticated
 using(public.has_role(array['admin','dispatcher']));
insert into public.teplo_order_venue_tasks(order_id,shop_id,shop_name_snapshot,shop_address_snapshot)
select distinct o.id,s.id,s.name,s.address
from public.orders o join public.order_items i on i.order_id=o.id
join public.shops s on s.id=i.shop_id
where o.is_test=true on conflict(order_id,shop_id) do nothing;

alter table public.teplo_pilot_jobs
 add column source_order_id uuid unique references public.orders(id);

create table public.teplo_pilot_job_stops(
 job_id uuid not null references public.teplo_pilot_jobs(id) on delete cascade,
 stop_number integer not null check (stop_number between 1 and 12),
 shop_id uuid not null references public.shops(id),
 shop_name_snapshot text not null,
 shop_address_snapshot text not null default '',
 primary key(job_id,stop_number),
 unique(job_id,shop_id)
);
alter table public.teplo_pilot_job_stops enable row level security;
revoke all on public.teplo_pilot_job_stops from public,anon,authenticated;
grant select on public.teplo_pilot_job_stops to authenticated;
create policy pilot_stops_participants_read
 on public.teplo_pilot_job_stops for select to authenticated
 using (
   public.has_role(array['admin','dispatcher'])
   or exists(select 1 from public.teplo_pilot_jobs j
     where j.id=job_id and j.courier_id=(select auth.uid())
        and public.has_role(array['courier','admin']))
 );

create or replace function public.place_teplo_demo_combined_cart(
 p_items jsonb,p_customer_name text,p_customer_phone text,
 p_street text,p_house text,p_apartment text,
 p_payment_method text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid:=(select auth.uid());
 v_name text:=btrim(coalesce(p_customer_name,''));
 v_phone text:=btrim(coalesce(p_customer_phone,''));
 v_street text:=btrim(coalesce(p_street,''));
 v_house text:=btrim(coalesce(p_house,''));
 v_flat text:=btrim(coalesce(p_apartment,''));
 v_fee numeric(10,2);
 v_subtotal numeric(10,2);
 v_count integer;v_valid integer;v_shops integer;
 v_primary record;v_order uuid;
begin
 if v_user is null or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Подтверди тестовый аккаунт';end if;
 if p_request_id is null then raise exception 'Отсутствует номер оформления';end if;
 select id into v_order from public.orders
 where demo_request_id=p_request_id and customer_id=v_user and is_test;
 if found then return v_order;end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Демо недоступно при настоящей доставке';end if;
 if (select count(*) from public.orders where customer_id=v_user and is_test and created_at>=now()-interval '24 hours')>=20
 then raise exception 'Не более 20 тестовых заказов за сутки';end if;
 if char_length(v_name) not between 2 and 100 or char_length(v_phone) not between 7 and 22
  or v_phone !~ '^[+0-9() -]+$' or char_length(v_street) not between 3 and 100
  or char_length(v_house) not between 1 and 20 or char_length(v_flat)>20
  or v_name~'[[:cntrl:]]' or v_street~'[[:cntrl:]]' or v_house~'[[:cntrl:]]' or v_flat~'[[:cntrl:]]'
 then raise exception 'Проверь имя, телефон и адрес';end if;
 if p_payment_method not in ('cash_on_delivery','card_on_delivery') or p_payment_method is null
 then raise exception 'Укажи способ оплаты';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30
 then raise exception 'Добавь от 1 до 30 товаров';end if;
 select count(*) into v_count from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int);
 if exists(select 1 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int)
    where x.product_id is null or x.quantity is null or x.quantity not between 1 and 20)
 then raise exception 'Некорректное количество товаров';end if;
 if (select count(distinct x.product_id) from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int))<>v_count
 then raise exception 'Не дублируй товары в корзине';end if;
 select count(*),coalesce(sum(p.price*x.quantity),0),count(distinct p.shop_id)
 into v_valid,v_subtotal,v_shops
 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int)
 join public.products p on p.id=x.product_id and p.is_available
 join public.shops s on s.id=p.shop_id and s.is_active and s.name like 'TEPLO TEST%';
 if v_valid<>v_count or v_shops not between 1 and 5
 then raise exception 'В тесте разрешены только товары магазинов TEPLO TEST (до 5 заведений)';end if;
 select s.id,s.name,s.address into v_primary
 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int)
 join public.products p on p.id=x.product_id
 join public.shops s on s.id=p.shop_id
 order by s.id limit 1;
 select delivery_fee into v_fee from public.delivery_tariffs where id=1;
 if not found or v_fee is null then raise exception 'Тариф демонстрации не задан';end if;
 insert into public.orders(customer_id,shop_id,shop_name_snapshot,shop_address_snapshot,
  customer_name,customer_phone,delivery_address,customer_comment,
  status,subtotal,delivery_fee,total,is_test,payment_method,demo_request_id)
 values(v_user,v_primary.id,
  case when v_shops>1 then 'Сборный заказ TEPLO (тест)' else v_primary.name end,
  v_primary.address,
  v_name,v_phone,'Теплодар, '||v_street||', дом '||v_house||
   case when v_flat<>'' then ', кв. '||v_flat else '' end,
  '[TEPLO TEST] Оператор подтверждает заказ; реальные заказы/оплата отключены.',
  'pending',v_subtotal,v_fee,v_subtotal+v_fee,true,p_payment_method,p_request_id)
 on conflict on constraint orders_demo_request_unique do nothing returning id into v_order;
 if v_order is null then
  select id into v_order from public.orders
  where customer_id=v_user and demo_request_id=p_request_id and is_test;
  if v_order is null then raise exception 'Повторное оформление недоступно';end if;
  return v_order;
 end if;
 insert into public.order_items(order_id,product_id,shop_id,product_name_snapshot,unit_price_snapshot,quantity,line_total)
 select v_order,p.id,p.shop_id,p.name,p.price,x.quantity,p.price*x.quantity
 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int)
 join public.products p on p.id=x.product_id;
 insert into public.teplo_order_venue_tasks(order_id,shop_id,shop_name_snapshot,shop_address_snapshot)
 select distinct v_order,s.id,s.name,s.address
 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity int)
 join public.products p on p.id=x.product_id
 join public.shops s on s.id=p.shop_id;
 insert into public.order_events(order_id,actor_id,new_status,note)
 values(v_order,v_user,'pending','Combined TEPLO demo request; no real calls or charges');
 return v_order;
end;
$function$;

create or replace function public.teplo_dispatch_update_venue(
 p_order_id uuid,p_shop_id uuid,p_action text,p_note text default '')
returns text language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());v_task public.teplo_order_venue_tasks%rowtype;
 v_order public.orders%rowtype;v_next text;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
    or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Только диспетчер может подтверждать заведения';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Демонстрационный режим отключён';end if;
 select * into v_order from public.orders
 where id=p_order_id and is_test for update;
 if not found then raise exception 'Тестовый заказ не найден';end if;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=p_order_id)
 then raise exception 'Доставка уже передана курьерам';end if;
 select * into v_task from public.teplo_order_venue_tasks
 where order_id=p_order_id and shop_id=p_shop_id for update;
 if not found then raise exception 'Заведение не входит в этот заказ';end if;
 if (p_action='ordered' and v_task.state in ('pending','issue')) then v_next:='ordered';
 elsif (p_action='confirmed' and v_task.state='ordered') then v_next:='confirmed';
 elsif (p_action='issue' and v_task.state in ('pending','ordered','confirmed')) then v_next:='issue';
 else raise exception 'Сначала размести заказ; текущий переход недоступен';end if;
 if p_action='issue' and char_length(btrim(coalesce(p_note,'')))<3
 then raise exception 'Укажи причину проблемы';end if;
 if char_length(coalesce(p_note,''))>400 then raise exception 'Комментарий слишком длинный';end if;
 update public.teplo_order_venue_tasks
 set state=v_next,operator_note=btrim(coalesce(p_note,'')),updated_at=now(),updated_by=v_user
 where order_id=p_order_id and shop_id=p_shop_id;
 if not exists(select 1 from public.teplo_order_venue_tasks
     where order_id=p_order_id and state<>'confirmed')
 then update public.orders set demo_status='confirmed',updated_at=now() where id=p_order_id;
 else update public.orders set demo_status='pending',updated_at=now() where id=p_order_id;end if;
 insert into public.order_events(order_id,actor_id,old_status,new_status,note)
 values(p_order_id,v_user,v_task.state,v_next,
  'Оператор / '||v_task.shop_name_snapshot||': '||left(coalesce(p_note,''),160));
 return v_next;
end;
$function$;

create or replace function public.teplo_dispatch_send_to_couriers(
 p_order_id uuid,p_slot_id uuid)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());
 v_order public.orders%rowtype;v_slot public.teplo_pilot_slots%rowtype;
 v_primary public.teplo_order_venue_tasks%rowtype;v_price public.teplo_pilot_pricing%rowtype;
 v_stops integer;v_job uuid;v_summary text;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
    or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Доставка доступна только диспетчеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Тестовая передача курьерам отключена';end if;
 -- Slot lock serializes concurrent reservations; order lock prevents duplicate jobs.
 select * into v_slot from public.teplo_pilot_slots where id=p_slot_id for update;
 if not found or not v_slot.is_open or v_slot.slot_end<=now()
 then raise exception 'Выбери доступный слот';end if;
 select * into v_order from public.orders where id=p_order_id and is_test for update;
 if not found then raise exception 'Тестовый заказ не найден';end if;
 select id into v_job from public.teplo_pilot_jobs where source_order_id=p_order_id;
 if found then return v_job;end if;
 if (select count(*) from public.teplo_pilot_jobs
   where slot_id=p_slot_id and status<>'cancelled')>=v_slot.capacity
 then raise exception 'В выбранном слоте нет свободных мест';end if;
 select count(*) into v_stops from public.teplo_order_venue_tasks where order_id=p_order_id;
 if v_stops<1 or v_stops>5 or exists(select 1 from public.teplo_order_venue_tasks
  where order_id=p_order_id and state<>'confirmed')
 then raise exception 'Сначала получи подтверждение от каждого заведения';end if;
 select * into v_primary from public.teplo_order_venue_tasks
 where order_id=p_order_id order by shop_name_snapshot limit 1;
 select * into v_price from public.teplo_pilot_pricing where id=1;
 if not found then raise exception 'Тестовый тариф не настроен';end if;
 select left(string_agg(t.shop_name_snapshot||': '||i.items,'; ' order by t.shop_name_snapshot),400)
 into v_summary
 from public.teplo_order_venue_tasks t
 join lateral (
  select string_agg(oi.product_name_snapshot||' ×'||oi.quantity,', ' order by oi.product_name_snapshot) items
  from public.order_items oi where oi.order_id=t.order_id and oi.shop_id=t.shop_id
 ) i on true
 where t.order_id=p_order_id;
 insert into public.teplo_pilot_jobs(shop_id,shop_name_snapshot,shop_address_snapshot,
  created_by,customer_name,customer_phone,delivery_address,order_summary,
  ready_in_minutes,request_id,delivery_fee_uah,courier_reward_uah,slot_id,source_order_id)
 values(v_primary.shop_id,
  case when v_stops>1 then 'TEPLO · сборная доставка' else v_primary.shop_name_snapshot end,
  v_primary.shop_address_snapshot,v_user,
  v_order.customer_name,v_order.customer_phone,v_order.delivery_address,
  coalesce(v_summary,'Тестовый заказ покупателя'),0,p_order_id,
  v_price.delivery_fee_uah,v_price.courier_reward_uah,p_slot_id,p_order_id)
 returning id into v_job;
 insert into public.teplo_pilot_job_stops(job_id,stop_number,shop_id,shop_name_snapshot,shop_address_snapshot)
 select v_job,row_number() over(order by t.shop_name_snapshot,t.shop_id)::int,
  t.shop_id,t.shop_name_snapshot,t.shop_address_snapshot
 from public.teplo_order_venue_tasks t where t.order_id=p_order_id;
 update public.orders set demo_status='assigned',updated_at=now() where id=p_order_id;
 insert into public.order_events(order_id,actor_id,old_status,new_status,note)
 values(p_order_id,v_user,'confirmed','assigned',
  'Тестовая доставка с '||v_stops||' точками забора создана в слоте');
 return v_job;
end;
$function$;
revoke execute on function public.place_teplo_demo_combined_cart(jsonb,text,text,text,text,text,text,uuid) from public,anon;
revoke execute on function public.teplo_dispatch_update_venue(uuid,uuid,text,text) from public,anon;
revoke execute on function public.teplo_dispatch_send_to_couriers(uuid,uuid) from public,anon;
grant execute on function public.place_teplo_demo_combined_cart(jsonb,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.teplo_dispatch_update_venue(uuid,uuid,text,text) to authenticated;
grant execute on function public.teplo_dispatch_send_to_couriers(uuid,uuid) to authenticated;
