CREATE OR REPLACE FUNCTION teplo_private.create_confirmed_delivery(p_order_id uuid, p_slot_id uuid, p_actor uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=p_actor;
 v_order public.orders%rowtype;v_slot public.teplo_pilot_slots%rowtype;
 v_primary public.teplo_order_venue_tasks%rowtype;v_price public.teplo_pilot_pricing%rowtype;
 v_stops integer;v_job uuid;v_summary text;
 v_latest_ready timestamptz;v_ready_minutes integer;
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Тестовая передача курьерам отключена';end if;
 -- All manual and automatic paths take order, then slot locks.
 select * into v_order from public.orders where id=p_order_id and is_test for update;
 if not found or coalesce(v_order.demo_status,'pending') in ('delivered','cancelled') then raise exception 'Тестовый заказ недоступен';end if;
 select id into v_job from public.teplo_pilot_jobs where source_order_id=p_order_id;
 if found then return v_job;end if;
 select * into v_slot from public.teplo_pilot_slots where id=p_slot_id for update;
 if not found or not v_slot.is_open or v_slot.slot_end<=now()
 then raise exception 'Выбери доступный слот';end if;
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
  v_primary.shop_address_snapshot,coalesce(v_user,v_order.customer_id),
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
$function$;

revoke all on function teplo_private.create_confirmed_delivery(uuid,uuid,uuid) from public,anon,authenticated;
create or replace function public.teplo_dispatch_send_to_couriers(p_order_id uuid,p_slot_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 if uid is null or not public.has_role(array['admin','dispatcher']) or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
 then raise exception 'Доставка доступна только диспетчеру';end if;
 return teplo_private.create_confirmed_delivery(p_order_id,p_slot_id,uid);
end;$$;
create table public.teplo_auto_dispatch_state(
 order_id uuid primary key references public.orders(id),
 state text not null check(state in ('waiting','sent','stopped','error')),
 reason text not null,
 job_id uuid references public.teplo_pilot_jobs(id),
 checked_at timestamptz not null default now()
);
alter table public.teplo_auto_dispatch_state enable row level security;
revoke all on public.teplo_auto_dispatch_state from public,anon,authenticated;
grant select on public.teplo_auto_dispatch_state to authenticated;
create policy auto_dispatch_staff_read on public.teplo_auto_dispatch_state for select to authenticated using(public.has_role(array['admin','dispatcher']));
create function teplo_private.try_auto_dispatch(p_order_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; slot record; job uuid; latest_ready timestamptz; reason text;
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled) then return null;end if;
 select * into o from public.orders where id=p_order_id and is_test for update;
 if not found then return null;end if;
 select id into job from public.teplo_pilot_jobs where source_order_id=p_order_id;
 if found then
  insert into public.teplo_auto_dispatch_state(order_id,state,reason,job_id) values(p_order_id,'sent','Передан курьерам',job)
  on conflict(order_id) do update set state='sent',reason=excluded.reason,job_id=excluded.job_id,checked_at=now();return job;
 end if;
 if coalesce(o.demo_status,'pending') in ('delivered','cancelled') then
  update public.teplo_auto_dispatch_state set state='stopped',reason='Заказ завершён или отменён',checked_at=now() where order_id=p_order_id;return null;
 end if;
 if not exists(select 1 from public.teplo_order_venue_tasks where order_id=p_order_id) or exists(select 1 from public.teplo_order_venue_tasks where order_id=p_order_id and (state<>'confirmed' or ready_at is null)) then
  -- Do not enqueue unconfirmed historical orders. Existing queue entries are paused.
  update public.teplo_auto_dispatch_state set state='waiting',reason='Ожидаем подтверждения всех заведений',checked_at=now() where order_id=p_order_id;return null;
 end if;
 select max(ready_at) into latest_ready from public.teplo_order_venue_tasks where order_id=p_order_id;
 job:=null;
 begin
  -- Skip slots currently reserved by another transaction, retry on the next tick.
  for slot in select s.id from public.teplo_pilot_slots s
   where s.is_open and s.slot_end>greatest(now(),latest_ready)+interval '15 minutes'
    and s.slot_start<=now()+interval '4 hours'
   order by s.slot_start,s.id for update skip locked
  loop
   if (select count(*) from public.teplo_pilot_jobs where slot_id=slot.id and status<>'cancelled') <
      (select capacity from public.teplo_pilot_slots where id=slot.id) then
    job:=teplo_private.create_confirmed_delivery(p_order_id,slot.id,null);exit;
   end if;
  end loop;
  reason:=case when job is null then 'Нет свободного подходящего слота в ближайшие 4 часа. Повторяем подбор каждую минуту' else 'Автоматически передан курьерам' end;
  insert into public.teplo_auto_dispatch_state(order_id,state,reason,job_id)
  values(p_order_id,case when job is null then 'waiting' else 'sent' end,reason,job)
  on conflict(order_id) do update set state=excluded.state,reason=excluded.reason,job_id=excluded.job_id,checked_at=now();
 exception when others then
  insert into public.teplo_auto_dispatch_state(order_id,state,reason) values(p_order_id,'error','Автопередача не выполнена. Нужна проверка диспетчера')
  on conflict(order_id) do update set state='error',reason=excluded.reason,checked_at=now();
  raise warning 'TEPLO auto handoff failed: %',sqlerrm;
 end;
 return job;
end;$$;
revoke all on function teplo_private.try_auto_dispatch(uuid) from public,anon,authenticated;
create function teplo_private.venue_confirmation_auto_dispatch() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state is not distinct from old.state and new.ready_at is not distinct from old.ready_at then return new;end if;
 perform teplo_private.try_auto_dispatch(new.order_id);return new;
end;$$;
revoke all on function teplo_private.venue_confirmation_auto_dispatch() from public,anon,authenticated;
create constraint trigger teplo_auto_handoff_after_confirmation after update on public.teplo_order_venue_tasks
deferrable initially deferred for each row execute function teplo_private.venue_confirmation_auto_dispatch();
create function teplo_private.retry_auto_dispatch() returns integer
language plpgsql security definer set search_path='' as $$
declare pending record; processed integer:=0;
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled) then return 0;end if;
 if not pg_try_advisory_xact_lock(18214836) then return 0;end if;
 for pending in select order_id from public.teplo_auto_dispatch_state where state in ('waiting','error') order by checked_at limit 20
 loop
  perform teplo_private.try_auto_dispatch(pending.order_id);processed:=processed+1;
 end loop;return processed;
end;$$;
revoke all on function teplo_private.retry_auto_dispatch() from public,anon,authenticated;
select cron.schedule('teplo-demo-auto-handoff','* * * * *','select teplo_private.retry_auto_dispatch();');
