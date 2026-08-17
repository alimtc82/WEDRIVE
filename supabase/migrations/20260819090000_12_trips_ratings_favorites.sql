-- v1.10.0 — شاشات رحلاتي/تقييماتي + المفضلة + تقييمات الأدمن

-- جدول الرحلات المفضلة للعميل
create table if not exists public.favorite_trips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  pickup_location geography(Point,4326),
  pickup_address text,
  dropoff_location geography(Point,4326),
  dropoff_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  created_at timestamptz not null default now()
);
alter table public.favorite_trips enable row level security;
create policy fav_select_own on public.favorite_trips for select to authenticated using (customer_id = auth.uid());
create policy fav_insert_own on public.favorite_trips for insert to authenticated with check (customer_id = auth.uid());
create policy fav_delete_own on public.favorite_trips for delete to authenticated using (customer_id = auth.uid());

-- قائمة رحلاتي (عميل أو كابتن)
create or replace function public.my_trips_list(
  p_from date, p_to date, p_kind text default null,
  p_limit int default 20, p_offset int default 0
) returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  return json_build_object(
    'total', (select count(*) from trips t
              where (t.customer_id = v_uid or t.captain_id = v_uid)
                and t.requested_at >= p_from and t.requested_at < p_to + 1
                and (p_kind is null or t.kind::text = p_kind)),
    'rows', coalesce((
      select json_agg(r order by r.requested_at desc) from (
        select t.id, t.status::text as status, t.kind::text as kind,
          t.pickup_address, t.dropoff_address,
          st_x(t.pickup_location::geometry) as pickup_lng,
          st_y(t.pickup_location::geometry) as pickup_lat,
          st_x(t.dropoff_location::geometry) as dropoff_lng,
          st_y(t.dropoff_location::geometry) as dropoff_lat,
          t.distance_km, t.price, t.requested_at, t.completed_at,
          (t.customer_id = v_uid) as is_customer,
          case when t.customer_id = v_uid
               then (select p.full_name from profiles p where p.id = t.captain_id)
               else (select p.full_name from profiles p where p.id = t.customer_id)
          end as other_name
        from trips t
        where (t.customer_id = v_uid or t.captain_id = v_uid)
          and t.requested_at >= p_from and t.requested_at < p_to + 1
          and (p_kind is null or t.kind::text = p_kind)
        order by t.requested_at desc
        limit p_limit offset p_offset
      ) r), '[]'::json)
  );
end $$;
grant execute on function public.my_trips_list(date, date, text, int, int) to authenticated;

-- قائمة تقييماتي
create or replace function public.my_ratings_list(
  p_from date, p_to date, p_kind text default null,
  p_limit int default 20, p_offset int default 0
) returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  return json_build_object(
    'avg', (select coalesce(round(avg(r.stars)::numeric, 2), 0) from ratings r join trips t on t.id = r.trip_id
            where r.ratee_id = v_uid and r.created_at >= p_from and r.created_at < p_to + 1
              and (p_kind is null or t.kind::text = p_kind)),
    'total', (select count(*) from ratings r join trips t on t.id = r.trip_id
              where r.ratee_id = v_uid and r.created_at >= p_from and r.created_at < p_to + 1
                and (p_kind is null or t.kind::text = p_kind)),
    'rows', coalesce((
      select json_agg(x order by x.created_at desc) from (
        select r.stars, r.comment, r.created_at, t.kind::text as kind
        from ratings r join trips t on t.id = r.trip_id
        where r.ratee_id = v_uid and r.created_at >= p_from and r.created_at < p_to + 1
          and (p_kind is null or t.kind::text = p_kind)
        order by r.created_at desc
        limit p_limit offset p_offset
      ) x), '[]'::json)
  );
end $$;
grant execute on function public.my_ratings_list(date, date, text, int, int) to authenticated;

-- قائمة كل التقييمات للأدمن
create or replace function public.admin_ratings_list(
  p_from date, p_to date, p_kind text default null,
  p_limit int default 20, p_offset int default 0
) returns json language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'not admin'; end if;
  return json_build_object(
    'avg', (select coalesce(round(avg(r.stars)::numeric, 2), 0) from ratings r join trips t on t.id = r.trip_id
            where r.created_at >= p_from and r.created_at < p_to + 1
              and (p_kind is null or t.kind::text = p_kind)),
    'total', (select count(*) from ratings r join trips t on t.id = r.trip_id
              where r.created_at >= p_from and r.created_at < p_to + 1
                and (p_kind is null or t.kind::text = p_kind)),
    'rows', coalesce((
      select json_agg(x order by x.created_at desc) from (
        select r.stars, r.comment, r.created_at, t.kind::text as kind,
          (select p.full_name from profiles p where p.id = r.rater_id) as rater_name,
          (select p.full_name from profiles p where p.id = r.ratee_id) as ratee_name
        from ratings r join trips t on t.id = r.trip_id
        where r.created_at >= p_from and r.created_at < p_to + 1
          and (p_kind is null or t.kind::text = p_kind)
        order by r.created_at desc
        limit p_limit offset p_offset
      ) x), '[]'::json)
  );
end $$;
grant execute on function public.admin_ratings_list(date, date, text, int, int) to authenticated;
