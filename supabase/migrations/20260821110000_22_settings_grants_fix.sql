-- إصلاح صلاحيات جدول الإعدادات (كانت مُسحوبة من ترحيل سابق)
grant select, update on public.settings to authenticated;
notify pgrst, 'reload schema';
