-- Snapshot of applied Supabase readiness migration 20261117154435.
-- Saved after server application to keep version control in sync.
alter table public.teplo_order_venue_tasks add column if not exists ready_at timestamptz;
alter table public.teplo_pilot_job_stops add column if not exists ready_at timestamptz;
alter table public.teplo_pilot_jobs add column if not exists ready_at timestamptz;
update public.teplo_pilot_jobs set ready_at=created_at+ready_in_minutes*interval '1 minute'
where ready_at is null and ready_in_minutes is not null;
CREATE OR REPLACE FUNCTION public.teplo_dispatch_confirm_venue(p_order_id uuid, p_shop_id uuid, p_ready_minutes integer, p_note text DEFAULT ''::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_task public.teplo_order_venue_tasks%rowtype;v_eta timestamptz;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
 or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Доступ только диспетчеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)then raise exception 'Тестовый режим отключён';end if;
 if p_ready_minutes is null or p_ready_minutes not between 0 and 180
 then raise exception 'Время готовности должно быть от 0 до 180 минут';end if;
 if char_length(coalesce(p_note,''))>400 then raise exception 'Комментарий слишком длинный';end if;
 perform 1 from public.orders where id=p_order_id and is_test for update;
 if not found then raise exception 'Заказ не найден';end if;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=p_order_id)
 then raise exception 'Заказ уже передан курьеру';end if;
 select * into v_task from public.teplo_order_venue_tasks
 where order_id=p_order_id and shop_id=p_shop_id for update;
 if not found or v_task.state<>'ordered'
 then raise exception 'Сначала размести заказ в заведении';end if;
 v_eta:=now()+p_ready_minutes*interval '1 minute';
 update public.teplo_order_venue_tasks
 set state='confirmed',ready_at=v_eta,operator_note=btrim(coalesce(p_note,'')),updated_at=now(),updated_by=v_user
 where order_id=p_order_id and shop_id=p_shop_id;
 if not exists(select 1 from public.teplo_order_venue_tasks where order_id=p_order_id and state<>'confirmed')
 then update public.orders set demo_status='confirmed',updated_at=now() where id=p_order_id;end if;
 insert into public.order_events(order_id,actor_id,old_status,new_status,note)
 values(p_order_id,v_user,'ordered','confirmed','Оператор: '||v_task.shop_name_snapshot||'; готовность через '||p_ready_minutes||' мин');
 return v_eta;
end;$function$
;

CREATE OR REPLACE FUNCTION public.teplo_dispatch_send_to_couriers(p_order_id uuid, p_slot_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());
 v_order public.orders%rowtype;v_slot public.teplo_pilot_slots%rowtype;
 v_primary public.teplo_order_venue_tasks%rowtype;v_price public.teplo_pilot_pricing%rowtype;
 v_stops integer;v_job uuid;v_summary text;
 v_latest_ready timestamptz;v_ready_minutes integer;
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
 if exists(select 1 from public.teplo_order_venue_tasks t where t.order_id=p_order_id and t.ready_at is null) then raise exception 'Укажи готовность каждого заведения до передачи курьеру';end if;
 select max(t.ready_at) into v_latest_ready from public.teplo_order_venue_tasks t where t.order_id=p_order_id;
 if v_latest_ready>v_slot.slot_end then raise exception 'Выбранный слот заканчивается раньше готовности заказа. Выбери более позднее время';end if;
 v_ready_minutes:=greatest(0,ceil(extract(epoch from(v_latest_ready-now()))/60))::integer;
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
  ready_in_minutes,request_id,delivery_fee_uah,courier_reward_uah,slot_id,source_order_id,ready_at)
 values(v_primary.shop_id,
  case when v_stops>1 then 'TEPLO · сборная доставка' else v_primary.shop_name_snapshot end,
  v_primary.shop_address_snapshot,v_user,
  v_order.customer_name,v_order.customer_phone,v_order.delivery_address,
  coalesce(v_summary,'Тестовый заказ покупателя'),v_ready_minutes,p_order_id,
  v_price.delivery_fee_uah,v_price.courier_reward_uah,p_slot_id,p_order_id,v_latest_ready)
 returning id into v_job;
 insert into public.teplo_pilot_job_stops(job_id,stop_number,shop_id,shop_name_snapshot,shop_address_snapshot,ready_at)
 select v_job,row_number() over(order by t.shop_name_snapshot,t.shop_id)::int,
  t.shop_id,t.shop_name_snapshot,t.shop_address_snapshot,t.ready_at
 from public.teplo_order_venue_tasks t where t.order_id=p_order_id;
 update public.orders set demo_status='assigned',updated_at=now() where id=p_order_id;
 insert into public.order_events(order_id,actor_id,old_status,new_status,note)
 values(p_order_id,v_user,'confirmed','assigned',
  'Тестовая доставка с '||v_stops||' точками забора создана в слоте');
 return v_job;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.teplo_dispatch_set_venue_readiness(p_order_id uuid, p_shop_id uuid, p_ready_minutes integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_job public.teplo_pilot_jobs%rowtype;v_eta timestamptz;v_latest timestamptz;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
  or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Доступ только диспетчеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)then raise exception 'Тестовый режим отключён';end if;
 if p_ready_minutes is null or p_ready_minutes not between 0 and 180 then raise exception 'Укажи 0–180 минут';end if;
 perform 1 from public.orders where id=p_order_id and is_test for update;
 if not found then raise exception 'Заказ не найден';end if;
 if not exists(select 1 from public.teplo_order_venue_tasks where order_id=p_order_id and shop_id=p_shop_id and state='confirmed')
 then raise exception 'Сначала подтверди заказ у заведения';end if;
 select * into v_job from public.teplo_pilot_jobs where source_order_id=p_order_id for update;
 if found and v_job.status not in ('new','assigned','accepted')
 then raise exception 'Курьер уже забрал или завершил заказ. Свяжись с ним напрямую';end if;
 v_eta:=now()+p_ready_minutes*interval '1 minute';
 update public.teplo_order_venue_tasks
 set ready_at=v_eta,updated_at=now(),updated_by=v_user
 where order_id=p_order_id and shop_id=p_shop_id;
 if v_job.id is not null then
  update public.teplo_pilot_job_stops set ready_at=v_eta where job_id=v_job.id and shop_id=p_shop_id;
  select max(ready_at) into v_latest from public.teplo_pilot_job_stops where job_id=v_job.id;
  update public.teplo_pilot_jobs
  set ready_at=v_latest,ready_in_minutes=greatest(0,ceil(extract(epoch from(v_latest-now()))/60))::integer,updated_at=now()
  where id=v_job.id;
 end if;
 insert into public.order_events(order_id,actor_id,new_status,note)
 values(p_order_id,v_user,'confirmed','Обновлена готовность заведения: через '||p_ready_minutes||' мин');
 return v_eta;
