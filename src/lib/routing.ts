import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type Coord = [number, number]; // [lng, lat]
export interface RouteDetails {
  coordinates: Coord[];
  distanceM: number | null;
  durationSec: number | null;
}

const ROUTERS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
];

function parseRoute(data: any): RouteDetails | null {
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates ?? data?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return {
    coordinates: coords as Coord[],
    distanceM: Number(route?.distance ?? data?.distance_m) || null,
    durationSec: Number(route?.duration ?? data?.duration_s) || null,
  };
}

async function requestNativeRoute(url: string): Promise<RouteDetails | null> {
  try {
    const res = await CapacitorHttp.get({
      url,
      connectTimeout: 7000,
      readTimeout: 7000,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    return parseRoute(data);
  } catch {
    return null;
  }
}

async function requestWebRoute(points: Coord[]): Promise<RouteDetails | null> {
  try {
    const qs = encodeURIComponent(points.map((p) => `${p[0]},${p[1]}`).join(";"));
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(`/api/route?points=${qs}`, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return parseRoute(data);
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export async function fetchRouteDetails(points: Coord[]): Promise<RouteDetails> {
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

export async function fetchRoute(points: Coord[]): Promise<Coord[]> {
  return (await fetchRouteDetails(points)).coordinates;
}
