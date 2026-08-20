-- v1.16.2 — close fixed-route price spoofing and reduce privileged RPC surface.

revoke create on schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;

-- These helpers are evaluated by RLS policies. They expose booleans/roles only.
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_role_of() to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.can_view_captain(uuid) to authenticated;
grant execute on function private.can_view_customer(uuid) to authenticated;

-- The public wrapper is the only authenticated entrypoint. It validates that supplied
-- place IDs are active and that their trusted coordinates match the requested trip.
create or replace function public.create_trip(
 p_pickup_lng double precision,p_pickup_lat double precision,p_pickup_address text,
 p_dropoff_lng double precision,p_dropoff_lat double precision,p_dropoff_address text,
 p_distance_km numeric,p_kind public.trip_kind,p_stops jsonb default '[]'::jsonb,
 p_from_place_id uuid default null,p_to_place_id uuid default null)
returns public.trips language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_from public.places;
 v_to public.places;
 v_pickup public.geography;
 v_dropoff public.geography;
begin
 if (select auth.uid()) is null then raise exception 'يجب تسجيل الدخول'; end if;
 if (p_from_place_id is null) <> (p_to_place_id is null) then
  raise exception 'يجب تحديد مكانَي المسار الثابت معًا';
 end if;

 if p_from_place_id is not null then
  select * into v_from from public.places
   where id=p_from_place_id and is_active=true;
  select * into v_to from public.places
   where id=p_to_place_id and is_active=true;
  if v_from.id is null or v_to.id is null or v_from.id=v_to.id then
   raise exception 'المسار الثابت غير صالح';
  end if;

  v_pickup:=public.st_setsrid(public.st_makepoint(p_pickup_lng,p_pickup_lat),4326)::public.geography;
  v_dropoff:=public.st_setsrid(public.st_makepoint(p_dropoff_lng,p_dropoff_lat),4326)::public.geography;
  if not public.st_dwithin(
    v_pickup,
    public.st_setsrid(public.st_makepoint(v_from.lng,v_from.lat),4326)::public.geography,
    150
  ) or not public.st_dwithin(
    v_dropoff,
    public.st_setsrid(public.st_makepoint(v_to.lng,v_to.lat),4326)::public.geography,
    150
  ) then
   raise exception 'إحداثيات الرحلة لا تطابق المسار الثابت';
  end if;
 end if;

 return private.create_trip_impl(
  p_pickup_lng,p_pickup_lat,p_pickup_address,
  p_dropoff_lng,p_dropoff_lat,p_dropoff_address,
  p_distance_km,p_kind,p_stops,p_from_place_id,p_to_place_id
 );
end;
$$;

create or replace function public.accept_trip(p_trip_id uuid)
returns public.trips language sql security definer set search_path=pg_catalog
as $$ select private.accept_trip_impl(p_trip_id); $$;

create or replace function public.admin_set_user_access(
 p_user_id uuid,p_role public.user_role,p_is_active boolean)
returns public.profiles language sql security definer set search_path=pg_catalog
as $$ select private.admin_set_user_access_impl(p_user_id,p_role,p_is_active); $$;

revoke execute on function public.create_trip(
 double precision,double precision,text,double precision,double precision,text,
 numeric,public.trip_kind,jsonb,uuid,uuid) from public,anon;
grant execute on function public.create_trip(
 double precision,double precision,text,double precision,double precision,text,
 numeric,public.trip_kind,jsonb,uuid,uuid) to authenticated;
revoke execute on function public.accept_trip(uuid) from public,anon;
grant execute on function public.accept_trip(uuid) to authenticated;
revoke execute on function public.admin_set_user_access(uuid,public.user_role,boolean) from public,anon;
grant execute on function public.admin_set_user_access(uuid,public.user_role,boolean) to authenticated;

-- Captain documents must belong to the signed-in captain's private folder.
create or replace function public.save_captain_docs(
 p_id_card_front text,p_id_card_back text,p_id_card_expiry date,
 p_vehicle_license_front text,p_vehicle_license_back text,p_vehicle_license_expiry date,
 p_driver_license_front text,p_driver_license_back text,p_driver_license_expiry date,
 p_selfie_photo text default null,p_car_front_photo text default null,
 p_car_back_photo text default null,p_plate_photo text default null)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_path text;
 v_required_paths text[]:=array[
  p_id_card_front,p_id_card_back,p_vehicle_license_front,p_vehicle_license_back,
  p_driver_license_front,p_driver_license_back
 ];
 v_optional_paths text[]:=array[p_selfie_photo,p_car_front_photo,p_car_back_photo,p_plate_photo];
