CREATE OR REPLACE FUNCTION public.teplo_pilot_list_slots()
 RETURNS TABLE(id uuid, slot_start timestamp with time zone, slot_end timestamp with time zone, capacity integer, is_open boolean, booked integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());
begin
 if v_user is null or not public.has_role(array['admin','dispatcher','venue','courier'])
   or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null)
 then raise exception 'Доступ только сотрудникам TEPLO';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled)
 then raise exception 'Пилот отключён при реальной доставке';end if;
 insert into public.teplo_pilot_slots(slot_start,slot_end,capacity)
 select (((now() at time zone 'Europe/Kyiv')::date+d.day_no+time '10:00'
       +i.slot_no*interval '90 minutes') at time zone 'Europe/Kyiv'),
        (((now() at time zone 'Europe/Kyiv')::date+d.day_no+time '10:00'
       +(i.slot_no+1)*interval '90 minutes') at time zone 'Europe/Kyiv'),4
 from generate_series(0,6) as d(day_no)
 cross join generate_series(0,6) as i(slot_no)
 on conflict on constraint teplo_pilot_slots_slot_start_key do nothing;
 return query select s.id,s.slot_start,s.slot_end,s.capacity,s.is_open,
   (select count(*)::integer from public.teplo_pilot_jobs j
    where j.slot_id=s.id and j.status<>'cancelled')
 from public.teplo_pilot_slots s
 where s.slot_end>now() and s.slot_start<now()+interval '8 days'
 order by s.slot_start;
end;$function$
;