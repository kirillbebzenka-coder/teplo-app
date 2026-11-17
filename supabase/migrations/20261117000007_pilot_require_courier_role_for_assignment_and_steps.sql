-- TEPLO pilot: never assign to an administrator acting as a courier.
-- Preserve existing test jobs; a dispatcher may cancel old admin assignments.
-- Keep original SECURITY DEFINER safeguards and explicit auth checks.

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
     v_role='courier'
 ) then
  raise exception 'Выбери подтверждённого курьера';
 end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found then raise exception 'Заявка не найдена';end if;
 if v_job.status='assigned' and v_job.courier_id=p_courier_id then return v_job.status;end if;
 if v_job.status<>'new' then raise exception 'Назначить можно только новую заявку';end if;
 if not exists(
  select 1 from public.courier_shifts
  where courier_id=p_courier_id and ended_at is null
 ) then
  raise exception 'Курьер не начал смену. Назначение невозможно';
 end if;
 if exists (
  select 1 from public.teplo_pilot_jobs
  where courier_id=p_courier_id and status in ('assigned','accepted','picked_up')
 ) then
  raise exception 'Курьер уже занят другой заявкой';
 end if;
 update public.teplo_pilot_jobs set status='assigned',courier_id=p_courier_id,
   assigned_by=v_user,assigned_at=now(),updated_at=now() where id=p_job_id;
 insert into public.teplo_pilot_job_events(job_id,actor_id,event) values(p_job_id,v_user,'assigned');
 return 'assigned';
end;
$function$
;

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
 if not public.has_role(array['courier']) then
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
 return v_new;
end;
$function$
;
