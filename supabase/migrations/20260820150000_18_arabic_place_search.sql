-- v1.13.1 — بحث عربي متسامح للأماكن: يتجاهل أ/إ/آ و ة/ه و ى/ي و ؤ/ئ

create or replace function private.norm_ar(t text)
returns text language sql immutable parallel safe set search_path=pg_catalog
as $$
  select translate(coalesce(t,''), 'أإآةىؤئ', 'اااهيوي');
$$;

-- بحث موحّد للأماكن يُستخدم في شاشة العميل ولوحة الأدمن
create or replace function public.search_places(p_query text)
returns setof public.places language sql stable security invoker set search_path=pg_catalog
as $$
  select * from public.places
  where is_active = true
    and (
      btrim(coalesce(p_query,'')) = ''
      or private.norm_ar(name) ilike '%' || private.norm_ar(btrim(p_query)) || '%'
    )
  order by name
  limit 8;
$$;
grant execute on function public.search_places(text) to authenticated;

notify pgrst,'reload schema';