end;$function$
;

CREATE OR REPLACE FUNCTION public.teplo_pilot_autofill_ready_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.ready_at is null then new.ready_at:=now()+new.ready_in_minutes*interval '1 minute';end if;
 return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.teplo_pilot_open_jobs_eta()
 RETURNS TABLE(id uuid, slot_id uuid, shop_name_snapshot text, shop_address_snapshot text, delivery_address text, order_summary text, ready_in_minutes integer, delivery_fee_uah numeric, courier_reward_uah numeric, slot_start timestamp with time zone, slot_end timestamp with time zone, ready_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());
begin
 if v_user is null or not public.has_role(array['courier','admin'])
   or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Доступ только курьеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 if public.has_role(array['courier']) and not exists(
   select 1 from public.courier_shifts cs where cs.courier_id=v_user and cs.ended_at is null
 ) then
   return;
 end if;
 return query select j.id,j.slot_id,j.shop_name_snapshot,j.shop_address_snapshot,
 j.delivery_address,j.order_summary,greatest(0,ceil(extract(epoch from(coalesce(j.ready_at,j.created_at+j.ready_in_minutes*interval '1 minute')-now()))/60))::integer,j.delivery_fee_uah,j.courier_reward_uah,
 s.slot_start,s.slot_end,coalesce(j.ready_at,j.created_at+j.ready_in_minutes*interval '1 minute')
 from public.teplo_pilot_jobs j join public.teplo_pilot_slots s on s.id=j.slot_id
 where j.is_test and j.status='new' and s.is_open and s.slot_end>now()
 order by s.slot_start,j.created_at limit 120;
end;$function$
;

drop trigger if exists teplo_pilot_job_ready_at_default on public.teplo_pilot_jobs;
create trigger teplo_pilot_job_ready_at_default before insert on public.teplo_pilot_jobs
for each row execute function public.teplo_pilot_autofill_ready_at();
revoke all on function public.teplo_pilot_autofill_ready_at() from public,anon,authenticated;
revoke all on function public.teplo_dispatch_confirm_venue(uuid,uuid,integer,text) from public,anon;
revoke all on function public.teplo_dispatch_set_venue_readiness(uuid,uuid,integer) from public,anon;
revoke all on function public.teplo_pilot_open_jobs_eta() from public,anon;
grant execute on function public.teplo_dispatch_confirm_venue(uuid,uuid,integer,text) to authenticated;
grant execute on function public.teplo_dispatch_set_venue_readiness(uuid,uuid,integer) to authenticated;
grant execute on function public.teplo_pilot_open_jobs_eta() to authenticated;
