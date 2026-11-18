create function public.teplo_buyer_order_progress() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 if uid is null then raise exception 'Необходим вход';end if;
 return coalesce((select jsonb_agg(to_jsonb(progress)) from (
  select o.id as order_id,coalesce(j.status,o.demo_status) as state,
   case
    when j.status='new' then 'Заказ в очереди курьеров. Ждём принятия'
    when j.status='assigned' then 'Курьер назначен. Ждём его подтверждения'
    when j.status='accepted' then 'Курьер принял заказ и готовится забрать'
    when j.status='picked_up' then 'Курьер забрал заказ и едет к получателю'
    when j.status='delivered' or (j.id is null and o.demo_status='delivered') then 'Доставка завершена'
    when j.status='cancelled' or o.status='cancelled' then 'Доставка отменена'
    when a.state in ('waiting','error') then a.reason
    when exists(select 1 from public.teplo_order_venue_tasks t where t.order_id=o.id and t.state='issue') then 'Заведение сообщило о проблеме. Диспетчер разбирается'
    when exists(select 1 from public.teplo_order_venue_tasks t where t.order_id=o.id and (t.state<>'confirmed' or t.ready_at is null)) then 'Ждём подтверждения и времени готовности от заведений'
    else 'Заказ подтверждён. Подбираем слот доставки'
   end as message
  from public.orders o left join public.teplo_pilot_jobs j on j.source_order_id=o.id
  left join public.teplo_auto_dispatch_state a on a.order_id=o.id
  where o.customer_id=uid and o.is_test order by o.created_at desc limit 30
 ) progress),'[]'::jsonb);
end;$$;
revoke all on function public.teplo_buyer_order_progress() from public,anon;
grant execute on function public.teplo_buyer_order_progress() to authenticated;