begin
 if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
 if not exists(
  select 1 from public.profiles
  where id=v_uid and role='captain'::public.user_role
 ) then raise exception 'الحساب غير مصرح له برفع مستندات كابتن'; end if;

 if p_id_card_expiry is null or p_id_card_expiry < current_date
    or p_id_card_expiry > current_date + interval '7 years' then
  raise exception 'تأكد من تاريخ البطاقة الشخصية';
 end if;
 if p_vehicle_license_expiry is null or p_vehicle_license_expiry < current_date
    or p_vehicle_license_expiry > current_date + interval '3 years' then
  raise exception 'تأكد من تاريخ رخصة السيارة';
 end if;
 if p_driver_license_expiry is null or p_driver_license_expiry < current_date
    or p_driver_license_expiry > current_date + interval '10 years' then
  raise exception 'تأكد من تاريخ رخصة القيادة';
 end if;

 foreach v_path in array v_required_paths loop
  if nullif(btrim(v_path),'') is null
     or v_path not like v_uid::text || '/%'
     or v_path like '%..%' or length(v_path)>500 then
   raise exception 'مسار مستند الكابتن غير صالح';
  end if;
 end loop;
 foreach v_path in array v_optional_paths loop
  if v_path is not null and (
    nullif(btrim(v_path),'') is null
    or v_path not like v_uid::text || '/%'
    or v_path like '%..%' or length(v_path)>500
  ) then raise exception 'مسار صورة الكابتن غير صالح'; end if;
 end loop;

 insert into public.captains(id) values(v_uid) on conflict(id) do nothing;
 update public.captains set
  id_card_front=p_id_card_front,id_card_back=p_id_card_back,id_card_expiry=p_id_card_expiry,
  vehicle_license_front=p_vehicle_license_front,vehicle_license_back=p_vehicle_license_back,
  vehicle_license_expiry=p_vehicle_license_expiry,driver_license_front=p_driver_license_front,
  driver_license_back=p_driver_license_back,driver_license_expiry=p_driver_license_expiry,
  selfie_photo=p_selfie_photo,car_front_photo=p_car_front_photo,
  car_back_photo=p_car_back_photo,plate_photo=p_plate_photo,
  terms_accepted_at=now(),status='pending'
 where id=v_uid;
end;
$$;

revoke execute on function public.save_captain_docs(
 text,text,date,text,text,date,text,text,date,text,text,text,text) from public,anon;
grant execute on function public.save_captain_docs(
 text,text,date,text,text,date,text,text,date,text,text,text,text) to authenticated;
-- Retire the legacy overload that does not validate all modern document fields.
revoke execute on function public.save_captain_docs(
 text,text,date,text,text,date,text,text,date) from public,anon,authenticated;

-- Scope offer visibility to signed-in trip parties and use one SELECT policy.
drop policy if exists offers_captain_read on public.trip_offers;
drop policy if exists offers_customer_read on public.trip_offers;
create policy offers_parties_read on public.trip_offers for select to authenticated
using(
 captain_id=(select auth.uid()) or exists(
  select 1 from public.trips t
  where t.id=trip_id and t.customer_id=(select auth.uid())
 )
);

-- Avoid duplicate permissive SELECT policies while preserving admin write access.
drop policy if exists places_select_active on public.places;
drop policy if exists places_admin_all on public.places;
create policy places_select_allowed on public.places for select to authenticated
 using(is_active=true or (select private.is_admin()));
create policy places_admin_insert on public.places for insert to authenticated
 with check((select private.is_admin()));
create policy places_admin_update on public.places for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));
create policy places_admin_delete on public.places for delete to authenticated
 using((select private.is_admin()));

drop policy if exists route_prices_select on public.route_prices;
drop policy if exists route_prices_admin_all on public.route_prices;
create policy route_prices_select_allowed on public.route_prices for select to authenticated using(true);
create policy route_prices_admin_insert on public.route_prices for insert to authenticated
 with check((select private.is_admin()));
create policy route_prices_admin_update on public.route_prices for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));
create policy route_prices_admin_delete on public.route_prices for delete to authenticated
 using((select private.is_admin()));

drop policy if exists cities_select on public.cities;
drop policy if exists cities_admin_all on public.cities;
create policy cities_select_allowed on public.cities for select to authenticated using(true);
create policy cities_admin_insert on public.cities for insert to authenticated
 with check((select private.is_admin()));
create policy cities_admin_update on public.cities for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));
create policy cities_admin_delete on public.cities for delete to authenticated
 using((select private.is_admin()));

drop policy if exists districts_select on public.districts;
drop policy if exists districts_admin_all on public.districts;
create policy districts_select_allowed on public.districts for select to authenticated using(true);
create policy districts_admin_insert on public.districts for insert to authenticated
 with check((select private.is_admin()));
create policy districts_admin_update on public.districts for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));
create policy districts_admin_delete on public.districts for delete to authenticated
 using((select private.is_admin()));

drop policy if exists settlements_admin_all on public.captain_settlements;
drop policy if exists settlements_captain_read on public.captain_settlements;
create policy settlements_read_allowed on public.captain_settlements for select to authenticated
 using(captain_id=(select auth.uid()) or (select private.is_admin()));
create policy settlements_admin_insert on public.captain_settlements for insert to authenticated
 with check((select private.is_admin()));
create policy settlements_admin_update on public.captain_settlements for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));
create policy settlements_admin_delete on public.captain_settlements for delete to authenticated
 using((select private.is_admin()));

-- Older privileged listing functions used a writable schema first in search_path.
alter function public.my_trips_list(date,date,text,int,int) set search_path=pg_catalog,public;
alter function public.my_ratings_list(date,date,text,int,int) set search_path=pg_catalog,public;
alter function public.admin_ratings_list(date,date,text,int,int) set search_path=pg_catalog,public;

notify pgrst,'reload schema';
