
-- TEPLO PILOT: Rolling Kyiv 90-minute delivery slots and safely claimed queue.
create table public.teplo_pilot_slots(
 id uuid primary key default gen_random_uuid(),
 slot_start timestamptz not null unique,
 slot_end timestamptz not null,
 capacity int not null default 4 check (capacity between 1 and 30),
 is_open bool not null default true,
 created_at timestamptz not null default now(),
 check(slot_end>slot_start and slot_end<=slot_start+interval '4 hours')
);
alter table public.teplo_pilot_slots enable row level security;
revoke all on public.teplo_pilot_slots from public,anon,authenticated;
grant select on public.teplo_pilot_slots to authenticated;
create policy pilot_slots_staff_read on public.teplo_pilot_slots for select to authenticated
 using(public.has_role(array['admin','dispatcher','venue','courier']));
alter table public.teplo_pilot_jobs add column slot_id uuid references public.teplo_pilot_slots(id);
create index pilot_jobs_slot_status_idx on public.teplo_pilot_jobs(slot_id,status);
alter table public.teplo_pilot_job_events drop constraint teplo_pilot_job_events_event_check;
alter table public.teplo_pilot_job_events add constraint teplo_pilot_job_events_event_check
 check (event in ('created','assigned','accepted','declined','picked_up','delivered','cancelled','released','slot_changed'));

create or replace function public.teplo_pilot_list_slots()
returns table(id uuid,slot_start timestamptz,slot_end timestamptz,capacity integer,is_open boolean,booked integer)
language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());
begin
 if v_user is null or not public.has_role(array['admin','dispatcher','venue','courier'])
   or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Доступ только сотрудникам TEPLO';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён при реальной доставке';end if;
 insert into public.teplo_pilot_slots(slot_start,slot_end,capacity)
 select (((now() at time zone 'Europe/Kyiv')::date+d.day_no+time '10:00'
       +i.slot_no*interval '90 minutes') at time zone 'Europe/Kyiv'),
        (((now() at time zone 'Europe/Kyiv')::date+d.day_no+time '10:00'
       +(i.slot_no+1)*interval '90 minutes') at time zone 'Europe/Kyiv'),4
 from generate_series(0,6) as d(day_no)
 cross join generate_series(0,6) as i(slot_no)
 on conflict(slot_start) do nothing;
 return query select s.id,s.slot_start,s.slot_end,s.capacity,s.is_open,
   (select count(*)::integer from public.teplo_pilot_jobs j
    where j.slot_id=s.id and j.status<>'cancelled')
 from public.teplo_pilot_slots s
 where s.slot_end>now() and s.slot_start<now()+interval '8 days'
 order by s.slot_start;
end;$function$;

-- Public board deliberately excludes customer name, phone and customer user_id.
create or replace function public.teplo_pilot_open_jobs()
returns table(id uuid,slot_id uuid,shop_name_snapshot text,shop_address_snapshot text,
 delivery_address text,order_summary text,ready_in_minutes integer,
 delivery_fee_uah numeric,courier_reward_uah numeric,slot_start timestamptz,slot_end timestamptz)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());
begin
 if v_user is null or not public.has_role(array['courier','admin'])
   or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Доступ только курьеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 return query select j.id,j.slot_id,j.shop_name_snapshot,j.shop_address_snapshot,
 j.delivery_address,j.order_summary,j.ready_in_minutes,j.delivery_fee_uah,j.courier_reward_uah,
 s.slot_start,s.slot_end
 from public.teplo_pilot_jobs j join public.teplo_pilot_slots s on s.id=j.slot_id
 where j.is_test and j.status='new' and s.is_open and s.slot_end>now()
 order by s.slot_start,j.created_at limit 120;
end;$function$;

