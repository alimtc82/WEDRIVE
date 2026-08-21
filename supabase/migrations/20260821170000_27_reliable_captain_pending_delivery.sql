-- Keep pending-trip delivery callable by authenticated captains while the
-- private implementation remains responsible for validating auth.uid(), role,
-- approval and online status.
create or replace function public.pending_trips_for_captain()
returns table(
  trip_id uuid,
  pickup_address text,
  dropoff_address text,
  distance_km numeric,
  price numeric,
  kind public.trip_kind,
  requested_at timestamptz,
  customer_name text,
  customer_avatar text,
  customer_rating numeric,
  customer_rating_count integer,
  customer_trips_count integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select * from private.pending_trips_for_captain_impl();
$$;

revoke all on function public.pending_trips_for_captain() from public, anon;
grant execute on function public.pending_trips_for_captain() to authenticated;
