
-- TEPLO push: user-owned browser subscriptions, server-only VAPID material
-- and database events routed to an authenticated Edge webhook.
create extension if not exists pg_net with schema extensions;

create table public.teplo_push_subscriptions(
 endpoint text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (length(endpoint) between 20 and 1800),
 check (octet_length(payload::text)<8000)
);
create index teplo_push_subscriptions_user_idx on public.teplo_push_subscriptions(user_id);
alter table public.teplo_push_subscriptions enable row level security;
revoke all on public.teplo_push_subscriptions from public,anon,authenticated;
grant select on public.teplo_push_subscriptions to authenticated;
create policy teplo_push_subscription_owner_read
 on public.teplo_push_subscriptions for select to authenticated
 using (user_id=(select auth.uid()));

create or replace function public.teplo_push_save_subscription(p_subscription jsonb)
returns void language plpgsql security definer set search_path to ''
as $fn$
declare uid uuid:=(select auth.uid()); ep text; k jsonb;
begin
 if uid is null or not public.has_role(array['admin','dispatcher','courier'])
    or not exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null)
 then raise exception 'Подтверди роль сотрудника';end if;
 if p_subscription is null or jsonb_typeof(p_subscription)<>'object'
 then raise exception 'Подписка недействительна';end if;
 ep:=p_subscription->>'endpoint';k:=p_subscription->'keys';
 if ep is null or length(ep) not between 20 and 1800 or
   ep !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[^/]+\.push\.apple\.com|[^/]+\.notify\.windows\.com)/'
   or jsonb_typeof(k)<>'object'
   or length(coalesce(k->>'p256dh','')) not between 40 and 300
   or length(coalesce(k->>'auth','')) not between 16 and 100
   or octet_length(p_subscription::text)>=8000
 then raise exception 'Браузер вернул неподдерживаемую push-подписку';end if;
 insert into public.teplo_push_subscriptions(endpoint,user_id,payload,updated_at)
 values(ep,uid,p_subscription,now())
 on conflict(endpoint) do update
 set user_id=excluded.user_id,payload=excluded.payload,updated_at=now();
end;$fn$;

create or replace function public.teplo_push_remove_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path to ''
as $fn$
declare uid uuid:=(select auth.uid());
begin
 if uid is null then raise exception 'Необходим вход';end if;
 delete from public.teplo_push_subscriptions where endpoint=p_endpoint and user_id=uid;
end;$fn$;
revoke execute on function public.teplo_push_save_subscription(jsonb) from public,anon;
revoke execute on function public.teplo_push_remove_subscription(text) from public,anon;
grant execute on function public.teplo_push_save_subscription(jsonb) to authenticated;
grant execute on function public.teplo_push_remove_subscription(text) to authenticated;

-- Never store signing keys or webhook secrets in GitHub or browser assets.
do $fn$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='teplo_push_webhook_key') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'teplo_push_webhook_key');
 end if;
end;$fn$;

create or replace function public.teplo_push_internal_config()
returns jsonb language sql security definer set search_path to ''
as $fn$
 select jsonb_build_object(
  'webhookKey',(select decrypted_secret from vault.decrypted_secrets where name='teplo_push_webhook_key'),
  'vapid',(select decrypted_secret from vault.decrypted_secrets where name='teplo_push_vapid_jwk')
 );
$fn$;
create or replace function public.teplo_push_internal_store_vapid(p_value jsonb)
returns void language plpgsql security definer set search_path to ''
as $fn$
begin
 if p_value is null or p_value->'publicKey' is null or p_value->'privateKey' is null
  or length(p_value::text)>4000 then raise exception 'Invalid VAPID keypair';end if;
 if not exists(select 1 from vault.decrypted_secrets where name='teplo_push_vapid_jwk') then
  perform vault.create_secret(p_value::text,'teplo_push_vapid_jwk');
 end if;
end;$fn$;
revoke all on function public.teplo_push_internal_config() from public,anon,authenticated;
revoke all on function public.teplo_push_internal_store_vapid(jsonb) from public,anon,authenticated;
grant execute on function public.teplo_push_internal_config() to service_role;
grant execute on function public.teplo_push_internal_store_vapid(jsonb) to service_role;

-- pg_net delivers events in the background; the header token is read from Vault,
-- never copied to the migration file. Event payloads contain only event category and id.
create or replace function public.teplo_push_queue_event()
returns trigger language plpgsql security definer set search_path to ''
as $fn$
declare event_type text; target_id uuid; token text;
begin
 if tg_table_name='orders' then
   if tg_op<>'INSERT' or not new.is_test then return new;end if;
   event_type:='buyer_order';target_id:=new.id;
 elsif tg_table_name='teplo_pilot_jobs' then
   if not new.is_test then return new;end if;
   if tg_op='INSERT' then
     event_type:=case when new.source_order_id is null then 'courier_call' else 'courier_pool' end;
     target_id:=new.id;
   elsif tg_op='UPDATE' and new.courier_id is distinct from old.courier_id
       and new.courier_id is not null and new.status in ('assigned','accepted') then
     event_type:='courier_assigned';target_id:=new.id;
   else return new;
   end if;
 else return new;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='teplo_push_webhook_key';
 if token is not null then
  perform net.http_post(
   url:='https://bgtegxdekqsajttkhhrj.supabase.co/functions/v1/teplo-push',
   headers:=jsonb_build_object('Content-Type','application/json','x-teplo-webhook',token),
   body:=jsonb_build_object('type',event_type,'id',target_id),
   timeout_milliseconds:=4500
  );
 end if;
 return new;
exception when others then
 -- Push failure must NEVER fail to create or assign a delivery.
 raise warning 'TEPLO push enqueue failed: %',sqlerrm;
 return new;
end;$fn$;
create trigger teplo_push_new_buyer_order
 after insert on public.orders for each row execute function public.teplo_push_queue_event();
create trigger teplo_push_pilot_job_changes
 after insert or update of courier_id on public.teplo_pilot_jobs
 for each row execute function public.teplo_push_queue_event();
revoke execute on function public.teplo_push_queue_event() from public,anon,authenticated;
