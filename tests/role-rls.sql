begin;
do $$
declare uid uuid;
begin
 select p.id into uid from public.profiles p join auth.users u on u.id=p.id where p.role='courier' and u.email_confirmed_at is not null limit 1;
 if uid is null then raise exception 'No verified fixture';end if;
 update public.profiles set role='customer' where id=uid;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 set local role authenticated;
 if exists(select 1 from public.orders where customer_id<>uid) then raise exception 'RLS exposes foreign orders';end if;
 if exists(select 1 from public.profiles where id<>uid) then raise exception 'RLS exposes other profiles';end if;
 begin update public.profiles set role='admin' where id=uid;raise exception 'ASSERT: role escalation allowed';exception when insufficient_privilege then null;end;
 begin perform public.teplo_dispatch_courier_roster();raise exception 'ASSERT: buyer accessed roster';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 begin perform public.teplo_venue_order_board();raise exception 'ASSERT: buyer accessed venue';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
 reset role;
end $$;
rollback;
