-- Isolated full order fixture; no data or pushes survive rollback.
begin;
-- Isolated fixture only. Application defaults remain manual after ROLLBACK.
update teplo_private.demo_venue_acceptance set auto_confirm_enabled=true;
do $$
declare owner_id uuid; first_rider uuid; second_rider uuid; oid uuid; jid uuid; items jsonb;
begin
 select p.id into owner_id from public.profiles p join auth.users u on u.id=p.id where p.role='admin' and u.email_confirmed_at is not null limit 1;
 select jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',1)) into items from public.products p join teplo_private.demo_venue_acceptance d on d.shop_id=p.shop_id where p.is_available;
 select p.id into first_rider from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and u.email_confirmed_at is not null and exists(select 1 from public.courier_shifts where courier_id=p.id and ended_at is null) limit 1;
 select p.id into second_rider from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and p.id<>first_rider and u.email_confirmed_at is not null limit 1;
 if owner_id is null or first_rider is null or second_rider is null then raise exception 'Requires administrator and two verified couriers';end if;
 update public.profiles set role='customer' where id=owner_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 oid:=public.place_teplo_demo_combined_cart(items,'Тест доступа','0000000000','Тестовая улица','1','','cash_on_delivery',gen_random_uuid());
 set constraints all immediate;
 select id into jid from public.teplo_pilot_jobs where source_order_id=oid;
 if jid is null then raise exception 'Fixture not dispatched';end if;
 if has_column_privilege('authenticated','public.profiles','role','UPDATE') then raise exception 'Customer can elevate profile role';end if;
 begin perform public.teplo_assign_pilot_job(jid,first_rider);raise exception 'ASSERT: customer assigned courier';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',first_rider::text,true);
 if exists(select 1 from jsonb_array_elements(public.teplo_buyer_order_progress()) x where x->>'order_id'=oid::text) then raise exception 'Foreign buyer progress exposed';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 update public.profiles set role='admin' where id=owner_id;
 begin perform public.teplo_dispatch_confirm_manual_delivery(jid,'Тест: заказ подтверждён получателем');raise exception 'ASSERT: completed before pickup';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform public.teplo_assign_pilot_job(jid,first_rider);
 perform set_config('request.jwt.claim.sub',first_rider::text,true);
 perform public.teplo_pilot_courier_step(jid,'accepted');
 perform public.teplo_pilot_courier_step(jid,'picked_up');
 begin perform public.teplo_dispatch_confirm_manual_delivery(jid,'Тест: заказ подтверждён получателем');raise exception 'ASSERT: courier used manual override';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin perform public.teplo_dispatch_confirm_manual_delivery(jid,'ok');raise exception 'ASSERT: short reason accepted';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 perform public.teplo_dispatch_confirm_manual_delivery(jid,'Тест: заказ подтверждён получателем');
 if (select demo_status from public.orders where id=oid)<>'delivered' then raise exception 'Buyer manual completion missing';end if;
 if (select count(*) from public.teplo_pilot_earnings where job_id=jid)<>1 then raise exception 'Manual earnings missing';end if;
 if not exists(select 1 from public.teplo_dispatch_notes where job_id=jid and actor_id=owner_id and kind='manual_delivery') then raise exception 'Manual audit missing';end if;
 begin perform public.teplo_dispatch_confirm_manual_delivery(jid,'Тест: заказ подтверждён получателем');raise exception 'ASSERT: repeated override';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 if (select count(*) from public.teplo_pilot_earnings where job_id=jid)<>1 then raise exception 'Duplicate manual earnings';end if;
end $$;
rollback;
