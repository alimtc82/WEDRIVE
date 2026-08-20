-- مفتاح إظهار/إخفاء قائمة المشاوير الثابتة في شاشة العميل
alter table public.settings
  add column if not exists show_fixed_routes boolean not null default true;

-- دالة تعرض للعميل قائمة المشاوير الثابتة مع الإحداثيات (للاختيار السريع)
create or replace function public.list_fixed_routes()
returns table(id uuid, name text,
              from_place_id uuid, from_name text, from_lat double precision, from_lng double precision,
              to_place_id uuid, to_name text, to_lat double precision, to_lng double precision,
              price numeric, reverse_price numeric)
language sql stable security definer
set search_path to 'public'
as $$
  select r.id, r.name,
         fp.id, fp.name, fp.lat, fp.lng,
         tp.id, tp.name, tp.lat, tp.lng,
         r.price, r.reverse_price
  from route_prices r
  join places fp on fp.id = r.from_place_id
  join places tp on tp.id = r.to_place_id
  order by r.created_at desc;
$$;

grant execute on function public.list_fixed_routes() to authenticated;
notify pgrst, 'reload schema';
