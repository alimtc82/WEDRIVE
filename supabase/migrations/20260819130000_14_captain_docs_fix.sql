-- v1.10.2 — إصلاح حفظ مستندات الكابتن + حدود الصلاحية القصوى

create or replace function public.save_captain_docs(
  p_id_card_front text, p_id_card_back text, p_id_card_expiry date,
  p_vehicle_license_front text, p_vehicle_license_back text, p_vehicle_license_expiry date,
  p_driver_license_front text, p_driver_license_back text, p_driver_license_expiry date,
  p_selfie_photo text default null, p_car_front_photo text default null,
  p_car_back_photo text default null, p_plate_photo text default null
) returns void language plpgsql security definer set search_path = 'public', 'pg_catalog' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;

  if p_id_card_expiry > current_date + interval '7 years' then
    raise exception 'تأكد من تاريخ البطاقة الشخصية';
  end if;
  if p_vehicle_license_expiry > current_date + interval '3 years' then
    raise exception 'تأكد من تاريخ رخصة السيارة';
  end if;
  if p_driver_license_expiry > current_date + interval '10 years' then
    raise exception 'تأكد من تاريخ رخصة القيادة';
  end if;

  insert into public.captains (id) values (v_uid) on conflict (id) do nothing;

  update public.captains set
    id_card_front = p_id_card_front,
    id_card_back = p_id_card_back,
    id_card_expiry = p_id_card_expiry,
    vehicle_license_front = p_vehicle_license_front,
    vehicle_license_back = p_vehicle_license_back,
    vehicle_license_expiry = p_vehicle_license_expiry,
    driver_license_front = p_driver_license_front,
    driver_license_back = p_driver_license_back,
    driver_license_expiry = p_driver_license_expiry,
    selfie_photo = p_selfie_photo,
    car_front_photo = p_car_front_photo,
    car_back_photo = p_car_back_photo,
    plate_photo = p_plate_photo,
    terms_accepted_at = now(),
    status = 'pending'
  where id = v_uid;
end $$;

grant execute on function public.save_captain_docs(text, text, date, text, text, date, text, text, date, text, text, text, text) to authenticated;
