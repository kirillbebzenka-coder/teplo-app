create or replace function public.teplo_courier_report_issue(p_job_id uuid,p_note text)
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_job public.teplo_pilot_jobs%rowtype; v_note text:=btrim(coalesce(p_note,'')); v_id bigint;
begin
 if v_user is null or not public.has_role(array['courier','admin'])
 or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)
 then raise exception 'Нужен подтверждённый аккаунт курьера';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Доступно только в тестовом режиме';end if;
 if char_length(v_note) not between 5 and 400 then raise exception 'Опиши проблему: от 5 до 400 символов';end if;
 select * into v_job from public.teplo_pilot_jobs where id=p_job_id and is_test and courier_id=v_user for update;
 if not found or v_job.status not in ('assigned','accepted','picked_up') then raise exception 'Активная доставка не найдена';end if;
 select n.id into v_id from public.teplo_dispatch_notes n where n.job_id=p_job_id and n.actor_id=v_user and n.kind='issue' and n.note=v_note and n.created_at>=now()-interval '2 minutes' order by n.id desc limit 1;
 if v_id is not null then return v_id;end if;
 insert into public.teplo_dispatch_notes(job_id,actor_id,kind,note) values(p_job_id,v_user,'issue',v_note) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.teplo_courier_report_issue(uuid,text) from public,anon;
grant execute on function public.teplo_courier_report_issue(uuid,text) to authenticated;
