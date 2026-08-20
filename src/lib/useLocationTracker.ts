import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { shouldSendLocation, type LocationSample } from "./locationPolicy";

export interface LocationStatus {
  ok: boolean;
  error: string | null;
}

// يتتبّع موقع الكابتن ويحدّثه في قاعدة البيانات حسب المهلة المحددة طالما هو متصل
// intervalSec = 0 يعني بث حي (كل تحديث GPS يُرسل)
export function useLocationTracker(active: boolean, intervalSec = 30): LocationStatus {
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef<number>(0);
  const lastLocation = useRef<LocationSample | null>(null);
  const requestInFlight = useRef(false);
  const [status, setStatus] = useState<LocationStatus>({ ok: false, error: null });

  useEffect(() => {
    if (!active) { setStatus({ ok: false, error: null }); return; }
    if (!("geolocation" in navigator)) {
      setStatus({ ok: false, error: "المتصفح لا يدعم تحديد الموقع" });
      return;
    }
    const minGap = Math.max(0, intervalSec) * 1000;

    let disposed = false;

    const push = async (pos: GeolocationPosition) => {
      const sample: LocationSample = {
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
        accuracy: pos.coords.accuracy,
        capturedAt: Date.now(),
      };
      if (!shouldSendLocation(sample, lastLocation.current, lastSent.current, minGap, requestInFlight.current)) return;

      requestInFlight.current = true;
      try {
        const { error } = await supabase.rpc("update_my_location", { p_lng: sample.lng, p_lat: sample.lat });
        if (disposed) return;
        if (error) {
          setStatus({ ok: false, error: "تعذّر حفظ الموقع: " + error.message });
        } else {
          lastLocation.current = sample;
          lastSent.current = sample.capturedAt;
          setStatus({ ok: true, error: null });
        }
      } finally {
        requestInFlight.current = false;
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
      push,
      onError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    // راقب الموقع، وأرسل كل 30 ثانية كحد أقصى
    watchRef.current = navigator.geolocation.watchPosition(
      push,
      onError,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
    );

    return () => {
      disposed = true;
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [active, intervalSec]);

  return status;
}
