-- v1.11.0 — نقاط توقف متعددة (حتى 3) في الرحلة الواحدة
-- المسافة والسعر يُحسبان على كامل المراحل: انطلاق ← توقفات ← وجهة

alter table public.trips add column if not exists stops jsonb not null default '[]'::jsonb;

drop function if exists public.create_trip(double precision,double precision,text,double precision,double precision,text,numeric,public.trip_kind);
drop function if exists private.create_trip_impl(double precision,double precision,text,double precision,double precision,text,numeric,public.trip_kind);

create or replace function private.create_trip_impl(
 p_pickup_lng double precision,p_pickup_lat double precision,p_pickup_address text,
 p_dropoff_lng double precision,p_dropoff_lat double precision,p_dropoff_address text,
 p_distance_km numeric,p_kind public.trip_kind,p_stops jsonb default '[]'::jsonb)
returns public.trips language plpgsql security definer set search_path=pg_catalog
as $$
declare
 v_uid uuid:=(select auth.uid());
 v_pickup public.geography; v_dropoff public.geography;
 v_distance numeric; v_fare record; v_trip public.trips;
 v_stops jsonb:=coalesce(p_stops,'[]'::jsonb);
 v_count int; v_elem jsonb;
 v_lat double precision; v_lng double precision;
 v_prev public.geography; v_pt public.geography; i int;
 v_clean jsonb:='[]'::jsonb;
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

 -- التحقق من نقاط التوقف وتنقيتها (3 كحد أقصى)
 if jsonb_typeof(v_stops) is distinct from 'array' then
   raise exception 'نقاط التوقف غير صالحة';
 end if;
 v_count:=jsonb_array_length(v_stops);
 if v_count>3 then raise exception 'الحد الأقصى لنقاط التوقف هو 3'; end if;
 for i in 0..v_count-1 loop
   v_elem:=v_stops->i;
   begin
     v_lat:=(v_elem->>'lat')::double precision;
     v_lng:=(v_elem->>'lng')::double precision;
   exception when others then
     raise exception 'إحداثيات نقطة التوقف رقم % غير صالحة', i+1;
   end;
   if v_lat is null or v_lng is null
      or v_lat not between -90 and 90 or v_lng not between -180 and 180
   then raise exception 'إحداثيات نقطة التوقف رقم % غير صالحة', i+1; end if;
   v_clean:=v_clean||jsonb_build_object(
     'lat',v_lat,'lng',v_lng,
     'address',left(coalesce(nullif(btrim(coalesce(v_elem->>'address','')),''),'نقطة توقف '||(i+1)),500));
 end loop;

 v_pickup:=public.st_setsrid(public.st_makepoint(p_pickup_lng,p_pickup_lat),4326)::public.geography;
 v_dropoff:=public.st_setsrid(public.st_makepoint(p_dropoff_lng,p_dropoff_lat),4326)::public.geography;

 -- المسافة = مجموع المراحل: انطلاق ← كل توقف ← وجهة
 v_distance:=0; v_prev:=v_pickup;
 for i in 0..jsonb_array_length(v_clean)-1 loop
   v_elem:=v_clean->i;
   v_pt:=public.st_setsrid(public.st_makepoint(
     (v_elem->>'lng')::double precision,(v_elem->>'lat')::double precision),4326)::public.geography;
   v_distance:=v_distance+public.st_distance(v_prev,v_pt)/1000.0;
   v_prev:=v_pt;
 end loop;
 v_distance:=v_distance+public.st_distance(v_prev,v_dropoff)/1000.0;
 v_distance:=round(v_distance::numeric,2);

 if v_distance<=0 or v_distance>2000 then raise exception 'مسافة الرحلة غير صالحة'; end if;
 select * into v_fare from public.calc_fare(v_distance,p_kind);
 insert into public.trips(customer_id,pickup_location,pickup_address,dropoff_location,
   dropoff_address,distance_km,price,price_per_km_used,kind,stops)
 values(v_uid,v_pickup,btrim(p_pickup_address),v_dropoff,btrim(p_dropoff_address),
   v_distance,v_fare.price,v_fare.price_per_km,p_kind,v_clean)
 returning * into v_trip;
 return v_trip;
end;
$$;

create or replace function public.create_trip(
 p_pickup_lng double precision,p_pickup_lat double precision,p_pickup_address text,
 p_dropoff_lng double precision,p_dropoff_lat double precision,p_dropoff_address text,
 p_distance_km numeric,p_kind public.trip_kind,p_stops jsonb default '[]'::jsonb)
returns public.trips language sql security invoker set search_path=pg_catalog
as $$
 select private.create_trip_impl(p_pickup_lng,p_pickup_lat,p_pickup_address,
   p_dropoff_lng,p_dropoff_lat,p_dropoff_address,p_distance_km,p_kind,p_stops);
$$;

grant execute on function private.create_trip_impl(
 double precision,double precision,text,double precision,double precision,text,numeric,public.trip_kind,jsonb)
 to authenticated;
grant execute on function public.create_trip(
 double precision,double precision,text,double precision,double precision,text,numeric,public.trip_kind,jsonb)
 to authenticated;

notify pgrst,'reload schema';
