alter table public.places drop constraint if exists places_name_key;
create unique index if not exists places_name_lat_lng_key on public.places (name, lat, lng);
