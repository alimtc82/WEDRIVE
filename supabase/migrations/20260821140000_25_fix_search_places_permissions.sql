-- Keep smart place search callable by signed-in customers without exposing
-- the private schema used by administrative database helpers.
create or replace function public.search_places(p_query text)
returns table (
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
security invoker
set search_path = pg_catalog
as $$
  with q as (
    select lower(translate(btrim(coalesce(p_query, '')), 'أإآةىؤئ', 'اااهيوي')) as needle
  )
  select
    p.id,
    p.name,
    p.lat,
    p.lng,
    d.name as district_name,
    c.name as city_name,
    pp.name as parent_name
  from public.places p
  left join public.districts d on d.id = p.district_id
  left join public.cities c on c.id = d.city_id
  left join public.places pp on pp.id = p.parent_place_id
  cross join q
  where p.is_active = true
    and (
      q.needle = ''
      or lower(translate(coalesce(p.name, ''), 'أإآةىؤئ', 'اااهيوي')) ilike '%' || q.needle || '%'
      or lower(translate(coalesce(pp.name, ''), 'أإآةىؤئ', 'اااهيوي')) ilike '%' || q.needle || '%'
      or lower(translate(coalesce(d.name, ''), 'أإآةىؤئ', 'اااهيوي')) ilike '%' || q.needle || '%'
      or lower(translate(coalesce(c.name, ''), 'أإآةىؤئ', 'اااهيوي')) ilike '%' || q.needle || '%'
    )
  order by
    case
      when lower(translate(coalesce(p.name, ''), 'أإآةىؤئ', 'اااهيوي')) = q.needle then 0
      when lower(translate(coalesce(p.name, ''), 'أإآةىؤئ', 'اااهيوي')) like q.needle || '%' then 1
      when lower(translate(coalesce(p.name, ''), 'أإآةىؤئ', 'اااهيوي')) like '%' || q.needle || '%' then 2
      else 3
    end,
    p.name
  limit 12
$$;

revoke all on function public.search_places(text) from public;
revoke all on function public.search_places(text) from anon;
grant execute on function public.search_places(text) to authenticated;
