-- Keep buyer-facing demo status in sync with the actual courier milestone.
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
 if v_job.source_order_id is not null and p_action in ('picked_up','delivered') then
  update public.orders set demo_status=p_action,updated_at=now()
  where id=v_job.source_order_id and is_test;
  insert into public.order_events(order_id,actor_id,old_status,new_status,note)
  values(v_job.source_order_id,v_user,
    case when p_action='picked_up' then 'assigned' else 'picked_up' end,p_action,
    'TEPLO TEST · курьер подтвердил этап сборной доставки');
 end if;
 if p_action='delivered' then
  insert into public.teplo_pilot_earnings(job_id,courier_id,amount_uah)
  values(v_job.id,v_user,v_job.courier_reward_uah)
  on conflict (job_id) do nothing;
 end if;
 return v_new;
end;
$function$
;
