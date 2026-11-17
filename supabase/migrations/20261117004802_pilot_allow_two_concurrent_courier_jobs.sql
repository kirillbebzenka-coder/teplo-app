-- TEPLO pilot: allow at most two simultaneous courier jobs.
-- Existing verified-role, disabled-tariffs, shift and assignment rules remain.
-- FOR UPDATE of the courier profile (inside this RPC) serializes concurrent assignments.
CREATE OR REPLACE FUNCTION public.teplo_assign_pilot_job(p_job_id uuid, p_courier_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid:=(select auth.uid());
 v_job public.teplo_pilot_jobs%rowtype;
 v_role text;
begin
 if v_user is null or not public.has_role(array['admin','dispatcher']) or
 not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
  raise exception 'Доступ только у подтверждённого диспетчера или администратора';
 end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then
  raise exception 'Тестовый режим отключён'; end if;
 if p_courier_id is null then
  raise exception 'Выбери курьера';
 end if;
 select p.role into v_role
 from public.profiles p join auth.users u on u.id=p.id
 where p.id=p_courier_id and u.email_confirmed_at is not null
 for update of p;
 if v_role is null or not (
     v_role='courier' or (v_role='admin' and p_courier_id=v_user and public.has_role(array['admin']))
 ) then
  raise exception 'Выбери подтверждённого курьера или администратора для самотестирования';
 end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found then raise exception 'Заявка не найдена';end if;
 if v_job.status='assigned' and v_job.courier_id=p_courier_id then return v_job.status;end if;
 if v_job.status<>'new' then raise exception 'Назначить можно только новую заявку';end if;
 if v_role='courier' and not exists(
  select 1 from public.courier_shifts
  where courier_id=p_courier_id and ended_at is null
 ) then
  raise exception 'Курьер не начал смену. Назначение невозможно';
 end if;
 -- The courier profile row was already locked FOR UPDATE above.
 -- This serializes concurrent dispatchers assigning to the same courier.
 if (select count(*) from public.teplo_pilot_jobs
     where courier_id=p_courier_id and status in ('assigned','accepted','picked_up')) >= 2 then
  raise exception 'У курьера уже 2 активных заказа — сначала заверши один';
 end if;
 update public.teplo_pilot_jobs set status='assigned',courier_id=p_courier_id,
   assigned_by=v_user,assigned_at=now(),updated_at=now() where id=p_job_id;
 insert into public.teplo_pilot_job_events(job_id,actor_id,event) values(p_job_id,v_user,'assigned');
 return 'assigned';
end;
$function$
;
