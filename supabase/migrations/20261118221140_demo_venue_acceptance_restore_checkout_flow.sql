-- Explicit simulation for two seeded demo venues; never automatic acceptance for real venues.
create table teplo_private.demo_venue_acceptance(
 shop_id uuid primary key references public.shops(id),
 ready_minutes integer not null default 10 check(ready_minutes between 0 and 180)
);
alter table teplo_private.demo_venue_acceptance enable row level security;
revoke all on teplo_private.demo_venue_acceptance from public,anon,authenticated;
insert into teplo_private.demo_venue_acceptance(shop_id)
select id from public.shops where name in ('TEPLO TEST','TEPLO TEST 2') and is_active;
create function teplo_private.simulate_demo_venue_acceptance() returns trigger
language plpgsql security definer set search_path='' as $$
declare minutes integer;
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled) then return new;end if;
 if not exists(select 1 from public.orders where id=new.order_id and is_test) then return new;end if;
 select ready_minutes into minutes from teplo_private.demo_venue_acceptance where shop_id=new.shop_id;
 if found and new.state='pending' then
  new.state:='confirmed';new.ready_at:=now()+minutes*interval '1 minute';
  new.operator_note:='СИМУЛЯЦИЯ: тестовое заведение подтвердило заказ автоматически';
  insert into public.order_events(order_id,actor_id,old_status,new_status,note)
  values(new.order_id,null,'pending','confirmed','СИМУЛЯЦИЯ: подтверждение тестового заведения '||new.shop_name_snapshot);
 end if;return new;
end;$$;
revoke all on function teplo_private.simulate_demo_venue_acceptance() from public,anon,authenticated;
create trigger teplo_simulated_venue_acceptance before insert on public.teplo_order_venue_tasks
for each row execute function teplo_private.simulate_demo_venue_acceptance();
create function teplo_private.ensure_demo_test_slot(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled) then return;end if;
 if not exists(select 1 from public.orders where id=p_order_id and is_test) then return;end if;
 if not exists(select 1 from public.teplo_order_venue_tasks where order_id=p_order_id) or exists(
  select 1 from public.teplo_order_venue_tasks t where order_id=p_order_id and not exists(
   select 1 from teplo_private.demo_venue_acceptance d where d.shop_id=t.shop_id)) then return;end if;
 -- At most one standard fixture slot per hour. Do not bypass a full/closed existing slot.
 if not exists(select 1 from public.teplo_pilot_slots where is_open
  and slot_start<=now()+interval '4 hours' and slot_end>now()+interval '25 minutes') then
  insert into public.teplo_pilot_slots(slot_start,slot_end,capacity,is_open)
  values(date_trunc('hour',now()),date_trunc('hour',now())+interval '2 hours',4,true)
  on conflict do nothing;
 end if;
end;$$;
revoke all on function teplo_private.ensure_demo_test_slot(uuid) from public,anon,authenticated;
create function teplo_private.finish_demo_checkout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform teplo_private.ensure_demo_test_slot(new.order_id);
 perform teplo_private.try_auto_dispatch(new.order_id);
 return new;
end;$$;
revoke all on function teplo_private.finish_demo_checkout() from public,anon,authenticated;
create constraint trigger teplo_auto_handoff_after_task_insert after insert on public.teplo_order_venue_tasks
 deferrable initially deferred for each row execute function teplo_private.finish_demo_checkout();