create or replace function public.teplo_pilot_claim_job(p_job_id uuid)
returns text language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());v_role text;v_job public.teplo_pilot_jobs%rowtype;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Подтверди аккаунт';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 -- Share courier profile lock with dispatcher assignment RPC for two-job concurrency.
 select role into v_role from public.profiles where id=v_user for update;
 if v_role not in ('courier','admin') or v_role is null
 then raise exception 'Доступ только курьеру';end if;
 if v_role='courier' and not exists(select 1 from public.courier_shifts
   where courier_id=v_user and ended_at is null)
 then raise exception 'Сначала открой смену';end if;
 if (select count(*) from public.teplo_pilot_jobs
   where courier_id=v_user and status in ('assigned','accepted','picked_up'))>=2
 then raise exception 'У тебя уже 2 активных заказа';end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found or v_job.status<>'new' or v_job.slot_id is null
 then raise exception 'Заказ уже взят или недоступен';end if;
 if not exists(select 1 from public.teplo_pilot_slots
   where id=v_job.slot_id and is_open and slot_end>now())
 then raise exception 'Слот закрыт или завершился';end if;
 update public.teplo_pilot_jobs set status='accepted',courier_id=v_user,assigned_by=null,
 assigned_at=now(),accepted_at=now(),updated_at=now() where id=v_job.id;
 insert into public.teplo_pilot_job_events(job_id,actor_id,event)
 values(v_job.id,v_user,'assigned'),(v_job.id,v_user,'accepted');
 return 'accepted';
end;$function$;

create or replace function public.teplo_pilot_release_job(p_job_id uuid)
returns text language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());v_job public.teplo_pilot_jobs%rowtype;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
   or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Только диспетчер';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found or v_job.status not in ('assigned','accepted')
 then raise exception 'Вернуть можно лишь незабранный заказ';end if;
 update public.teplo_pilot_jobs set status='new',courier_id=null,assigned_by=null,
 assigned_at=null,accepted_at=null,updated_at=now() where id=v_job.id;
 insert into public.teplo_pilot_job_events(job_id,actor_id,event) values(v_job.id,v_user,'released');
 return 'new';
end;$function$;

create or replace function public.teplo_pilot_manage_slot(p_slot_id uuid,p_capacity integer,p_is_open boolean)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());v_slot public.teplo_pilot_slots%rowtype;v_booked integer;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
   or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Только диспетчер';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 if p_capacity is null or p_capacity not between 1 and 30 or p_is_open is null
 then raise exception 'Вместимость 1–30';end if;
 select * into v_slot from public.teplo_pilot_slots where id=p_slot_id for update;
 if not found or v_slot.slot_end<=now() then raise exception 'Слот уже прошёл';end if;
 select count(*) into v_booked from public.teplo_pilot_jobs
 where slot_id=p_slot_id and status<>'cancelled';
 if p_capacity<v_booked then raise exception 'В слоте уже % заказов',v_booked;end if;
 update public.teplo_pilot_slots set capacity=p_capacity,is_open=p_is_open where id=p_slot_id;
end;$function$;

create or replace function public.teplo_pilot_move_job(p_job_id uuid,p_slot_id uuid)
returns text language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid());v_slot public.teplo_pilot_slots%rowtype;
 v_job public.teplo_pilot_jobs%rowtype;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher'])
   or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Только диспетчер';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 select * into v_slot from public.teplo_pilot_slots where id=p_slot_id for update;
 if not found or not v_slot.is_open or v_slot.slot_end<=now() then raise exception 'Слот закрыт';end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found or v_job.status<>'new' then raise exception 'Переносить можно лишь свободные заказы';end if;
 if v_job.slot_id=p_slot_id then return 'new';end if;
 if (select count(*) from public.teplo_pilot_jobs
   where slot_id=p_slot_id and status<>'cancelled')>=v_slot.capacity
 then raise exception 'Все места в слоте заняты';end if;
 update public.teplo_pilot_jobs set slot_id=p_slot_id,updated_at=now() where id=v_job.id;
 insert into public.teplo_pilot_job_events(job_id,actor_id,event) values(v_job.id,v_user,'slot_changed');
 return 'new';
end;$function$;

revoke execute on function public.teplo_pilot_list_slots() from public,anon;
revoke execute on function public.teplo_pilot_open_jobs() from public,anon;
revoke execute on function public.teplo_pilot_claim_job(uuid) from public,anon;
revoke execute on function public.teplo_pilot_release_job(uuid) from public,anon;
revoke execute on function public.teplo_pilot_manage_slot(uuid,integer,boolean) from public,anon;
revoke execute on function public.teplo_pilot_move_job(uuid,uuid) from public,anon;
grant execute on function public.teplo_pilot_list_slots() to authenticated;
grant execute on function public.teplo_pilot_open_jobs() to authenticated;
grant execute on function public.teplo_pilot_claim_job(uuid) to authenticated;
grant execute on function public.teplo_pilot_release_job(uuid) to authenticated;
grant execute on function public.teplo_pilot_manage_slot(uuid,integer,boolean) to authenticated;
grant execute on function public.teplo_pilot_move_job(uuid,uuid) to authenticated;
