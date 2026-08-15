
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

do $$
declare p record;
begin
  for p in
    select schemaname,tablename,policyname from pg_policies
    where schemaname='public'
      and tablename in ('profiles','captains','customers','settings','trips','ratings')
  loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_rating_insert on public.ratings;
drop trigger if exists trg_trip_completed on public.trips;
drop function if exists public.handle_new_user();
drop function if exists public.on_rating_insert();
drop function if exists public.on_trip_completed();
drop function if exists public.current_role_of();
drop function if exists public.is_admin();
drop function if exists public.nearby_captains(double precision,double precision);

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select exists(
  select 1 from public.profiles
  where id=(select auth.uid()) and role='admin'::public.user_role and is_active=true
 );
$$;

create or replace function private.current_role_of()
returns public.user_role language sql stable security definer set search_path=pg_catalog
as $$
 select role from public.profiles
 where id=(select auth.uid()) and is_active=true;
$$;

create or replace function private.can_view_profile(p_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select p_id=(select auth.uid()) or private.is_admin() or exists(
  select 1 from public.trips t
  where (t.customer_id=(select auth.uid()) and t.captain_id=p_id)
     or (t.captain_id=(select auth.uid()) and t.customer_id=p_id)
 );
$$;

create or replace function private.can_view_captain(p_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select p_id=(select auth.uid()) or private.is_admin() or exists(
  select 1 from public.trips t
  where t.customer_id=(select auth.uid()) and t.captain_id=p_id
 );
$$;

create or replace function private.can_view_customer(p_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select p_id=(select auth.uid()) or private.is_admin() or exists(
  select 1 from public.trips t
  where t.captain_id=(select auth.uid()) and t.customer_id=p_id
 );
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_requested text:=coalesce(new.raw_user_meta_data->>'role','customer');
 v_role public.user_role;
 v_active boolean;
begin
 if v_requested='captain' then
  v_role:='captain'::public.user_role; v_active:=false;
 else
  v_role:='customer'::public.user_role; v_active:=true;
 end if;
 insert into public.profiles(id,role,full_name,phone,is_active)
 values(new.id,v_role,left(coalesce(new.raw_user_meta_data->>'full_name',''),150),
        nullif(left(coalesce(new.raw_user_meta_data->>'phone',''),30),''),v_active);
 if v_role='captain'::public.user_role then
  insert into public.captains(id) values(new.id);
 else
  insert into public.customers(id) values(new.id);
 end if;
 return new;
end;
$$;

create or replace function public.calc_fare(p_distance_km numeric,p_kind public.trip_kind)
returns table(price numeric,price_per_km numeric)
language plpgsql stable security invoker set search_path=pg_catalog
as $$
declare s public.settings%rowtype; ppk numeric; raw numeric;
begin
 if p_distance_km is null or p_distance_km<=0 or p_distance_km>2000 then
  raise exception 'مسافة الرحلة غير صالحة';
 end if;
 if p_kind is null then raise exception 'نوع الرحلة مطلوب'; end if;
 select * into s from public.settings where id=true;
 if not found then raise exception 'إعدادات التسعير غير موجودة'; end if;
 ppk:=case when p_kind='intercity'::public.trip_kind
           then s.price_per_km_intercity else s.price_per_km_in_city end;
 raw:=round(p_distance_km*ppk,2);
 return query select greatest(raw,s.min_fare),ppk;
end;
$$;

create or replace function private.create_trip_impl(
 p_pickup_lng double precision,p_pickup_lat double precision,p_pickup_address text,
 p_dropoff_lng double precision,p_dropoff_lat double precision,p_dropoff_address text,
 p_distance_km numeric,p_kind public.trip_kind)
returns public.trips language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_pickup public.geography; v_dropoff public.geography;
 v_distance numeric; v_fare record; v_trip public.trips;
begin
 if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
 if not exists(
  select 1 from public.profiles p join public.customers c on c.id=p.id
  where p.id=v_uid and p.role='customer'::public.user_role and p.is_active=true
 ) then raise exception 'الحساب غير مصرح له بطلب رحلة'; end if;
 if p_kind is null then raise exception 'نوع الرحلة مطلوب'; end if;
 if p_pickup_lng is null or p_pickup_lat is null
    or p_dropoff_lng is null or p_dropoff_lat is null
    or p_pickup_lat not between -90 and 90 or p_dropoff_lat not between -90 and 90
    or p_pickup_lng not between -180 and 180 or p_dropoff_lng not between -180 and 180
 then raise exception 'إحداثيات الرحلة غير صالحة'; end if;
 if nullif(btrim(p_pickup_address),'') is null or nullif(btrim(p_dropoff_address),'') is null
    or length(p_pickup_address)>500 or length(p_dropoff_address)>500
 then raise exception 'عنوان الانطلاق أو الوصول غير صالح'; end if;
 if exists(
  select 1 from public.trips where customer_id=v_uid
  and status in('pending'::public.trip_status,'accepted'::public.trip_status,
                'arrived'::public.trip_status,'in_progress'::public.trip_status)
 ) then raise exception 'لديك رحلة نشطة بالفعل'; end if;
 v_pickup:=public.st_setsrid(public.st_makepoint(p_pickup_lng,p_pickup_lat),4326)::public.geography;
 v_dropoff:=public.st_setsrid(public.st_makepoint(p_dropoff_lng,p_dropoff_lat),4326)::public.geography;
 v_distance:=round((public.st_distance(v_pickup,v_dropoff)/1000.0)::numeric,2);
 if v_distance<=0 or v_distance>2000 then raise exception 'مسافة الرحلة غير صالحة'; end if;
 select * into v_fare from public.calc_fare(v_distance,p_kind);
 insert into public.trips(customer_id,pickup_location,pickup_address,dropoff_location,
   dropoff_address,distance_km,price,price_per_km_used,kind)
 values(v_uid,v_pickup,btrim(p_pickup_address),v_dropoff,btrim(p_dropoff_address),
   v_distance,v_fare.price,v_fare.price_per_km,p_kind)
 returning * into v_trip;
 return v_trip;
end;
$$;

create or replace function public.create_trip(
 p_pickup_lng double precision,p_pickup_lat double precision,p_pickup_address text,
 p_dropoff_lng double precision,p_dropoff_lat double precision,p_dropoff_address text,
 p_distance_km numeric,p_kind public.trip_kind)
returns public.trips language sql security invoker set search_path=pg_catalog
as $$
 select private.create_trip_impl(p_pickup_lng,p_pickup_lat,p_pickup_address,
  p_dropoff_lng,p_dropoff_lat,p_dropoff_address,p_distance_km,p_kind);
$$;

create or replace function private.accept_trip_impl(p_trip_id uuid)
returns public.trips language plpgsql security definer set search_path=pg_catalog
as $$
declare v_uid uuid:=(select auth.uid()); v_trip public.trips;
begin
 if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
 if not exists(
  select 1 from public.profiles p join public.captains c on c.id=p.id
  where p.id=v_uid and p.role='captain'::public.user_role
    and p.is_active=true and c.is_online=true
 ) then raise exception 'الحساب غير مصرح له بقبول الرحلات'; end if;
 if exists(
  select 1 from public.trips where captain_id=v_uid
  and status in('accepted'::public.trip_status,'arrived'::public.trip_status,
                'in_progress'::public.trip_status)
 ) then raise exception 'لديك رحلة نشطة بالفعل'; end if;
 update public.trips set status='accepted'::public.trip_status,captain_id=v_uid,accepted_at=now()
 where id=p_trip_id and status='pending'::public.trip_status returning * into v_trip;
 if v_trip.id is null then raise exception 'الطلب لم يعد متاحًا'; end if;
 return v_trip;
end;
$$;

create or replace function public.accept_trip(p_trip_id uuid)
returns public.trips language sql security invoker set search_path=pg_catalog
as $$ select private.accept_trip_impl(p_trip_id); $$;

create or replace function private.admin_set_user_access_impl(
 p_user_id uuid,p_role public.user_role,p_is_active boolean)
returns public.profiles language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_caller uuid:=(select auth.uid()); v_old public.profiles; v_result public.profiles;
begin
 if not private.is_admin() then raise exception 'غير مصرح'; end if;
 select * into v_old from public.profiles where id=p_user_id;
 if not found then raise exception 'المستخدم غير موجود'; end if;
 if p_user_id=v_caller and (p_role<>'admin'::public.user_role or p_is_active is not true)
 then raise exception 'لا يمكنك إزالة صلاحية حساب المدير الحالي'; end if;
 update public.profiles set role=p_role,is_active=p_is_active,updated_at=now()
 where id=p_user_id returning * into v_result;
 if p_role='captain'::public.user_role then
  insert into public.captains(id) values(p_user_id) on conflict(id) do nothing;
 elsif p_role='customer'::public.user_role then
  insert into public.customers(id) values(p_user_id) on conflict(id) do nothing;
 end if;
 return v_result;
end;
$$;

create or replace function public.admin_set_user_access(
 p_user_id uuid,p_role public.user_role,p_is_active boolean)
returns public.profiles language sql security invoker set search_path=pg_catalog
as $$ select private.admin_set_user_access_impl(p_user_id,p_role,p_is_active); $$;

create or replace function private.nearby_captains(
 p_pickup_lng double precision,p_pickup_lat double precision)
returns table(captain_id uuid,distance_m double precision)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_radius numeric; v_point public.geography;
begin
 if p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180
 then raise exception 'إحداثيات غير صالحة'; end if;
 select dispatch_radius_km into v_radius from public.settings where id=true;
 v_point:=public.st_setsrid(public.st_makepoint(p_pickup_lng,p_pickup_lat),4326)::public.geography;
 return query select c.id,public.st_distance(c.current_location,v_point)
 from public.captains c join public.profiles p on p.id=c.id
 where c.is_online=true and c.current_location is not null
   and p.role='captain'::public.user_role and p.is_active=true
   and public.st_dwithin(c.current_location,v_point,v_radius*1000)
 order by 2;
end;
$$;

create or replace function private.on_rating_insert()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_role public.user_role; v_avg numeric; v_cnt integer;
begin
 select round(avg(stars)::numeric,2),count(*) into v_avg,v_cnt
 from public.ratings where ratee_id=new.ratee_id;
 select role into v_role from public.profiles where id=new.ratee_id;
 if v_role='captain'::public.user_role then
  update public.captains set rating_avg=v_avg,rating_count=v_cnt where id=new.ratee_id;
 elsif v_role='customer'::public.user_role then
  update public.customers set rating_avg=v_avg,rating_count=v_cnt where id=new.ratee_id;
 end if;
 return new;
end;
$$;

create or replace function private.on_trip_completed()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
 if new.status='completed'::public.trip_status
    and old.status is distinct from 'completed'::public.trip_status then
  update public.customers set trips_count=trips_count+1 where id=new.customer_id;
  update public.captains set trips_count=trips_count+1 where id=new.captain_id;
 end if;
 return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();
create trigger trg_rating_insert after insert on public.ratings
for each row execute function private.on_rating_insert();
create trigger trg_trip_completed after update on public.trips
for each row execute function private.on_trip_completed();

revoke all privileges on all tables in schema public from anon,authenticated;
revoke all privileges on all sequences in schema public from anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;

grant select on public.profiles to authenticated;
grant update(full_name,phone,avatar_url,updated_at) on public.profiles to authenticated;
grant select on public.captains to authenticated;
grant update(is_online,current_location,location_updated_at,vehicle_type,vehicle_plate)
 on public.captains to authenticated;
grant select on public.customers to authenticated;
grant select on public.settings to authenticated;
grant update(price_per_km_in_city,price_per_km_intercity,min_fare,service_fee_percent,
 dispatch_radius_km,dispatch_timeout_sec,updated_by,updated_at)
 on public.settings to authenticated;
grant select on public.trips to authenticated;
grant select,insert on public.ratings to authenticated;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_role_of() to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.can_view_captain(uuid) to authenticated;
grant execute on function private.can_view_customer(uuid) to authenticated;
grant execute on function private.create_trip_impl(
 double precision,double precision,text,double precision,double precision,text,numeric,public.trip_kind)
 to authenticated;
grant execute on function private.accept_trip_impl(uuid) to authenticated;
grant execute on function private.admin_set_user_access_impl(uuid,public.user_role,boolean)
 to authenticated;
grant execute on function public.calc_fare(numeric,public.trip_kind) to authenticated;
grant execute on function public.create_trip(
 double precision,double precision,text,double precision,double precision,text,numeric,public.trip_kind)
 to authenticated;
grant execute on function public.accept_trip(uuid) to authenticated;
grant execute on function public.admin_set_user_access(uuid,public.user_role,boolean)
 to authenticated;

create policy profiles_select_allowed on public.profiles for select to authenticated
using(private.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
using(id=(select auth.uid())) with check(id=(select auth.uid()));

create policy captains_select_allowed on public.captains for select to authenticated
using(private.can_view_captain(id));
create policy captains_update_self on public.captains for update to authenticated
using(id=(select auth.uid()) and (select private.current_role_of())='captain'::public.user_role)
with check(id=(select auth.uid()) and (select private.current_role_of())='captain'::public.user_role);

create policy customers_select_allowed on public.customers for select to authenticated
using(private.can_view_customer(id));
create policy settings_select_active on public.settings for select to authenticated
using((select private.current_role_of()) is not null);
create policy settings_update_admin on public.settings for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

create policy trips_select_allowed on public.trips for select to authenticated
using(
 (select private.current_role_of()) is not null and (
  (select private.is_admin()) or customer_id=(select auth.uid())
  or captain_id=(select auth.uid())
  or (status='pending'::public.trip_status
      and (select private.current_role_of())='captain'::public.user_role)
 )
);

create policy ratings_select_allowed on public.ratings for select to authenticated
using(
 (select private.current_role_of()) is not null and (
  rater_id=(select auth.uid()) or ratee_id=(select auth.uid()) or (select private.is_admin())
 )
);
create policy ratings_insert_trip_party on public.ratings for insert to authenticated
with check(
 rater_id=(select auth.uid()) and (select private.current_role_of()) is not null
 and ratee_id<>rater_id and exists(
  select 1 from public.trips t
  where t.id=trip_id and t.status='completed'::public.trip_status and (
   (t.customer_id=(select auth.uid()) and rater_id=t.customer_id and ratee_id=t.captain_id)
   or
   (t.captain_id=(select auth.uid()) and rater_id=t.captain_id and ratee_id=t.customer_id)
  )
 )
);

do $$
begin
 if not exists(select 1 from pg_constraint where conname='settings_values_valid') then
  alter table public.settings add constraint settings_values_valid check(
   price_per_km_in_city>0 and price_per_km_intercity>0 and min_fare>=0
   and service_fee_percent between 0 and 100 and dispatch_radius_km>0
   and dispatch_timeout_sec between 5 and 600);
 end if;
 if not exists(select 1 from pg_constraint where conname='trips_values_valid') then
  alter table public.trips add constraint trips_values_valid check(
   distance_km>0 and distance_km<=2000 and price>=0 and price_per_km_used>0);
 end if;
end $$;

create index if not exists settings_updated_by_idx on public.settings(updated_by);
create index if not exists ratings_rater_idx on public.ratings(rater_id);
create unique index if not exists trips_one_active_customer_idx on public.trips(customer_id)
where status in('pending'::public.trip_status,'accepted'::public.trip_status,
                'arrived'::public.trip_status,'in_progress'::public.trip_status);
create unique index if not exists trips_one_active_captain_idx on public.trips(captain_id)
where captain_id is not null and status in(
 'accepted'::public.trip_status,'arrived'::public.trip_status,'in_progress'::public.trip_status);

alter default privileges for role postgres in schema public
 revoke select,insert,update,delete,truncate,references,trigger on tables from anon,authenticated;
alter default privileges for role postgres in schema public
 revoke usage,select,update on sequences from anon,authenticated;
alter default privileges for role postgres in schema public
 revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema private
 revoke execute on functions from public,anon,authenticated;

notify pgrst,'reload schema';

