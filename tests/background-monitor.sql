-- Run as project administrator; all fixture and outbox changes roll back.
begin;
do $$
declare jid uuid; aid bigint; queued integer;
begin
 if exists(select 1 from public.teplo_pilot_jobs where status in ('new','assigned','accepted','picked_up')) then
  raise exception 'Use an isolated test project or wait until no active fixtures remain';
 end if;
 select id into jid from public.teplo_pilot_jobs where is_test and status='delivered' limit 1;
 if jid is null then raise exception 'Requires an existing completed demo fixture';end if;
 update public.teplo_pilot_jobs set status='new',slot_id=null,courier_id=null,
 created_at=now()-interval '10 minutes',updated_at=now()-interval '10 minutes' where id=jid;
 queued:=teplo_private.check_delivery_delays();
 if queued<>1 then raise exception 'Expected one alert, got %',queued;end if;
 if teplo_private.check_delivery_delays()<>0 then raise exception 'Duplicate alert';end if;
 select id into aid from teplo_private.delay_alerts where job_id=jid and closed_at is null;
 update teplo_private.delay_alerts set requested_at=now()-interval '6 minutes' where id=aid;
 if teplo_private.check_delivery_delays()<>1 then raise exception 'Missing retry';end if;
 update teplo_private.delay_alerts set attempts=3,requested_at=now()-interval '6 minutes' where id=aid;
 if teplo_private.check_delivery_delays()<>0 then raise exception 'Retry cap exceeded';end if;
 update public.teplo_pilot_jobs set status='delivered' where id=jid;
 perform teplo_private.check_delivery_delays();
 if exists(select 1 from teplo_private.delay_alerts where id=aid and closed_at is null) then raise exception 'Completed job still monitored';end if;
 if has_function_privilege('anon','teplo_private.check_delivery_delays()','execute')
 or has_function_privilege('authenticated','teplo_private.check_delivery_delays()','execute') then raise exception 'Private function exposed';end if;
end $$;
rollback;
