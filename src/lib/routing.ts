import { Capacitor, CapacitorHttp } from "@capacitor/core";

// يجلب مسار الطريق الحقيقي بين نقطتين من OSRM (مجاني)
// مع تحويل للخط المستقيم تلقائيًا لو فشل الطلب أو انتهت المهلة
// على iOS يستخدم CapacitorHttp (طلب native) لتجاوز قيود WebView التي كانت تمنع ظهور المسار
export type Coord = [number, number]; // [lng, lat]

export async function fetchRoute(from: Coord, to: Coord): Promise<Coord[]> {
  const straight: Coord[] = [from, to];
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?overview=full&geometries=geojson`;
  try {
    let coords: unknown;
    if (Capacitor.isNativePlatform()) {
      // طلب native يتجاوز CORS ومشاكل fetch داخل WKWebView + مهلة واضحة
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: 8000,
        readTimeout: 8000,
      });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      coords = data?.routes?.[0]?.geometry?.coordinates;
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000); // مهلة 8 ثوانٍ كحد أقصى
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return straight;
        const data = await res.json();
        coords = data?.routes?.[0]?.geometry?.coordinates;
      } finally {
        clearTimeout(timer);
      }
    }
    if (Array.isArray(coords) && coords.length > 1) {
      return coords as Coord[];
    }
    return straight;
  } catch {
    return straight; // fallback عند أي خطأ أو انتهاء مهلة
  }
}
