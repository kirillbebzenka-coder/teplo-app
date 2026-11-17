CREATE OR REPLACE FUNCTION public.teplo_pilot_open_jobs()
 RETURNS TABLE(id uuid, slot_id uuid, shop_name_snapshot text, shop_address_snapshot text, delivery_address text, order_summary text, ready_in_minutes integer, delivery_fee_uah numeric, courier_reward_uah numeric, slot_start timestamp with time zone, slot_end timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());
begin
 if v_user is null or not public.has_role(array['courier','admin'])
   or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Доступ только курьеру';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён';end if;
 if public.has_role(array['courier']) and not exists(
   select 1 from public.courier_shifts cs where cs.courier_id=v_user and cs.ended_at is null
 ) then
   return;
 end if;
 return query select j.id,j.slot_id,j.shop_name_snapshot,j.shop_address_snapshot,
 j.delivery_address,j.order_summary,j.ready_in_minutes,j.delivery_fee_uah,j.courier_reward_uah,
 s.slot_start,s.slot_end
 from public.teplo_pilot_jobs j join public.teplo_pilot_slots s on s.id=j.slot_id
 where j.is_test and j.status='new' and s.is_open and s.slot_end>now()
 order by s.slot_start,j.created_at limit 120;
end;$function$
;