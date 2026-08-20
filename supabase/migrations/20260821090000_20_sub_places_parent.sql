-- ربط مكان بمكان أب (شارع / علامة رئيسية) — لإضافة محلات وعمارات ومساجد داخل شارع
alter table public.places
  add column if not exists parent_place_id uuid references public.places(id) on delete set null;

create index if not exists places_parent_idx on public.places(parent_place_id);

-- تحديث البحث: يشمل اسم المكان الأب ويعرضه في النتيجة
drop function if exists public.search_places(text);

create function public.search_places(p_query text)
returns table(id uuid, name text, lat double precision, lng double precision,
              district_name text, city_name text, parent_name text)
language sql stable
set search_path to 'pg_catalog'
as $$
  select p.id, p.name, p.lat, p.lng,
         d.name as district_name, c.name as city_name, pp.name as parent_name
  from public.places p
  left join public.districts d on d.id = p.district_id
  left join public.cities c on c.id = d.city_id
  left join public.places pp on pp.id = p.parent_place_id
  where p.is_active = true
    and (
      btrim(coalesce(p_query,'')) = ''
      or private.norm_ar(p.name) ilike '%' || private.norm_ar(btrim(p_query)) || '%'
      or private.norm_ar(coalesce(pp.name,'')) ilike '%' || private.norm_ar(btrim(p_query)) || '%'
      or private.norm_ar(coalesce(d.name,'')) ilike '%' || private.norm_ar(btrim(p_query)) || '%'
    )
  order by
    case when private.norm_ar(p.name) ilike private.norm_ar(btrim(p_query)) || '%' then 0
         when p.parent_place_id is null then 1 else 2 end,
    p.name
  limit 10;
$$;

grant execute on function public.search_places(text) to authenticated;
notify pgrst, 'reload schema';
