-- Narrow RPC projection: a venue sees only its own item lines, no buyer contact details.
create function public.teplo_venue_order_board() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); staff boolean;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
 then raise exception 'Нужен подтверждённый аккаунт';end if;
 staff:=public.has_role(array['admin','dispatcher']);
 if not staff and not public.has_role(array['venue']) then raise exception 'Доступ только сотруднику заведения';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Доступно только в тестовом режиме';end if;
 return coalesce((select jsonb_agg(to_jsonb(board) order by board.created_at desc) from (
  select t.order_id,t.shop_id,t.shop_name_snapshot,t.state,t.ready_at,t.operator_note,t.updated_at,o.created_at,
   (select j.status from public.teplo_pilot_jobs j where j.source_order_id=o.id limit 1) as delivery_status,
   (select coalesce(jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'quantity',i.quantity,'total',i.line_total)),'[]'::jsonb)
    from public.order_items i where i.order_id=t.order_id and i.shop_id=t.shop_id) as items
  from public.teplo_order_venue_tasks t join public.orders o on o.id=t.order_id
  where o.is_test and (staff or exists(select 1 from public.shop_members m where m.shop_id=t.shop_id and m.user_id=uid))
  order by o.created_at desc,t.shop_id limit 100
 ) board),'[]'::jsonb);
end;$$;
create function public.teplo_venue_respond(p_order_id uuid,p_shop_id uuid,p_action text,p_ready_minutes integer default 20,p_note text default '')
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); current_task public.teplo_order_venue_tasks%rowtype; previous text;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
 then raise exception 'Нужен подтверждённый аккаунт';end if;
 if not public.has_role(array['admin','dispatcher']) and not (
  public.has_role(array['venue']) and exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=uid)
 ) then raise exception 'Нет доступа к этому заведению';end if;
 if exists(select 1 from public.delivery_tariffs where is_enabled) then raise exception 'Доступно только в тестовом режиме';end if;
 if p_action is null or p_action not in ('confirmed','issue') then raise exception 'Неизвестное действие';end if;
 if char_length(coalesce(p_note,''))>400 then raise exception 'Комментарий: максимум 400 символов';end if;
 if p_action='confirmed' and (p_ready_minutes is null or p_ready_minutes not between 0 and 180)
 then raise exception 'Время готовности: 0–180 минут';end if;
 if p_action='issue' and char_length(btrim(coalesce(p_note,'')))<5 then raise exception 'Опиши проблему: минимум 5 символов';end if;
 -- Same order lock as dispatcher handoff; confirmations cannot race with courier creation.
 perform 1 from public.orders where id=p_order_id and is_test and coalesce(demo_status,'pending') not in ('delivered','cancelled') for update;
 if not found then raise exception 'Тестовый заказ не найден';end if;
 if exists(select 1 from public.teplo_pilot_jobs where source_order_id=p_order_id)
 then raise exception 'Заказ уже передан курьерам. Свяжись с диспетчером';end if;
 select * into current_task from public.teplo_order_venue_tasks where order_id=p_order_id and shop_id=p_shop_id for update;
 if not found then raise exception 'Часть заказа не найдена';end if;
 previous:=current_task.state;
 update public.teplo_order_venue_tasks set state=p_action,
 ready_at=case when p_action='confirmed' then now()+p_ready_minutes*interval '1 minute' else null end,
 operator_note=btrim(coalesce(p_note,'')),updated_at=now(),updated_by=uid
 where order_id=p_order_id and shop_id=p_shop_id;
 if not exists(select 1 from public.teplo_order_venue_tasks where order_id=p_order_id and (state<>'confirmed' or ready_at is null)) then
  update public.orders set demo_status='confirmed',updated_at=now() where id=p_order_id;
 else
  update public.orders set demo_status='pending',updated_at=now() where id=p_order_id;
 end if;
 insert into public.order_events(order_id,actor_id,old_status,new_status,note)
 values(p_order_id,uid,previous,p_action,'Заведение: '||current_task.shop_name_snapshot||'; '||
  case when p_action='confirmed' then 'готовность через '||p_ready_minutes||' мин' else 'проблема: '||btrim(p_note) end);
 return p_action;
end;$$;
revoke all on function public.teplo_venue_order_board() from public,anon;
revoke all on function public.teplo_venue_respond(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.teplo_venue_order_board() to authenticated;
grant execute on function public.teplo_venue_respond(uuid,uuid,text,integer,text) to authenticated;
