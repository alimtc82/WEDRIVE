import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export interface LocationStatus {
  ok: boolean;
  error: string | null;
}

// يتتبّع موقع الكابتن ويحدّثه في قاعدة البيانات كل 30 ثانية طالما هو متصل
export function useLocationTracker(active: boolean): LocationStatus {
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef<number>(0);
  const [status, setStatus] = useState<LocationStatus>({ ok: false, error: null });

  useEffect(() => {
    if (!active) { setStatus({ ok: false, error: null }); return; }
    if (!("geolocation" in navigator)) {
      setStatus({ ok: false, error: "المتصفح لا يدعم تحديد الموقع" });
      return;
    }

    const push = async (lng: number, lat: number) => {
      // حماية: لا ترسل أبدًا قيمًا غير صالحة
      if (
        typeof lng !== "number" || typeof lat !== "number" ||
        Number.isNaN(lng) || Number.isNaN(lat) ||
        lng === 0 || lat === 0
      ) return;

      const { error } = await supabase.rpc("update_my_location", { p_lng: lng, p_lat: lat });
      if (error) {
        setStatus({ ok: false, error: "تعذّر حفظ الموقع: " + error.message });
      } else {
        lastSent.current = Date.now();
        setStatus({ ok: true, error: null });
      }
    };

    const onError = (err: GeolocationPositionError) => {
      let msg = "تعذّر الوصول للموقع";
      if (err.code === err.PERMISSION_DENIED) msg = "تم رفض إذن الموقع — فعّله من إعدادات المتصفح";
      else if (err.code === err.POSITION_UNAVAILABLE) msg = "الموقع غير متاح حاليًا";
      else if (err.code === err.TIMEOUT) msg = "انتهت مهلة تحديد الموقع";
      setStatus({ ok: false, error: msg });
    };

    // أرسل الموقع فورًا عند الاتصال
    navigator.geolocation.getCurrentPosition(
      (pos) => push(pos.coords.longitude, pos.coords.latitude),
      onError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    // راقب الموقع، وأرسل كل 30 ثانية كحد أقصى
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent.current >= 30000) {
          push(pos.coords.longitude, pos.coords.latitude);
        }
      },
      onError,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
    );

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [active]);

  return status;
}
