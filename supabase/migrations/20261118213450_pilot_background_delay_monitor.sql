-- Demo only. Private outbox: never expose credentials or customer details through the Data API.
create extension if not exists pg_cron;
create schema if not exists teplo_private;
revoke all on schema teplo_private from public,anon,authenticated;
create table teplo_private.delay_alerts (
 id bigint generated always as identity primary key,
 job_id uuid not null references public.teplo_pilot_jobs(id),
 phase text not null,
 phase_at timestamptz not null,
 reason text not null,
 attempts integer not null default 0,
 request_id bigint,
 requested_at timestamptz,
 notified_at timestamptz,
 closed_at timestamptz,
 last_result text,
 unique(job_id,phase,phase_at)
);
alter table teplo_private.delay_alerts enable row level security;
revoke all on teplo_private.delay_alerts from public,anon,authenticated;
create function teplo_private.check_delivery_delays() returns integer
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
  case when s.slot_end<now() then 'slot'
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
  s.slot_end<now()
  or (j.status='new' and now()>=greatest(j.updated_at,coalesce(s.slot_start-interval '15 minutes',j.updated_at)) and (
   s.is_open=false
   or now()>=greatest(j.updated_at,coalesce(s.slot_start-interval '15 minutes',j.updated_at))+interval '5 minutes'
  ))
  or (j.status='assigned' and coalesce(j.assigned_at,j.updated_at)<=now()-interval '3 minutes')
  or (j.status='accepted' and j.ready_at<=now()-interval '15 minutes')
  or (j.status='picked_up' and coalesce(j.picked_up_at,j.updated_at)<=now()-interval '60 minutes')
 ) on conflict(job_id,phase,phase_at) do nothing;
 select decrypted_secret into token from vault.decrypted_secrets where name='teplo_push_webhook_key';
 if token is null then return 0;end if;
 for item in select a.* from teplo_private.delay_alerts a
  join public.teplo_pilot_jobs j on j.id=a.job_id
  where a.closed_at is null and a.notified_at is null and a.attempts<3
   and j.is_test and j.status=a.phase
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
revoke all on function teplo_private.check_delivery_delays() from public,anon,authenticated;
select cron.schedule('teplo-demo-delay-monitor','* * * * *','select teplo_private.check_delivery_delays();');
