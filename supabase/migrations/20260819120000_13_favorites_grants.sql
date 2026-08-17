-- v1.10.1 — منح صلاحيات جدول المفضلة للمستخدمين الموثقين
grant select, insert, delete on public.favorite_trips to authenticated;
