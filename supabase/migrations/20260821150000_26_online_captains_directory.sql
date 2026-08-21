-- Reliable captain presence plus a paginated admin directory.
alter table public.captains
  add column if not exists last_seen_at timestamptz;

update public.captains
set last_seen_at = location_updated_at
where last_seen_at is null and is_online = true;

create index if not exists captains_online_last_seen_idx
  on public.captains (last_seen_at desc)
  where is_online = true;

create or replace function public.captain_presence_heartbeat(p_online boolean default true)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  update public.captains
  set is_online = coalesce(p_online, true),
      last_seen_at = clock_timestamp()
  where id = (select auth.uid())
    and status = 'approved'::public.captain_status;

  if not found then
    raise exception 'حساب الكابتن غير متاح';
  end if;
end;
$$;

revoke all on function public.captain_presence_heartbeat(boolean) from public, anon;
grant execute on function public.captain_presence_heartbeat(boolean) to authenticated;
grant update(last_seen_at) on public.captains to authenticated;

create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v json;
begin
  if not private.is_admin() then raise exception 'غير مصرح'; end if;

  select json_build_object(
    'captains_approved', (select count(*) from public.captains where status = 'approved'::public.captain_status),
    'captains_online',   (select count(*) from public.captains where is_online = true and status = 'approved'::public.captain_status and last_seen_at >= now() - interval '3 minutes'),
    'trips_pending',     (select count(*) from public.trips where status = 'pending'::public.trip_status),
    'trips_ongoing',     (select count(*) from public.trips where status in ('accepted','arrived','in_progress')),
    'trips_completed',   (select count(*) from public.trips where status = 'completed'::public.trip_status)
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_online_captains()
returns table (
  id uuid, full_name text, phone text, in_trip boolean, trips_done integer,
  total_collected numeric, company_share numeric, total_paid numeric, amount_due numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_fee numeric;
begin
  if not private.is_admin() then raise exception 'غير مصرح'; end if;
  select s.service_fee_percent into v_fee from public.settings s where s.id = true;

  return query
  select
    c.id, p.full_name, p.phone,
    exists(select 1 from public.trips t where t.captain_id = c.id and t.status in ('accepted','arrived','in_progress')),
    (select count(*)::int from public.trips t where t.captain_id = c.id and t.status = 'completed'),
    coalesce((select sum(t.price) from public.trips t where t.captain_id = c.id and t.status = 'completed'), 0),
    round(coalesce((select sum(t.price) from public.trips t where t.captain_id = c.id and t.status = 'completed'), 0) * coalesce(v_fee, 0) / 100, 2),
    coalesce((select sum(s.amount) from public.captain_settlements s where s.captain_id = c.id), 0),
    round(coalesce((select sum(t.price) from public.trips t where t.captain_id = c.id and t.status = 'completed'), 0) * coalesce(v_fee, 0) / 100, 2)
      - coalesce((select sum(s.amount) from public.captain_settlements s where s.captain_id = c.id), 0)
  from public.captains c
  join public.profiles p on p.id = c.id
  where c.is_online = true
    and c.status = 'approved'::public.captain_status
    and c.last_seen_at >= now() - interval '3 minutes'
  order by p.full_name;
end;
$$;

create or replace function public.admin_online_captains_page(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 20);
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_result jsonb;
begin
  if not private.is_admin() then raise exception 'غير مصرح'; end if;

  with filtered as (
    select
      c.id, p.full_name, p.phone, c.vehicle_plate, c.vehicle_type,
      c.rating_avg, c.trips_count, c.last_seen_at,
      exists(
        select 1 from public.trips active_trip
        where active_trip.captain_id = c.id
          and active_trip.status in ('accepted','arrived','in_progress')
      ) as in_trip
    from public.captains c
    join public.profiles p on p.id = c.id
    where c.is_online = true
      and c.status = 'approved'::public.captain_status
      and c.last_seen_at >= now() - interval '3 minutes'
      and (
        v_query = ''
        or lower(coalesce(p.full_name, '')) ilike '%' || v_query || '%'
        or (v_digits <> '' and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') ilike '%' || v_digits || '%')
        or lower(regexp_replace(coalesce(c.vehicle_plate, ''), '[[:space:]-]', '', 'g')) ilike '%' || lower(regexp_replace(v_query, '[[:space:]-]', '', 'g')) || '%'
      )
  ), paged as (
    select * from filtered
    order by in_trip desc, full_name
    limit v_page_size offset (v_page - 1) * v_page_size
  ), enriched as (
    select
      pc.*,
      coalesce(fin.trips_done, 0) as trips_done,
      coalesce(fin.total_collected, 0) as total_collected,
      round(coalesce(fin.total_collected, 0) * coalesce(cfg.service_fee_percent, 0) / 100, 2) as company_share,
      coalesce(pay.total_paid, 0) as total_paid,
      round(coalesce(fin.total_collected, 0) * coalesce(cfg.service_fee_percent, 0) / 100, 2) - coalesce(pay.total_paid, 0) as amount_due
    from paged pc
    left join lateral (
      select count(*)::int as trips_done, coalesce(sum(t.price), 0) as total_collected
      from public.trips t
      where t.captain_id = pc.id and t.status = 'completed'
    ) fin on true
    left join lateral (
      select coalesce(sum(cs.amount), 0) as total_paid
      from public.captain_settlements cs
      where cs.captain_id = pc.id
    ) pay on true
    left join public.settings cfg on cfg.id = true
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(e) order by e.in_trip desc, e.full_name) from enriched e), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', v_page,
    'page_size', v_page_size
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_online_captains_page(text, integer, integer) from public, anon;
grant execute on function public.admin_online_captains_page(text, integer, integer) to authenticated;
