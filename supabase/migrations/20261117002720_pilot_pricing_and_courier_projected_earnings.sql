-- TEPLO pilot money: demo numbers only. No real billing, payouts, or real-delivery activation.
-- Initial illustrative split: 65 UAH for the venue, 50 UAH reward for the courier.
-- Real delivery_tariffs stays untouched/disabled. Historic delivered jobs are NOT back-paid.
create table public.teplo_pilot_pricing (
 id integer primary key default 1 check (id=1),
 delivery_fee_uah numeric(10,2) not null check (delivery_fee_uah between 1 and 5000),
 courier_reward_uah numeric(10,2) not null check (courier_reward_uah between 1 and delivery_fee_uah),
 updated_at timestamptz not null default now()
);
insert into public.teplo_pilot_pricing(id,delivery_fee_uah,courier_reward_uah)
values(1,65.00,50.00) on conflict (id) do nothing;
alter table public.teplo_pilot_pricing enable row level security;
revoke all on table public.teplo_pilot_pricing from public,anon,authenticated;
grant select on table public.teplo_pilot_pricing to authenticated;
create policy pilot_pricing_staff_read on public.teplo_pilot_pricing
 for select to authenticated using(public.has_role(array['admin','dispatcher','venue']));

alter table public.teplo_pilot_jobs
 add column delivery_fee_uah numeric(10,2) not null default 0 check (delivery_fee_uah between 0 and 5000),
 add column courier_reward_uah numeric(10,2) not null default 0 check (courier_reward_uah between 0 and delivery_fee_uah);
-- Give existing *unfinished* test jobs a price; do not invent earnings for old completed jobs.
update public.teplo_pilot_jobs
set delivery_fee_uah=(select delivery_fee_uah from public.teplo_pilot_pricing where id=1),
    courier_reward_uah=(select courier_reward_uah from public.teplo_pilot_pricing where id=1)
where is_test=true and status in ('new','assigned','accepted','picked_up')
  and delivery_fee_uah=0 and courier_reward_uah=0;

create table public.teplo_pilot_earnings (
 job_id uuid primary key references public.teplo_pilot_jobs(id),
 courier_id uuid not null references auth.users(id),
 amount_uah numeric(10,2) not null check (amount_uah >= 0),
 recorded_at timestamptz not null default now(),
 is_test boolean not null default true check (is_test=true)
);
comment on table public.teplo_pilot_earnings is 'TEST ONLY: projected courier rewards, not debts, cash, or real payouts';
alter table public.teplo_pilot_earnings enable row level security;
revoke all on table public.teplo_pilot_earnings from public,anon,authenticated;
grant select on table public.teplo_pilot_earnings to authenticated;
create policy pilot_earnings_personal_or_dispatch on public.teplo_pilot_earnings
 for select to authenticated
 using ((courier_id=(select auth.uid()) and public.has_role(array['courier','admin']))
        or public.has_role(array['admin','dispatcher']));

create or replace function public.teplo_set_pilot_pricing(p_delivery_fee_uah numeric,p_courier_reward_uah numeric)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_uid uuid := (select auth.uid());
begin
 if v_uid is null or not public.has_role(array['admin']) or
   not exists(select 1 from auth.users where id=v_uid and email_confirmed_at is not null) then
   raise exception 'Настройки доступны только подтверждённому администратору';
 end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then
   raise exception 'Настройка пилота недоступна при включённой реальной доставке';
 end if;
 if p_delivery_fee_uah is null or p_courier_reward_uah is null or
    p_delivery_fee_uah < 1 or p_delivery_fee_uah > 5000 or
    p_courier_reward_uah < 1 or p_courier_reward_uah > p_delivery_fee_uah then
   raise exception 'Проверь стоимость и вознаграждение: от 1 до 5000 грн, вознаграждение не больше стоимости';
 end if;
 update public.teplo_pilot_pricing set
  delivery_fee_uah=p_delivery_fee_uah,
  courier_reward_uah=p_courier_reward_uah,
  updated_at=now()
 where id=1;
 if not found then raise exception 'Тариф пилота не настроен'; end if;
end;
$function$;
revoke execute on function public.teplo_set_pilot_pricing(numeric,numeric) from public,anon;
grant execute on function public.teplo_set_pilot_pricing(numeric,numeric) to authenticated;

