create or replace function public.calc_fare(p_distance_km numeric, p_kind public.trip_kind)
returns table(price numeric, price_per_km numeric)
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  s public.settings%rowtype;
  ppk numeric;
  raw numeric;
  base_price numeric;
begin
  if p_distance_km is null or p_distance_km <= 0 or p_distance_km > 2000 then
    raise exception 'مسافة الرحلة غير صالحة';
  end if;
  if p_kind is null then raise exception 'نوع الرحلة مطلوب'; end if;

  select * into s from public.settings where id = true;
  if not found then raise exception 'إعدادات التسعير غير موجودة'; end if;

  ppk := case when p_kind = 'intercity'::public.trip_kind
              then s.price_per_km_intercity else s.price_per_km_in_city end;
  raw := round(p_distance_km * ppk, 2);
  base_price := greatest(raw, s.min_fare);

  -- Cash-change rule: always drop the remainder to the nearest 5 EGP.
  -- 42 -> 40, 47 -> 45, 49 -> 45, 45 -> 45.
  base_price := floor(base_price / 5) * 5;

  return query select base_price, ppk;
end;
$function$;
