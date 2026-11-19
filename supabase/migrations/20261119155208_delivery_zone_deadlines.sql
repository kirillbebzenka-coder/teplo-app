alter table public.orders add column delivery_area text check(delivery_area in ('teplodar','dachi','shyroka_balka','myrne','prom'));
alter table public.teplo_pilot_jobs add column delivery_zone text check(delivery_zone in ('local','dachi','nearby'));
alter table public.teplo_pilot_jobs add column delivery_minutes integer check(delivery_minutes between 5 and 120);
alter table public.teplo_pilot_jobs add column delivery_due_at timestamptz;
create function teplo_private.delivery_zone_for_area(p_area text) returns text language sql immutable set search_path='' as $$
 select case p_area when 'teplodar' then 'local' when 'dachi' then 'dachi' when 'shyroka_balka' then 'nearby' when 'myrne' then 'nearby' when 'prom' then 'nearby' end;
$$;
create function teplo_private.delivery_zone_minutes(p_zone text) returns integer language sql immutable set search_path='' as $$
 select case p_zone when 'local' then 20 when 'dachi' then 30 when 'nearby' then 40 end;
$$;
create function teplo_private.detect_delivery_zone(p_address text) returns text language sql immutable set search_path='' as $$
 select case
 when lower(coalesce(p_address,'')) ~ '(широкая[[:space:]]+балка|широка[[:space:]]+балка|(^|[[:space:],.])(мирне|мирное|мірне|пром|промзона)([[:space:],.]|$))' then 'nearby'
 when lower(coalesce(p_address,'')) ~ '(^|[[:space:],.])дач[иі]([[:space:],.]|$)' then 'dachi'
 when lower(coalesce(p_address,'')) like '%теплодар%' then 'local' end;
$$;
revoke all on function teplo_private.delivery_zone_for_area(text),teplo_private.delivery_zone_minutes(text),teplo_private.detect_delivery_zone(text) from public,anon,authenticated;
create function teplo_private.stamp_delivery_deadline() returns trigger language plpgsql security definer set search_path='' as $$
declare area text;
begin
 if not new.is_test then return new;end if;
 if new.delivery_zone is null then
  if new.source_order_id is not null then select delivery_area into area from public.orders where id=new.source_order_id;end if;
  new.delivery_zone:=coalesce(teplo_private.delivery_zone_for_area(area),teplo_private.detect_delivery_zone(new.delivery_address));
 end if;
 if tg_op='UPDATE' and old.delivery_due_at is not null then
  if new.delivery_zone is distinct from old.delivery_zone then raise exception 'После забора зона и срок зафиксированы';end if;
  new.delivery_minutes:=old.delivery_minutes;new.delivery_due_at:=old.delivery_due_at;new.picked_up_at:=old.picked_up_at;
  return new;
 end if;
 new.delivery_minutes:=teplo_private.delivery_zone_minutes(new.delivery_zone);
 if new.status='picked_up' then
  if new.delivery_minutes is null then raise exception 'Перед забором уточни зону доставки';end if;
  if tg_op='UPDATE' then new.picked_up_at:=coalesce(old.picked_up_at,now());else new.picked_up_at:=coalesce(new.picked_up_at,now());end if;
  new.delivery_due_at:=new.picked_up_at+new.delivery_minutes*interval '1 minute';
 else new.delivery_due_at:=null;end if;
 return new;
end $$;
revoke all on function teplo_private.stamp_delivery_deadline() from public,anon,authenticated;
create trigger teplo_delivery_deadline before insert or update on public.teplo_pilot_jobs for each row execute function teplo_private.stamp_delivery_deadline();
create function public.place_teplo_demo_zoned_cart(p_items jsonb,p_customer_name text,p_customer_phone text,p_street text,p_house text,p_apartment text,p_payment_method text,p_request_id uuid,p_area text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); oid uuid; area_label text; zone text; detected text; address text;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Подтверди тестовый аккаунт';end if;
 if p_request_id is null then raise exception 'Отсутствует номер оформления';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,68));
 select id into oid from public.orders where customer_id=uid and demo_request_id=p_request_id and is_test;
 if found then return oid;end if;
 zone:=teplo_private.delivery_zone_for_area(p_area);
 area_label:=case p_area when 'teplodar' then 'Теплодар' when 'dachi' then 'Дачи' when 'shyroka_balka' then 'Широкая Балка' when 'myrne' then 'Мирное' when 'prom' then 'Пром' end;
 if zone is null then raise exception 'Выбери населённый пункт из списка';end if;
 detected:=teplo_private.detect_delivery_zone(p_street);
 if detected is not null and detected<>zone then raise exception 'Населённый пункт не совпадает с адресом. Проверь выбор';end if;
 oid:=public.place_teplo_demo_combined_cart(p_items,p_customer_name,p_customer_phone,p_street,p_house,p_apartment,p_payment_method,p_request_id);
 address:=area_label||', '||btrim(p_street)||', дом '||btrim(p_house)||case when btrim(coalesce(p_apartment,''))<>'' then ', кв. '||btrim(p_apartment) else '' end;
 update public.orders set delivery_area=p_area,delivery_address=address where id=oid and customer_id=uid;
 -- Also supports transactions where deferred handoff constraints were already made immediate.
 update public.teplo_pilot_jobs set delivery_zone=zone,delivery_address=address where source_order_id=oid and status in ('new','assigned','accepted') and delivery_due_at is null;
 return oid;
