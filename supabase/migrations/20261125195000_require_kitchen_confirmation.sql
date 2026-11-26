-- Normal customer tests must exercise a real operator/venue acknowledgement.
-- Explicit simulation remains available only to privileged rollback fixtures.
alter table teplo_private.demo_venue_acceptance
 add column auto_confirm_enabled boolean not null default false;
comment on column teplo_private.demo_venue_acceptance.auto_confirm_enabled is
 'Off for application orders. Enable only inside isolated technical test transactions, then roll back.';

create or replace function teplo_private.simulate_demo_venue_acceptance() returns trigger
language plpgsql security definer set search_path='' as $$
declare minutes integer;
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled) then return new;end if;
 if not exists(select 1 from public.orders where id=new.order_id and is_test) then return new;end if;
 select ready_minutes into minutes from teplo_private.demo_venue_acceptance
 where shop_id=new.shop_id and auto_confirm_enabled;
 if found and new.state='pending' then
  new.state:='confirmed';new.ready_at:=now()+minutes*interval '1 minute';
  new.operator_note:='СИМУЛЯЦИЯ: тестовое заведение подтвердило заказ автоматически';
  insert into public.order_events(order_id,actor_id,old_status,new_status,note)
  values(new.order_id,null,'pending','confirmed','СИМУЛЯЦИЯ: подтверждение тестового заведения '||new.shop_name_snapshot);
 end if;return new;
end;$$;
revoke all on function teplo_private.simulate_demo_venue_acceptance() from public,anon,authenticated;

create function teplo_private.has_preparation_confirmation(p_order_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.orders where id=p_order_id and is_test)
 and (select count(*) from public.teplo_order_venue_tasks where order_id=p_order_id) between 1 and 5
 and not exists(
  select 1 from public.teplo_order_venue_tasks t where t.order_id=p_order_id
  and (t.state<>'confirmed' or t.ready_at is null or
   (t.updated_by is null and not exists(
    select 1 from teplo_private.demo_venue_acceptance d
    where d.shop_id=t.shop_id and d.auto_confirm_enabled)))
 );
$$;
revoke all on function teplo_private.has_preparation_confirmation(uuid) from public,anon,authenticated;

create function teplo_private.guard_preparation_confirmation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Venue-originated pilot jobs already require a verified venue/admin sender.
 -- For customer checkout, guard handoff AND every way to assign/accept/pick up.
 if new.source_order_id is not null and new.status in ('new','assigned','accepted','picked_up')
 and not teplo_private.has_preparation_confirmation(new.source_order_id) then
  raise exception 'Сначала диспетчер или заведение должны подтвердить заказ и время приготовления';
 end if;
 return new;
end;$$;
revoke all on function teplo_private.guard_preparation_confirmation() from public,anon,authenticated;
create trigger teplo_require_preparation_confirmation
 before insert or update of status,source_order_id on public.teplo_pilot_jobs
 for each row execute function teplo_private.guard_preparation_confirmation();

-- One explicit phone acknowledgement; preserves the original readiness on retry.
-- Included here as well as in the earlier operations migration for clean installs.
create or replace function public.teplo_dispatch_phone_confirm(
 p_order_id uuid,p_shop_id uuid,p_ready_minutes integer,p_note text default ''
) returns timestamptz language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); task public.teplo_order_venue_tasks%rowtype;
begin
 if uid is null or not public.has_role(array['admin','dispatcher']) or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
 then raise exception 'Доступ только подтверждённому диспетчеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Доступно только в тестовом режиме';end if;
 if p_ready_minutes is null or p_ready_minutes not between 0 and 180 or char_length(coalesce(p_note,''))>400 then raise exception 'Проверь готовность и комментарий';end if;
 perform 1 from public.orders where id=p_order_id and is_test and demo_status not in ('delivered','cancelled') for update;
 if not found then raise exception 'Активный тестовый заказ не найден';end if;
 select * into task from public.teplo_order_venue_tasks where order_id=p_order_id and shop_id=p_shop_id for update;
 if not found then raise exception 'Заведение не входит в заказ';end if;
 if task.state='confirmed' then return task.ready_at;end if;
 if task.state in ('pending','issue') then
  perform public.teplo_dispatch_update_venue(p_order_id,p_shop_id,'ordered',p_note);
 end if;
 return public.teplo_dispatch_confirm_venue(p_order_id,p_shop_id,p_ready_minutes,p_note);
end;$$;
revoke all on function public.teplo_dispatch_phone_confirm(uuid,uuid,integer,text) from public,anon;
grant execute on function public.teplo_dispatch_phone_confirm(uuid,uuid,integer,text) to authenticated;
