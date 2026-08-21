-- Restore tolerant in-app place suggestions and include city names in matching.
create or replace function public.search_places(p_query text)
returns table(
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  district_name text,
  city_name text,
  parent_name text
)
language sql
stable
set search_path to 'pg_catalog'
as $$
  with q as (
    select private.norm_ar(btrim(coalesce(p_query, ''))) as needle
  )
  select p.id, p.name, p.lat, p.lng,
         d.name as district_name, c.name as city_name, pp.name as parent_name
  from public.places p
  left join public.districts d on d.id = p.district_id
  left join public.cities c on c.id = d.city_id
  left join public.places pp on pp.id = p.parent_place_id
  cross join q
  where p.is_active = true
    and (
      q.needle = ''
      or private.norm_ar(p.name) ilike '%' || q.needle || '%'
      or private.norm_ar(coalesce(pp.name, '')) ilike '%' || q.needle || '%'
      or private.norm_ar(coalesce(d.name, '')) ilike '%' || q.needle || '%'
      or private.norm_ar(coalesce(c.name, '')) ilike '%' || q.needle || '%'
    )
  order by
    case
      when private.norm_ar(p.name) = q.needle then 0
      when private.norm_ar(p.name) ilike q.needle || '%' then 1
      when private.norm_ar(coalesce(pp.name, '')) ilike q.needle || '%' then 2
      when private.norm_ar(coalesce(d.name, '')) ilike q.needle || '%' then 3
      when private.norm_ar(coalesce(c.name, '')) ilike q.needle || '%' then 4
      else 5
    end,
    case when p.parent_place_id is null then 0 else 1 end,
    p.name
  limit 12;
$$;

revoke execute on function public.search_places(text) from public, anon;
grant execute on function public.search_places(text) to authenticated;

notify pgrst, 'reload schema';
