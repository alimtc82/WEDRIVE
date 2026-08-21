import { Capacitor, CapacitorHttp } from "@capacitor/core";

// يجلب مسار قيادة حقيقي عبر الشوارع. لا نرجع خطًا مستقيمًا عند فشل التوجيه
// حتى لا يظهر للمستخدم مسار وهمي وكأنه طريق صالح.
export type Coord = [number, number]; // [lng, lat]

const ROUTERS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
];

async function requestRoute(url: string): Promise<Coord[] | null> {
  try {
    let data: any;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: 7000,
        readTimeout: 7000,
      });
      if (res.status < 200 || res.status >= 300) return null;
      data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } else {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 7000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return null;
        data = await res.json();
      } finally {
        window.clearTimeout(timer);
      }
    }

    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords as Coord[];
  } catch {
    return null;
  }
}

export async function fetchRoute(points: Coord[]): Promise<Coord[]> {
  if (points.length < 2) throw new Error("ROUTE_POINTS_MISSING");

  const path = points.map((p) => `${p[0]},${p[1]}`).join(";");
  const suffix = `${path}?overview=full&geometries=geojson&steps=false`;

  for (const base of ROUTERS) {
    const route = await requestRoute(base + suffix);
    if (route) return route;
  }

  throw new Error("ROUTE_UNAVAILABLE");
}
