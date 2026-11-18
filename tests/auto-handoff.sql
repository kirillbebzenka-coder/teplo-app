-- Isolated disposable fixture; no updates to existing orders or slots. Nothing commits.
begin;
do $$
declare uid uuid; template_id uuid; oid uuid:=gen_random_uuid(); sid uuid; jid uuid; part record;
begin
 select p.id into uid from public.profiles p join auth.users u on u.id=p.id where p.role='admin' and u.email_confirmed_at is not null limit 1;
 select order_id into template_id from public.teplo_order_venue_tasks group by order_id having count(*)>=2 limit 1;
 if uid is null or template_id is null then raise exception 'Missing test fixtures';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 insert into public.orders select (jsonb_populate_record(null::public.orders,to_jsonb(o)||jsonb_build_object('id',oid,'demo_request_id',gen_random_uuid(),'status','pending','demo_status','pending','created_at',now(),'updated_at',now()))).* from public.orders o where id=template_id;
 insert into public.teplo_order_venue_tasks(order_id,shop_id,shop_name_snapshot,shop_address_snapshot,state)
 select oid,shop_id,shop_name_snapshot,shop_address_snapshot,'pending' from public.teplo_order_venue_tasks where order_id=template_id;
 select shop_id into sid from public.teplo_order_venue_tasks where order_id=oid limit 1;
 perform public.teplo_venue_respond(oid,sid,'confirmed',20,'Изолированная проверка');
 set constraints teplo_auto_handoff_after_confirmation immediate;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=oid) then raise exception 'Premature handoff';end if;
 set constraints teplo_auto_handoff_after_confirmation deferred;
 update public.teplo_order_venue_tasks set state='confirmed',ready_at=now()+interval '100 years' where order_id=oid;
 set constraints teplo_auto_handoff_after_confirmation immediate;
 if not exists(select 1 from public.teplo_auto_dispatch_state where order_id=oid and state='waiting' and job_id is null) then raise exception 'No-slot wait missing';end if;
 set constraints teplo_auto_handoff_after_confirmation deferred;
 insert into public.teplo_pilot_slots(slot_start,slot_end,capacity,is_open) values(now()+interval '25 minutes',now()+interval '85 minutes',1,true);
 update public.teplo_order_venue_tasks set ready_at=now()+interval '30 minutes' where order_id=oid;
 update public.orders set demo_status='confirmed' where id=oid;
 set constraints teplo_auto_handoff_after_confirmation immediate;
 select id into jid from public.teplo_pilot_jobs where source_order_id=oid;
 if jid is null then raise exception 'Automatic handoff missing';end if;
 if (select demo_status from public.orders where id=oid)<>'assigned' then raise exception 'Parent status overwritten';end if;
 if (select count(*) from public.teplo_pilot_job_stops where job_id=jid)<>(select count(*) from public.teplo_order_venue_tasks where order_id=oid) then raise exception 'Pickup stops missing';end if;
 if teplo_private.try_auto_dispatch(oid)<>jid or public.teplo_dispatch_send_to_couriers(oid,(select slot_id from public.teplo_pilot_jobs where id=jid))<>jid then raise exception 'Idempotency failed';end if;
 if (select count(*) from public.teplo_pilot_jobs where source_order_id=oid)<>1 then raise exception 'Duplicate jobs';end if;
 if has_function_privilege('authenticated','teplo_private.try_auto_dispatch(uuid)','execute') then raise exception 'Private helper exposed';end if;
end $$;
rollback;
