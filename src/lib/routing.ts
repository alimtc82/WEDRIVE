import { Capacitor, CapacitorHttp } from "@capacitor/core";

// يجلب مسار قيادة حقيقي عبر الشوارع. لا نرجع خطًا مستقيمًا عند فشل التوجيه
// حتى لا يظهر للمستخدم مسار وهمي وكأنه طريق صالح.
export type Coord = [number, number]; // [lng, lat]

const ROUTERS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
];

async function requestNativeRoute(url: string): Promise<Coord[] | null> {
  try {
    const res = await CapacitorHttp.get({
      url,
      connectTimeout: 7000,
      readTimeout: 7000,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords as Coord[];
  } catch {
    return null;
  }
}

async function requestWebRoute(points: Coord[]): Promise<Coord[] | null> {
  try {
    const qs = encodeURIComponent(points.map((p) => `${p[0]},${p[1]}`).join(";"));
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 10_000);
    try {
      // Same-origin Vercel function: avoids browser CORS/provider differences.
      const res = await fetch(`/api/route?points=${qs}`, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const coords = data?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return coords as Coord[];
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export async function fetchRoute(points: Coord[]): Promise<Coord[]> {
  if (points.length < 2) throw new Error("ROUTE_POINTS_MISSING");

  if (!Capacitor.isNativePlatform()) {
    const route = await requestWebRoute(points);
    if (route) return route;
    throw new Error("ROUTE_UNAVAILABLE");
  }

  const path = points.map((p) => `${p[0]},${p[1]}`).join(";");
  const suffix = `${path}?overview=full&geometries=geojson&steps=false`;
  for (const base of ROUTERS) {
    const route = await requestNativeRoute(base + suffix);
    if (route) return route;
  }

  throw new Error("ROUTE_UNAVAILABLE");
}