end $$;
revoke all on function public.place_teplo_demo_zoned_cart(jsonb,text,text,text,text,text,text,uuid,text) from public,anon;
grant execute on function public.place_teplo_demo_zoned_cart(jsonb,text,text,text,text,text,text,uuid,text) to authenticated;
create function public.teplo_set_delivery_zone(p_job_id uuid,p_zone text,p_note text) returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); j public.teplo_pilot_jobs%rowtype; staff boolean;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Необходим подтверждённый аккаунт';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Доступно только в тестовом режиме';end if;
 if teplo_private.delivery_zone_minutes(p_zone) is null or char_length(btrim(coalesce(p_note,''))) not between 5 and 400 then raise exception 'Выбери зону и укажи причину';end if;
 select * into j from public.teplo_pilot_jobs where id=p_job_id and is_test for update;
 if not found or j.status not in ('new','assigned','accepted','picked_up') or j.delivery_due_at is not null then raise exception 'Зону можно уточнить только до фиксации срока';end if;
 staff:=public.has_role(array['admin','dispatcher']);
 if not staff and not (public.has_role(array['courier']) and j.courier_id=uid and j.delivery_zone is null) then raise exception 'Недостаточно прав для изменения зоны';end if;
 update public.teplo_pilot_jobs set delivery_zone=p_zone,updated_at=now() where id=p_job_id;
 insert into public.teplo_dispatch_notes(job_id,actor_id,kind,note) values(p_job_id,uid,'note','Зона доставки: '||p_zone||'. '||btrim(p_note));
 return p_zone;
end $$;
revoke all on function public.teplo_set_delivery_zone(uuid,text,text) from public,anon;
grant execute on function public.teplo_set_delivery_zone(uuid,text,text) to authenticated;
create function public.teplo_delivery_timing(p_job_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); pool uuid[]:='{}'; staff boolean;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Необходим подтверждённый аккаунт';end if;
 if coalesce(cardinality(p_job_ids),0)>200 then raise exception 'Слишком много заказов';end if;
 staff:=public.has_role(array['admin','dispatcher']);
 if cardinality(p_job_ids)>0 and public.has_role(array['courier','admin']) then select coalesce(array_agg(id),'{}') into pool from public.teplo_pilot_open_jobs_eta();end if;
 return jsonb_build_object('server_now',clock_timestamp(),'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'delivery_zone',j.delivery_zone,'delivery_minutes',j.delivery_minutes,'delivery_due_at',j.delivery_due_at))
 from public.teplo_pilot_jobs j where j.id=any(p_job_ids) and (staff or j.created_by=uid or (public.has_role(array['courier']) and (j.courier_id=uid or j.id=any(pool))) or exists(select 1 from public.orders o where o.id=j.source_order_id and o.customer_id=uid))),'[]'::jsonb));
end $$;
revoke all on function public.teplo_delivery_timing(uuid[]) from public,anon;
grant execute on function public.teplo_delivery_timing(uuid[]) to authenticated;

