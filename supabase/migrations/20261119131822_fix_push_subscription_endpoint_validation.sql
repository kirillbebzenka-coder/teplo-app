CREATE OR REPLACE FUNCTION public.teplo_push_save_subscription(p_subscription jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=(select auth.uid()); ep text; k jsonb;
begin
 if uid is null or not public.has_role(array['admin','dispatcher','courier'])
    or not exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null)
 then raise exception 'Подтверди роль сотрудника';end if;
 if p_subscription is null or jsonb_typeof(p_subscription)<>'object'
 then raise exception 'Подписка недействительна';end if;
 ep:=p_subscription->>'endpoint';k:=p_subscription->'keys';
 if ep is null or length(ep) not between 20 and 1800 or
   ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|[^/]+[.]push[.]apple[.]com|[^/]+[.]notify[.]windows[.]com)/'
   or jsonb_typeof(k)<>'object'
   or length(coalesce(k->>'p256dh','')) not between 40 and 300
   or length(coalesce(k->>'auth','')) not between 16 and 100
   or octet_length(p_subscription::text)>=8000
 then raise exception 'Браузер вернул неподдерживаемую push-подписку';end if;
 insert into public.teplo_push_subscriptions(endpoint,user_id,payload,updated_at)
 values(ep,uid,p_subscription,now())
 on conflict(endpoint) do update
 set user_id=excluded.user_id,payload=excluded.payload,updated_at=now();
end;$function$
;