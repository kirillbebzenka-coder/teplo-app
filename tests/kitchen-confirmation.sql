-- Real application defaults, all fixtures and notifications rolled back.
begin;
update teplo_private.demo_venue_acceptance set auto_confirm_enabled=false;
do $$
declare owner_id uuid; rider uuid; oid uuid; jid uuid; shop1 uuid; shop2 uuid;
 slot_id uuid; items jsonb; ready timestamptz; deadline timestamptz;
begin
 select p.id into owner_id from public.profiles p join auth.users u on u.id=p.id where p.role='admin' and u.email_confirmed_at is not null limit 1;
 select p.id into rider from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and u.email_confirmed_at is not null and exists(select 1 from public.courier_shifts s where s.courier_id=p.id and s.ended_at is null) and (select count(*) from public.teplo_pilot_jobs j where j.courier_id=p.id and j.status in ('assigned','accepted','picked_up'))<2 limit 1;
 if owner_id is null or rider is null then raise exception 'Needs verified administrator and available on-shift courier';end if;
 select jsonb_agg(jsonb_build_object('product_id',id,'quantity',1)) into items from(select distinct on(p.shop_id) p.id from public.products p join teplo_private.demo_venue_acceptance d on d.shop_id=p.shop_id where p.is_available order by p.shop_id,p.id) products;
 insert into public.teplo_pilot_slots(slot_start,slot_end,capacity,is_open) values(now()-interval '1 minute',now()+interval '3 hours',10,true) returning id into slot_id;
 update public.profiles set role='customer' where id=owner_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 oid:=public.place_teplo_demo_combined_cart(items,'Тест кухни','0000000000','Тестовая улица','1','','cash_on_delivery',gen_random_uuid());
 set constraints all immediate;
 select min(shop_id::text)::uuid,max(shop_id::text)::uuid into shop1,shop2 from public.teplo_order_venue_tasks where order_id=oid;
 if shop1=shop2 then raise exception 'Needs two demo venues';end if;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=oid) then raise exception 'Unconfirmed food order reached couriers';end if;
 if teplo_private.has_preparation_confirmation(oid) then raise exception 'Pending kitchen counted as confirmed';end if;
 begin
  perform public.teplo_dispatch_phone_confirm(oid,shop1,20,'Покупатель не может подтверждать кухню');
  raise exception 'ASSERT: customer acknowledged kitchen';
 exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',rider::text,true);
 begin
  perform public.teplo_venue_respond(oid,shop1,'confirmed',20,'Курьер не подтверждает кухню');
  raise exception 'ASSERT: courier acknowledged kitchen';
 exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 update public.profiles set role='admin' where id=owner_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  perform public.teplo_dispatch_send_to_couriers(oid,slot_id);
  raise exception 'ASSERT: dispatcher handed off before kitchen confirmation';
 exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 -- A historical synthetic "confirmed" state without an actor cannot bypass creation.
 begin
  update public.teplo_order_venue_tasks set state='confirmed',ready_at=now()+interval '20 minutes',updated_by=null where order_id=oid;
  perform teplo_private.create_confirmed_delivery(oid,slot_id,owner_id);
  raise exception 'ASSERT: synthetic confirmation created a delivery';
 exception when others then if sqlerrm not like 'Сначала диспетчер или заведение%' then raise;end if;end;
 ready:=public.teplo_dispatch_phone_confirm(oid,shop1,20,'Тест: кухня приняла заказ');
 if public.teplo_dispatch_phone_confirm(oid,shop1,180,'Повтор после потери сети') is distinct from ready then raise exception 'Retry reset preparation';end if;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=oid) then raise exception 'Partially confirmed combined order released';end if;
 -- A venue may also acknowledge its own task directly (future kitchen computer).
 update public.profiles set role='venue' where id=owner_id;
 insert into public.shop_members(shop_id,user_id) values(shop2,owner_id) on conflict do nothing;
 perform public.teplo_venue_respond(oid,shop2,'confirmed',20,'Тест: принято заведением');
 select id,ready_at into jid,ready from public.teplo_pilot_jobs where source_order_id=oid;
 if jid is null then raise exception 'Fully confirmed order did not reach queue';end if;
 update public.profiles set role='admin' where id=owner_id;
 -- Both dispatcher assignment and independent claim recheck the acknowledgement.
 begin
  update public.teplo_order_venue_tasks set updated_by=null where order_id=oid;
  perform public.teplo_assign_pilot_job(jid,rider);
  raise exception 'ASSERT: assignment bypassed confirmation';
 exception when others then if sqlerrm not like 'Сначала диспетчер или заведение%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',rider::text,true);
 begin
  update public.teplo_order_venue_tasks set updated_by=null where order_id=oid;
  perform public.teplo_pilot_claim_job(jid);
  raise exception 'ASSERT: independent claim bypassed confirmation';
 exception when others then if sqlerrm not like 'Сначала диспетчер или заведение%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.teplo_assign_pilot_job(jid,rider);
 perform set_config('request.jwt.claim.sub',rider::text,true);
 perform public.teplo_pilot_courier_step(jid,'accepted');
 if (select delivery_due_at from public.teplo_pilot_jobs where id=jid) is not null then raise exception 'Transport timer started at acceptance';end if;
 if (select ready_at from public.teplo_pilot_jobs where id=jid) is distinct from ready then raise exception 'Acceptance reset kitchen time';end if;
 perform public.teplo_pilot_courier_step(jid,'picked_up');
 select delivery_due_at into deadline from public.teplo_pilot_jobs where id=jid;
 if deadline is null then raise exception 'Pickup did not start transport timer';end if;
 perform public.teplo_pilot_courier_step(jid,'delivered');
 if (select count(*) from public.teplo_pilot_earnings where job_id=jid)<>1 then raise exception 'Earnings count changed';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Real delivery was enabled';end if;
 if has_table_privilege('authenticated','teplo_private.demo_venue_acceptance','UPDATE') or has_function_privilege('authenticated','teplo_private.has_preparation_confirmation(uuid)','EXECUTE') then raise exception 'Private simulation controls exposed';end if;
end $$;
rollback;
