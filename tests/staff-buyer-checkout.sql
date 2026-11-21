-- Regression: a courier places a personal demo order, without changing their role.
-- Disposable transaction: no persistent orders, role updates or notifications.
begin;
do $$
declare buyer uuid; rider uuid; other_owner uuid; oid uuid; foreign_oid uuid; jid uuid; req uuid:=gen_random_uuid(); items jsonb;
begin
 select p.id into buyer from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and u.email_confirmed_at is not null order by p.id limit 1;
 select p.id into rider from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and p.id<>buyer and u.email_confirmed_at is not null
  and exists(select 1 from public.courier_shifts cs where cs.courier_id=p.id and cs.ended_at is null)
  and (select count(*) from public.teplo_pilot_jobs j where j.courier_id=p.id and j.status in ('assigned','accepted','picked_up'))<2 limit 1;
 select p.id into other_owner from public.profiles p join auth.users u on u.id=p.id where p.role='admin' and u.email_confirmed_at is not null limit 1;
 if buyer is null or rider is null or other_owner is null then raise exception 'Requires two verified couriers and an administrator';end if;
 select jsonb_agg(jsonb_build_object('product_id',id,'quantity',1)) into items from (
  select distinct on(p.shop_id) p.id from public.products p join teplo_private.demo_venue_acceptance d on d.shop_id=p.shop_id where p.is_available order by p.shop_id,p.id
 ) products;
 if jsonb_array_length(items)<>2 then raise exception 'Requires two demo venues/products';end if;
 perform set_config('request.jwt.claim.sub',other_owner::text,true);
 foreign_oid:=public.place_teplo_demo_zoned_cart(items,'Тест чужого заказа','0000000000','Тестовая улица','1','','cash_on_delivery',gen_random_uuid(),'teplodar');
 set constraints all immediate;
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 set local role authenticated;
 oid:=public.place_teplo_demo_zoned_cart(items,'Тест курьера-покупателя','0000000000','Тестовая улица','2','','cash_on_delivery',req,'teplodar');
 if not exists(select 1 from public.orders where id=oid and customer_id=buyer and is_test) then raise exception 'Courier cannot read own buyer order';end if;
 if (select role from public.profiles where id=buyer)<>'courier' then raise exception 'Buying changed courier role';end if;
 if exists(select 1 from public.orders where id=foreign_oid) then raise exception 'Courier can read unrelated buyer order';end if;
 if exists(select 1 from jsonb_array_elements(public.teplo_buyer_order_progress()) x where x->>'order_id'=foreign_oid::text) then raise exception 'Foreign buyer progress exposed';end if;
 if not exists(select 1 from jsonb_array_elements(public.teplo_buyer_order_progress()) x where x->>'order_id'=oid::text and x->>'state'='new') then raise exception 'Own courier-buyer progress missing';end if;
 if public.place_teplo_demo_zoned_cart(items,'Тест курьера-покупателя','0000000000','Тестовая улица','2','','cash_on_delivery',req,'teplodar')<>oid then raise exception 'Courier-buyer retry duplicated order';end if;
 begin perform public.teplo_dispatch_courier_roster();raise exception 'ASSERT: courier-buyer gained dispatcher access';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 reset role;
 select id into jid from public.teplo_pilot_jobs where source_order_id=oid;
 if jid is null or (select count(*) from public.teplo_pilot_job_stops where job_id=jid)<>2 then raise exception 'Courier-buyer order did not reach combined courier queue';end if;
 perform set_config('request.jwt.claim.sub',rider::text,true);
 set local role authenticated;
 if not exists(select 1 from public.teplo_pilot_open_jobs_eta() where id=jid) then raise exception 'Other courier cannot see new order';end if;
 perform public.teplo_pilot_claim_job(jid);
 perform public.teplo_pilot_courier_step(jid,'picked_up');
 perform public.teplo_pilot_courier_step(jid,'delivered');
 if (select count(*) from public.teplo_pilot_earnings where job_id=jid)<>1 then raise exception 'Incorrect courier earnings count';end if;
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 if not exists(select 1 from jsonb_array_elements(public.teplo_buyer_order_progress()) x where x->>'order_id'=oid::text and x->>'state'='delivered') then raise exception 'Courier-buyer cannot see completion';end if;
 if (select role from public.profiles where id=buyer)<>'courier' then raise exception 'Courier role lost after purchase';end if;
 reset role;
end $$;
rollback;
