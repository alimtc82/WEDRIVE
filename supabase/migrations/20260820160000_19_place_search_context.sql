-- v1.13.2 — بحث الأماكن يُرجع اسم الحي والمدينة مع كل نتيجة

drop function if exists public.search_places(text);

create or replace function public.search_places(p_query text)
returns table(id uuid, name text, lat double precision, lng double precision,
              district_name text, city_name text)
language sql stable security invoker set search_path=pg_catalog
as $$
  select p.id, p.name, p.lat, p.lng, d.name as district_name, c.name as city_name
  from public.places p
  left join public.districts d on d.id = p.district_id
  left join public.cities c on c.id = d.city_id
  where p.is_active = true
    and (
      btrim(coalesce(p_query,'')) = ''
      or private.norm_ar(p.name) ilike '%' || private.norm_ar(btrim(p_query)) || '%'
      or private.norm_ar(coalesce(d.name,'')) ilike '%' || private.norm_ar(btrim(p_query)) || '%'
    )
  order by p.name
  limit 8;
$$;
grant execute on function public.search_places(text) to authenticated;

notify pgrst,'reload schema';
