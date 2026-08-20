-- v1.13.0 — تسهيلات الاستخدام: مدن ← أحياء ← شوارع/علامات مميزة + مشاوير بأسعار
-- وإصلاح: منح صلاحيات جداول places و route_prices (أُنشئت في v1.12.0 بدون grants)

grant select on public.places to authenticated;
grant insert, update, delete on public.places to authenticated;
grant select on public.route_prices to authenticated;
grant insert, update, delete on public.route_prices to authenticated;
-- ملاحظة: سياسات RLS تقيّد الكتابة للأدمن فقط رغم منح الصلاحية

-- المدن
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.cities enable row level security;
create policy cities_select on public.cities for select to authenticated using (true);
create policy cities_admin_all on public.cities for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant select on public.cities to authenticated;
grant insert, update, delete on public.cities to authenticated;

-- الأحياء — مرتبطة بمدينة إجباريًا
create table if not exists public.districts (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (city_id, name)
);
alter table public.districts enable row level security;
create policy districts_select on public.districts for select to authenticated using (true);
create policy districts_admin_all on public.districts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant select on public.districts to authenticated;
grant insert, update, delete on public.districts to authenticated;

-- الشوارع/العلامات: ربط اختياري بحي (عند حذف الحي يبقى المكان بلا حي)
alter table public.places add column if not exists district_id uuid references public.districts(id) on delete set null;

-- المشاوير: اسم اختياري + ملاحظات
alter table public.route_prices
  add column if not exists name text,
  add column if not exists notes text;

notify pgrst,'reload schema';