-- Quoted snapshots are generated in a trusted RPC; clients can only SELECT pilot jobs.
CREATE OR REPLACE FUNCTION public.teplo_create_pilot_job(p_shop_id uuid, p_customer_name text, p_customer_phone text, p_delivery_address text, p_order_summary text, p_ready_in_minutes integer, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := (select auth.uid());
 v_shop record;
 v_id uuid;
 v_price record;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
  raise exception 'Подтверди аккаунт через почту';
 end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then
  raise exception 'Тестовый режим недоступен при включённой доставке';
 end if;
 if not (public.has_role(array['admin']) or
  (public.has_role(array['venue']) and exists(
   select 1 from public.shop_members sm where sm.user_id=v_user and sm.shop_id=p_shop_id
  ))) then
  raise exception 'Только сотрудник своего заведения или администратор может передать заявку';
 end if;
 select id,name,address into v_shop from public.shops where id=p_shop_id and is_active;
 if not found then raise exception 'Заведение недоступно'; end if;
 if p_request_id is null then raise exception 'Отсутствует номер запроса'; end if;
 select delivery_fee_uah,courier_reward_uah into v_price from public.teplo_pilot_pricing where id=1;
 if not found then raise exception 'Расчётный тариф пилота не настроен'; end if;
 select id into v_id from public.teplo_pilot_jobs
 where created_by=v_user and request_id=p_request_id;
 if found then return v_id; end if;
 if char_length(btrim(coalesce(p_customer_name,''))) not between 2 and 90 or
    char_length(btrim(coalesce(p_delivery_address,''))) not between 7 and 240 or
    char_length(btrim(coalesce(p_order_summary,''))) not between 3 and 400 or
    p_customer_phone is null or char_length(btrim(p_customer_phone)) not between 7 and 22 or
    btrim(p_customer_phone) !~ '^[+0-9() -]+$' or
    p_ready_in_minutes is null or p_ready_in_minutes not between 0 and 180 then
  raise exception 'Проверь имя, телефон, адрес, описание и готовность';
 end if;
 if (select count(*) from public.teplo_pilot_jobs
     where created_by=v_user and created_at>now()-interval '24 hours')>=30
 or (select count(*) from public.teplo_pilot_jobs
     where created_by=v_user and created_at>now()-interval '60 seconds')>=3 then
  raise exception 'Слишком много тестовых заявок; попробуй позже';
 end if;
 insert into public.teplo_pilot_jobs
 (shop_id,shop_name_snapshot,shop_address_snapshot,created_by,customer_name,customer_phone,delivery_address,order_summary,ready_in_minutes,request_id,delivery_fee_uah,courier_reward_uah)
 values(v_shop.id,v_shop.name,coalesce(v_shop.address,''),v_user,btrim(p_customer_name),btrim(p_customer_phone),
        btrim(p_delivery_address),btrim(p_order_summary),p_ready_in_minutes,p_request_id,v_price.delivery_fee_uah,v_price.courier_reward_uah)
 on conflict (created_by,request_id) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.teplo_pilot_jobs where created_by=v_user and request_id=p_request_id;
 else
  insert into public.teplo_pilot_job_events(job_id,actor_id,event) values(v_id,v_user,'created');
 end if;
 return v_id;
end;
$function$
;

-- On completion alone, record a unique test earning once per job.
CREATE OR REPLACE FUNCTION public.teplo_pilot_courier_step(p_job_id uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());
 v_job public.teplo_pilot_jobs%rowtype;
 v_new text;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
  raise exception 'Нужен подтверждённый аккаунт';
 end if;
 if not public.has_role(array['courier','admin']) then
  raise exception 'Доступ только у назначенного курьера';
 end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then
  raise exception 'Тестовый режим отключён';
 end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found or v_job.courier_id is distinct from v_user then
  raise exception 'Этот заказ не назначен твоему аккаунту';
 end if;
 if p_action='declined' and v_job.status='assigned' then v_new:='new';
 elsif p_action='accepted' and v_job.status='assigned' then v_new:='accepted';
 elsif p_action='picked_up' and v_job.status='accepted' then v_new:='picked_up';
 elsif p_action='delivered' and v_job.status='picked_up' then v_new:='delivered';
 else raise exception 'Этот переход недоступен на текущем этапе';end if;
 update public.teplo_pilot_jobs set status=v_new,updated_at=now(),
  courier_id=case when p_action='declined' then null else courier_id end,
  assigned_by=case when p_action='declined' then null else assigned_by end,
  assigned_at=case when p_action='declined' then null else assigned_at end,
  accepted_at=case when p_action='accepted' then now() else accepted_at end,
  picked_up_at=case when p_action='picked_up' then now() else picked_up_at end,
  delivered_at=case when p_action='delivered' then now() else delivered_at end
  where id=p_job_id;
 insert into public.teplo_pilot_job_events(job_id,actor_id,event) values(p_job_id,v_user,p_action);
 if p_action='delivered' then
  insert into public.teplo_pilot_earnings(job_id,courier_id,amount_uah)
  values(v_job.id,v_user,v_job.courier_reward_uah)
  on conflict (job_id) do nothing;
 end if;
 return v_new;
end;
$function$
;
