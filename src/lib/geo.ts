import type { TripKind } from "./types";

export interface LatLng {
  lat: number;
  lng: number;
}

// المسافة المباشرة بين نقطتين بالكيلومتر (معادلة Haversine).
// تُستخدم فقط كمرجع/تحقق، وليس لتسعير الرحلة.
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(h));
  return Math.round(d * 100) / 100;
}

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{ distance?: number }>;
}

async function fetchRouteDistance(baseUrl: string, points: LatLng[]): Promise<number> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/route/v1/driving/${coords}?overview=false&steps=false`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`routing-http-${res.status}`);
    const body = await res.json() as OsrmRouteResponse;
    const meters = body.routes?.[0]?.distance;
    if (body.code !== "Ok" || typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0) {
      throw new Error("routing-no-route");
    }
    return Math.round((meters / 1000) * 100) / 100;
  } finally {
    window.clearTimeout(timer);
  }
}

// مسافة قيادة فعلية على شبكة الطرق. نجرب مزودين مجانيين بالتتابع لزيادة الاعتمادية.
export async function drivingRouteKm(points: LatLng[]): Promise<number> {
  if (points.length < 2) throw new Error("routing-not-enough-points");

  const providers = [
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de/routed-car",
  ];

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      return await fetchRouteDistance(provider, points);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("routing-failed");
}

// تخمين مبدئي لنوع الرحلة: أطول من 30 كم يُعتبر بين المدن (يمكن للعميل تغييره)
export function guessKind(distanceKm: number): TripKind {
  return distanceKm > 30 ? "intercity" : "in_city";
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
