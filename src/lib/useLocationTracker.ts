import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

// يتتبّع موقع الكابتن ويحدّثه في قاعدة البيانات كل 30 ثانية طالما هو متصل
export function useLocationTracker(active: boolean) {
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef<number>(0);

  useEffect(() => {
    if (!active || !("geolocation" in navigator)) return;

    const push = (lng: number, lat: number) => {
      supabase.rpc("update_my_location", { p_lng: lng, p_lat: lat });
      lastSent.current = Date.now();
    };

    // أرسل الموقع فورًا عند الاتصال
    navigator.geolocation.getCurrentPosition(
      (pos) => push(pos.coords.longitude, pos.coords.latitude),
      () => {},
      { enableHighAccuracy: true }
    );

    // راقب الموقع، وأرسل كل 30 ثانية كحد أقصى (تجنّبًا للإفراط)
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent.current >= 30000) {
          push(pos.coords.longitude, pos.coords.latitude);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000 }
    );

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [active]);
}
