-- Enforce selected slot for new orders; preserve legacy orders and idempotency.
CREATE OR REPLACE FUNCTION public.teplo_create_pilot_job(p_shop_id uuid, p_customer_name text, p_customer_phone text, p_delivery_address text, p_order_summary text, p_ready_in_minutes integer, p_request_id uuid, p_slot_id uuid)
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
 v_slot public.teplo_pilot_slots%rowtype;
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
 select * into v_slot from public.teplo_pilot_slots where id=p_slot_id for update;
 if not found or not v_slot.is_open or v_slot.slot_end<=now()
 then raise exception 'Слот закрыт или уже прошёл';end if;
 if (select count(*) from public.teplo_pilot_jobs
   where slot_id=p_slot_id and status<>'cancelled') >= v_slot.capacity
 then raise exception 'Слот заполнен, выбери другой';end if;
 insert into public.teplo_pilot_jobs
 (shop_id,shop_name_snapshot,shop_address_snapshot,created_by,customer_name,customer_phone,delivery_address,order_summary,ready_in_minutes,request_id,delivery_fee_uah,courier_reward_uah,slot_id)
 values(v_shop.id,v_shop.name,coalesce(v_shop.address,''),v_user,btrim(p_customer_name),btrim(p_customer_phone),
        btrim(p_delivery_address),btrim(p_order_summary),p_ready_in_minutes,p_request_id,v_price.delivery_fee_uah,v_price.courier_reward_uah,p_slot_id)
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
-- Reject outdated 7-argument callers instead of allowing them to bypass slot capacity.
create or replace function public.teplo_create_pilot_job(p_shop_id uuid,p_customer_name text,p_customer_phone text,p_delivery_address text,p_order_summary text,p_ready_in_minutes integer,p_request_id uuid)
returns uuid language plpgsql security definer set search_path to ''
as $function$ begin raise exception 'Обнови страницу ресторана и выбери временной слот'; end; $function$;
revoke execute on function public.teplo_create_pilot_job(uuid,text,text,text,text,integer,uuid,uuid) from public,anon;
grant execute on function public.teplo_create_pilot_job(uuid,text,text,text,text,integer,uuid,uuid) to authenticated;
