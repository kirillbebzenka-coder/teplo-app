begin;
do $$
declare uid uuid; subscription_fixture jsonb;
begin
 select p.id into uid from public.profiles p join auth.users u on u.id=p.id where p.role='admin' and u.email_confirmed_at is not null limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 subscription_fixture:=jsonb_build_object('endpoint','https://fcm.googleapis.com/teplo-rollback-check','keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22)));
 perform public.teplo_push_save_subscription(subscription_fixture);
 if not exists(select 1 from public.teplo_push_subscriptions where endpoint=subscription_fixture->>'endpoint' and user_id=uid) then raise exception 'Chrome endpoint rejected';end if;
 begin perform public.teplo_push_save_subscription(jsonb_set(subscription_fixture,'{endpoint}','"https://fcm.googleapis.com.evil.invalid/forbidden"'));raise exception 'ASSERT: foreign endpoint accepted';exception when others then if sqlerrm like 'ASSERT:%' then raise;end if;end;
end $$;
rollback;
