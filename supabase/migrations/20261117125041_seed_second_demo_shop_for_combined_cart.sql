-- Demo-only second venue used to test a combined cart in TEPLO.
-- No real venue is contacted, no payments are enabled.
do $do$
declare v_shop uuid;
begin
 if exists(select 1 from public.delivery_tariffs where is_enabled) then
  raise exception 'Cannot seed demo venue when real delivery is enabled';
 end if;
 select id into v_shop from public.shops where name='TEPLO TEST 2' limit 1;
 if v_shop is null then
  insert into public.shops(name,address,description,emoji,is_active)
  values('TEPLO TEST 2','Тестовая точка забора №2','Вымышленное заведение для проверки комбинированных заказов. Не принимать настоящие заказы.','','true')
  returning id into v_shop;
 end if;
 if not exists(select 1 from public.products where shop_id=v_shop and name='Тестовый напиток') then
  insert into public.products(shop_id,name,description,price,emoji,is_available)
  values(v_shop,'Тестовый напиток','Демо-товар. Не продаётся и не доставляется.',35,'',true);
 end if;
end;
$do$;