create or replace function teplo_private.check_delivery_delays() returns integer
language plpgsql security definer set search_path='' as $$
declare item record; token text; request bigint; queued integer:=0;
begin
 -- A transaction-level lock makes manual and cron runs safe to overlap.
 if not pg_try_advisory_xact_lock(18213327) then return 0;end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then return 0;end if;
 update teplo_private.delay_alerts a set closed_at=now(),last_result='no_longer_active'
 where a.closed_at is null and not exists(
  select 1 from public.teplo_pilot_jobs j where j.id=a.job_id and j.is_test and j.status=a.phase
   and a.phase_at=case j.status when 'new' then coalesce((select max(e.created_at) from public.teplo_pilot_job_events e where e.job_id=j.id and e.event in ('released','declined')),j.created_at)
    when 'assigned' then coalesce(j.assigned_at,j.updated_at)
    when 'accepted' then coalesce(j.accepted_at,j.updated_at)
    else coalesce(j.picked_up_at,j.updated_at) end
 );
 -- Record transport results; accepted by push gateway is not proof of phone display.
 update teplo_private.delay_alerts a
 set notified_at=case when r.status_code between 200 and 299 and r.content::jsonb->>'sent' is not null
       and (r.content::jsonb->>'sent')::integer>0 then now() else null end,
     last_result=case when r.status_code between 200 and 299 then left(r.content,300) else 'http_'||coalesce(r.status_code::text,'error') end
 from net._http_response r
 where a.request_id=r.id and a.notified_at is null and a.closed_at is null;
 insert into teplo_private.delay_alerts(job_id,phase,phase_at,reason)
 select j.id,j.status,
  case j.status when 'new' then coalesce((select max(e.created_at) from public.teplo_pilot_job_events e where e.job_id=j.id and e.event in ('released','declined')),j.created_at)
   when 'assigned' then coalesce(j.assigned_at,j.updated_at)
   when 'accepted' then coalesce(j.accepted_at,j.updated_at)
   else coalesce(j.picked_up_at,j.updated_at) end,
  case when j.status<>'picked_up' and s.slot_end<now() then 'slot'
   when j.status='new' and s.is_open=false then 'closed_slot'
   when j.status='new' and not exists(
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.role='courier' and u.email_confirmed_at is not null
     and exists(select 1 from public.courier_shifts cs where cs.courier_id=p.id and cs.ended_at is null)
     and (select count(*) from public.teplo_pilot_jobs busy where busy.courier_id=p.id and busy.status in ('assigned','accepted','picked_up'))<2
   ) then 'no_courier'
   when j.status='new' then 'unclaimed' when j.status='assigned' then 'unconfirmed'
   when j.status='accepted' then 'pickup' else 'delivery' end
 from public.teplo_pilot_jobs j left join public.teplo_pilot_slots s on s.id=j.slot_id
 where j.is_test and j.status in ('new','assigned','accepted','picked_up') and (
  (j.status<>'picked_up' and s.slot_end<now())
  or (j.status='new' and now()>=greatest(j.updated_at,coalesce(s.slot_start-interval '15 minutes',j.updated_at)) and (
   s.is_open=false
   or now()>=greatest(j.updated_at,coalesce(s.slot_start-interval '15 minutes',j.updated_at))+interval '5 minutes'
  ))
  or (j.status='assigned' and coalesce(j.assigned_at,j.updated_at)<=now()-interval '3 minutes')
  or (j.status='accepted' and j.ready_at<=now()-interval '15 minutes')
  or (j.status='picked_up' and coalesce(j.delivery_due_at,j.picked_up_at+interval '60 minutes',j.updated_at+interval '60 minutes')<=now())
 ) on conflict(job_id,phase,phase_at) do nothing;
 select decrypted_secret into token from vault.decrypted_secrets where name='teplo_push_webhook_key';
 if token is null then return 0;end if;
 for item in select a.* from teplo_private.delay_alerts a
  join public.teplo_pilot_jobs j on j.id=a.job_id
  where a.closed_at is null and a.notified_at is null and a.attempts<3
   and j.is_test and j.status=a.phase
   and (j.status<>'picked_up' or coalesce(j.delivery_due_at,j.picked_up_at+interval '60 minutes',j.updated_at+interval '60 minutes')<=now())
   and (a.requested_at is null or a.requested_at<now()-interval '5 minutes')
  order by a.id limit 20 for update of a skip locked
 loop
  request:=net.http_post(
   url:='https://bgtegxdekqsajttkhhrj.supabase.co/functions/v1/teplo-push/event',
   headers:=jsonb_build_object('Content-Type','application/json','x-teplo-webhook',token),
   body:=jsonb_build_object('type','delivery_delay','id',item.job_id,'reason',item.reason),timeout_milliseconds:=10000);
  update teplo_private.delay_alerts set attempts=attempts+1,request_id=request,requested_at=now(),last_result='queued' where id=item.id;
  queued:=queued+1;
 end loop;
 return queued;
end;$$;

create or replace function public.teplo_buyer_order_progress() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 if uid is null then raise exception 'Необходим вход';end if;
 return coalesce((select jsonb_agg(to_jsonb(progress)) from (
  select o.id as order_id,coalesce(j.status,o.demo_status) as state, clock_timestamp() as server_now, j.delivery_zone,j.delivery_minutes,j.delivery_due_at,j.picked_up_at,j.delivered_at,j.ready_at,
   case
    when j.status='new' then 'Заказ в очереди курьеров. Ждём принятия'
    when j.status='assigned' then 'Курьер назначен. Ждём его подтверждения'
    when j.status='accepted' then 'Курьер принял заказ и готовится забрать'
    when j.status='picked_up' then 'Курьер забрал заказ и едет к получателю'
    when j.status='delivered' or (j.id is null and o.demo_status='delivered') then 'Доставка завершена'
    when j.status='cancelled' or o.status='cancelled' then 'Доставка отменена'
    when a.state in ('waiting','error') then a.reason
    when exists(select 1 from public.teplo_order_venue_tasks t where t.order_id=o.id and t.state='issue') then 'Заведение сообщило о проблеме. Диспетчер разбирается'
    when exists(select 1 from public.teplo_order_venue_tasks t where t.order_id=o.id and (t.state<>'confirmed' or t.ready_at is null)) then 'Ждём подтверждения и времени готовности от заведений'
    else 'Заказ подтверждён. Подбираем слот доставки'
   end as message
  from public.orders o left join public.teplo_pilot_jobs j on j.source_order_id=o.id
  left join public.teplo_auto_dispatch_state a on a.order_id=o.id
  where o.customer_id=uid and o.is_test order by o.created_at desc limit 30
 ) progress),'[]'::jsonb);
end;$$;
