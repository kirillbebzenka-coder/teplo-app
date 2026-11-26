-- Full demo path under customer/courier identities, rolled back without phone notifications.
begin;
update teplo_private.demo_venue_acceptance set auto_confirm_enabled=false;
do $$
declare buyer uuid; rider uuid; oid uuid; jid uuid; req uuid:=gen_random_uuid(); items jsonb; shop uuid;
begin
 select p.id into buyer from public.profiles p join auth.users u on u.id=p.id where u.email_confirmed_at is not null order by (p.role='admin') desc limit 1;
 select p.id into rider from public.profiles p join auth.users u on u.id=p.id
 where p.role='courier' and p.id<>buyer and u.email_confirmed_at is not null
 and exists(select 1 from public.courier_shifts cs where cs.courier_id=p.id and cs.ended_at is null)
 and (select count(*) from public.teplo_pilot_jobs j where j.courier_id=p.id and j.status in ('assigned','accepted','picked_up'))<2 limit 1;
 if rider is null then raise exception 'Requires confirmed courier on shift with capacity';end if;
 select jsonb_agg(jsonb_build_object('product_id',id,'quantity',1)) into items from (
  select distinct on (p.shop_id) p.id from public.products p join teplo_private.demo_venue_acceptance d on d.shop_id=p.shop_id where p.is_available order by p.shop_id,p.id
 ) products;
 if jsonb_array_length(items)<>2 then raise exception 'Requires two demo venues/products';end if;
 update public.profiles set role='customer' where id=buyer;
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 oid:=public.place_teplo_demo_combined_cart(items,'Тестовый покупатель','0000000000','Тестовая улица','1','','cash_on_delivery',req);
 set constraints all immediate;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=oid) then raise exception 'Unconfirmed checkout reached courier queue';end if;
 if exists(select 1 from public.teplo_order_venue_tasks where order_id=oid and (state<>'pending' or ready_at is not null)) then raise exception 'Kitchen was simulated without operator';end if;
 update public.profiles set role='dispatcher' where id=buyer;
 for shop in select shop_id from public.teplo_order_venue_tasks where order_id=oid order by shop_id loop
  perform public.teplo_dispatch_phone_confirm(oid,shop,20,'Тест: заведение приняло заказ по телефону');
 end loop;
 update public.profiles set role='customer' where id=buyer;
 select id into jid from public.teplo_pilot_jobs where source_order_id=oid;
 if jid is null then raise exception 'Checkout did not reach courier queue';end if;
 if not exists(select 1 from jsonb_array_elements(public.teplo_buyer_order_progress()) x where x->>'order_id'=oid::text and x->>'state'='new') then raise exception 'Buyer queue progress missing';end if;
 if (select count(*) from public.teplo_pilot_job_stops where job_id=jid)<>2 then raise exception 'Combined pickup stops missing';end if;
 if public.place_teplo_demo_combined_cart(items,'Тестовый покупатель','0000000000','Тестовая улица','1','','cash_on_delivery',req)<>oid then raise exception 'Checkout retry duplicated order';end if;
 perform set_config('request.jwt.claim.sub',rider::text,true);
 if not exists(select 1 from public.teplo_pilot_open_jobs_eta() where id=jid) then raise exception 'Courier cannot see checkout';end if;
 perform public.teplo_pilot_claim_job(jid);
 begin perform public.teplo_toggle_courier_shift(false);raise exception 'ASSERT: active courier finished shift';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 if (select status from public.teplo_pilot_jobs where id=jid)<>'accepted' then raise exception 'Claim not accepted';end if;
 perform public.teplo_pilot_courier_step(jid,'picked_up');
 perform public.teplo_pilot_courier_step(jid,'delivered');
 if (select demo_status from public.orders where id=oid)<>'delivered' then raise exception 'Buyer status not completed';end if;
 if (select count(*) from public.teplo_pilot_earnings where job_id=jid)<>1 then raise exception 'Incorrect earnings count';end if;
 begin perform public.teplo_pilot_courier_step(jid,'delivered');raise exception 'Duplicate completion accepted';exception when others then if sqlerrm<>'Этот переход недоступен на текущем этапе' then raise;end if;end;
end $$;
rollback;
