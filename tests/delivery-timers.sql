-- Disposable fixtures. All data, role changes and queued HTTP requests roll back.
begin;
do $$
declare owner_id uuid;rider uuid;other_rider uuid;items jsonb;oid uuid;jid uuid; area text;zone text;mins int;deadline timestamptz;request uuid;unknown_id uuid;late_id uuid;fixture_slot uuid;result jsonb;
begin
 select p.id into owner_id from public.profiles p join auth.users u on u.id=p.id where p.role='admin' and u.email_confirmed_at is not null limit 1;
 select p.id into rider from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and u.email_confirmed_at is not null and exists(select 1 from public.courier_shifts s where s.courier_id=p.id and ended_at is null) and (select count(*) from public.teplo_pilot_jobs j where j.courier_id=p.id and j.status in ('assigned','accepted','picked_up'))=0 limit 1;
 select p.id into other_rider from public.profiles p where p.role='courier' and p.id<>rider limit 1;
 if owner_id is null or rider is null then raise exception 'Verified owner and free on-shift courier required';end if;
 select jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',1)) into items from public.products p join teplo_private.demo_venue_acceptance d on d.shop_id=p.shop_id where p.is_available;
 insert into public.teplo_pilot_slots(slot_start,slot_end,capacity,is_open) values(clock_timestamp()-interval '1 minute',clock_timestamp()+interval '2 hours',8,true) returning id into fixture_slot;
 foreach area in array array['teplodar','dachi','shyroka_balka','myrne','prom'] loop
  zone:=teplo_private.delivery_zone_for_area(area);mins:=case zone when 'local' then 20 when 'dachi' then 30 else 40 end;request:=gen_random_uuid();
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  oid:=public.place_teplo_demo_zoned_cart(items,'Тест таймера','0000000000','Тестовая улица','1','','cash_on_delivery',request,area);
  set constraints all immediate;
  select id into jid from public.teplo_pilot_jobs where source_order_id=oid;
  if jid is null then raise exception 'Zoned order not dispatched';end if;
  if (select delivery_zone from public.teplo_pilot_jobs where id=jid)<>zone or (select delivery_minutes from public.teplo_pilot_jobs where id=jid)<>mins then raise exception 'Wrong zone/minutes';end if;
  if (select delivery_due_at from public.teplo_pilot_jobs where id=jid) is not null then raise exception 'Timer began before pickup';end if;
  if (select delivery_area from public.orders where id=oid)<>area then raise exception 'Area not stored';end if;
  if area<>'teplodar' and (select delivery_address from public.orders where id=oid) like 'Теплодар,%' then raise exception 'Wrong settlement prefix';end if;
  if public.place_teplo_demo_zoned_cart(items,'Тест таймера','0000000000','Тестовая улица','1','','cash_on_delivery',request,'prom')<>oid then raise exception 'Retry duplicated order';end if;
  perform set_config('request.jwt.claim.sub',rider::text,true);
  perform public.teplo_pilot_claim_job(jid);
  if (select delivery_due_at from public.teplo_pilot_jobs where id=jid) is not null then raise exception 'Timer began on claim';end if;
  perform public.teplo_pilot_courier_step(jid,'picked_up');
  select delivery_due_at into deadline from public.teplo_pilot_jobs where id=jid;
  if deadline is null or (select delivery_due_at-picked_up_at from public.teplo_pilot_jobs where id=jid)<>mins*interval '1 minute' then raise exception 'Incorrect pickup deadline';end if;
  update public.teplo_pilot_jobs set ready_at=now()+interval '2 hours',delivery_due_at=now()+interval '3 hours' where id=jid;
  if (select delivery_due_at from public.teplo_pilot_jobs where id=jid)<>deadline then raise exception 'Deadline reset';end if;
  begin perform public.teplo_set_delivery_zone(jid,'nearby','Тест изменения после забора');raise exception 'ASSERT: deadline could be extended';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
  result:=public.teplo_delivery_timing(array[jid]);
  if result->>'server_now' is null or jsonb_array_length(result->'jobs')<>1 then raise exception 'Timing/clock unavailable';end if;
  perform set_config('request.jwt.claim.sub',other_rider::text,true);
  if jsonb_array_length(public.teplo_delivery_timing(array[jid])->'jobs')<>0 then raise exception 'Foreign active timer exposed';end if;
  perform set_config('request.jwt.claim.sub',rider::text,true);
  perform public.teplo_pilot_courier_step(jid,'delivered');
  if (select delivery_due_at from public.teplo_pilot_jobs where id=jid)<>deadline then raise exception 'Completion lost deadline';end if;
 end loop;
 -- Unknown address must be resolved explicitly; a street alone is never guessed.
 insert into public.teplo_pilot_jobs(shop_id,shop_name_snapshot,shop_address_snapshot,created_by,customer_name,customer_phone,delivery_address,order_summary,ready_in_minutes,request_id,slot_id)
 select shop_id,shop_name_snapshot,shop_address_snapshot,owner_id,'Тест','0000000000','Тестовая улица, 1','Неопределённая зона',0,gen_random_uuid(),fixture_slot from public.teplo_pilot_jobs where id=jid returning id into unknown_id;
 perform set_config('request.jwt.claim.sub',rider::text,true);perform public.teplo_pilot_claim_job(unknown_id);
 begin perform public.teplo_pilot_courier_step(unknown_id,'picked_up');raise exception 'ASSERT: unknown address started timer';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',other_rider::text,true);
 begin perform public.teplo_set_delivery_zone(unknown_id,'local','Чужой курьер');raise exception 'ASSERT: foreign zone update';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',rider::text,true);perform public.teplo_set_delivery_zone(unknown_id,'dachi','Уточнение населённого пункта');perform public.teplo_pilot_courier_step(unknown_id,'picked_up');
 if (select delivery_minutes from public.teplo_pilot_jobs where id=unknown_id)<>30 then raise exception 'Explicit unknown zone failed';end if;
 -- One isolated overdue fixture; do not age or change existing jobs/slots.
 insert into public.teplo_pilot_jobs(shop_id,shop_name_snapshot,shop_address_snapshot,created_by,customer_name,customer_phone,delivery_address,order_summary,ready_in_minutes,request_id,slot_id,courier_id,status,picked_up_at,delivery_zone)
 select shop_id,shop_name_snapshot,shop_address_snapshot,owner_id,'Тест','0000000000','Теплодар, тестовая улица, 2','Просроченный тест',0,gen_random_uuid(),fixture_slot,rider,'picked_up',now()-interval '21 minutes','local' from public.teplo_pilot_jobs where id=jid returning id into late_id;
 perform teplo_private.check_delivery_delays();
 perform teplo_private.check_delivery_delays();
 if (select count(*) from teplo_private.delay_alerts where job_id=late_id and reason='delivery')<>1 then raise exception 'Zone deadline not monitored';end if;
 if exists(select 1 from teplo_private.delay_alerts where job_id=unknown_id and reason='delivery') then raise exception 'Unexpired deadline escalated';end if;
 if has_function_privilege('anon','public.teplo_delivery_timing(uuid[])','EXECUTE') or has_function_privilege('anon','public.teplo_set_delivery_zone(uuid,text,text)','EXECUTE') then raise exception 'Anonymous timer mutation/read';end if;
end $$;
rollback;
