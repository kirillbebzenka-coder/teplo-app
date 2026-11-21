-- Additive API only: existing checkout RPCs and stored comments remain intact.
create function public.place_teplo_demo_commented_cart(
 p_items jsonb,p_customer_name text,p_customer_phone text,p_street text,p_house text,
 p_apartment text,p_payment_method text,p_request_id uuid,p_area text,p_customer_comment text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); oid uuid; note text:=btrim(coalesce(p_customer_comment,''));
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null) then raise exception 'Подтверди тестовый аккаунт';end if;
 if p_request_id is null then raise exception 'Отсутствует номер оформления';end if;
 if char_length(note)>500 or translate(note,chr(9)||chr(10)||chr(13),'') ~ '[[:cntrl:]]' then raise exception 'Комментарий: максимум 500 символов, без управляющих знаков';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,68));
 select id into oid from public.orders where customer_id=uid and demo_request_id=p_request_id and is_test;
 if found then return oid;end if;
 oid:=public.place_teplo_demo_zoned_cart(p_items,p_customer_name,p_customer_phone,p_street,p_house,p_apartment,p_payment_method,p_request_id,p_area);
 update public.orders set customer_comment=note where id=oid and customer_id=uid and is_test;
 return oid;
end $$;
revoke all on function public.place_teplo_demo_commented_cart(jsonb,text,text,text,text,text,text,uuid,text,text) from public,anon;
grant execute on function public.place_teplo_demo_commented_cart(jsonb,text,text,text,text,text,text,uuid,text,text) to authenticated;

-- Comments are not exposed in the unassigned courier pool. Read only owned buyer
-- orders, authorized staff deliveries, or a courier's own assigned/history jobs.
create function public.teplo_job_customer_comments(p_job_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); staff boolean; courier boolean;
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null) then raise exception 'Нужен подтверждённый аккаунт';end if;
 if coalesce(cardinality(p_job_ids),0)>200 then raise exception 'Не более 200 доставок за запрос';end if;
 staff:=public.has_role(array['admin','dispatcher']);courier:=public.has_role(array['courier']);
 return coalesce((select jsonb_agg(jsonb_build_object('job_id',j.id,'customer_comment',o.customer_comment))
  from public.teplo_pilot_jobs j join public.orders o on o.id=j.source_order_id
  where j.id=any(coalesce(p_job_ids,'{}'::uuid[])) and
   (staff or o.customer_id=uid or (courier and j.courier_id=uid))),'[]'::jsonb);
end $$;
revoke all on function public.teplo_job_customer_comments(uuid[]) from public,anon;
grant execute on function public.teplo_job_customer_comments(uuid[]) to authenticated;

create or replace function public.teplo_venue_order_board() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); staff boolean;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
 then raise exception 'Нужен подтверждённый аккаунт';end if;
 staff:=public.has_role(array['admin','dispatcher']);
 if not staff and not public.has_role(array['venue']) then raise exception 'Доступ только сотруднику заведения';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Доступно только в тестовом режиме';end if;
 return coalesce((select jsonb_agg(to_jsonb(board) order by board.created_at desc) from (
  select t.order_id,t.shop_id,t.shop_name_snapshot,t.state,t.ready_at,t.operator_note,t.updated_at,o.created_at,o.customer_comment,
   (select j.status from public.teplo_pilot_jobs j where j.source_order_id=o.id limit 1) as delivery_status,
   (select coalesce(jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'quantity',i.quantity,'total',i.line_total)),'[]'::jsonb)
    from public.order_items i where i.order_id=t.order_id and i.shop_id=t.shop_id) as items
  from public.teplo_order_venue_tasks t join public.orders o on o.id=t.order_id
  where o.is_test and (staff or exists(select 1 from public.shop_members m where m.shop_id=t.shop_id and m.user_id=uid))
  order by o.created_at desc,t.shop_id limit 100
 ) board),'[]'::jsonb);
end $$;
