-- Route authenticated database event messages to Edge Function event endpoint.
CREATE OR REPLACE FUNCTION public.teplo_push_queue_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   url:='https://bgtegxdekqsajttkhhrj.supabase.co/functions/v1/teplo-push/event',
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
end;$function$
;