alter policy orders_read_participant on public.orders to authenticated using (
 customer_id=(select auth.uid())
 or public.has_role(array['admin','dispatcher'])
 or (public.has_role(array['venue']) and exists(select 1 from public.shop_members sm where sm.shop_id=orders.shop_id and sm.user_id=(select auth.uid())))
 or (public.has_role(array['courier']) and (
  exists(select 1 from public.courier_assignments ca where ca.order_id=orders.id and ca.courier_id=(select auth.uid()))
  or (is_test and exists(select 1 from public.demo_courier_assignments dca where dca.order_id=orders.id and dca.courier_id=(select auth.uid())))
 ))
);