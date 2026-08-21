import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import { carMarkerSvg, carColor } from "../lib/carMarker";
import { fetchRoute, type Coord } from "../lib/routing";

interface CaptainPin {
  id: string; full_name: string;
  lat: number; lng: number;
  is_moving: boolean; in_trip: boolean;
  heading: number | null;
  location_updated_at: string;
}

type SimTrip = {
  id: string;
  seq: number;
  captain_name: string;
  status: "waiting" | "in_progress" | "completed" | "stopped";
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  captain: { lat: number; lng: number };
  progress: number;
};

type SimSnapshot = {
  exists: boolean;
  status?: "active" | "completed" | "stopped";
  trips?: SimTrip[];
};

type SelectedRoute =
  | { kind: "real"; id: string; name: string }
  | { kind: "sim"; id: string; name: string };

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const DONE_COLOR = "#9aa3c0";
const NEXT_COLOR = "#3b82f6";
const SIM_IDLE_COLOR = "#93a1c0";
const SIM_TRIP_COLOR = "#3b82f6";

function lineFeature(coords: Coord[]) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } };
}

function nearestIndex(route: Coord[], pos: Coord): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i][0] - pos[0], dy = route[i][1] - pos[1];
    const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

function routePointAt(route: Coord[], progress: number): { point: Coord; index: number } {
  if (route.length === 0) return { point: [31.18, 30.46], index: 0 };
  if (route.length === 1) return { point: route[0], index: 0 };
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const scaled = p * (route.length - 1);
  const i = Math.min(route.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = route[i], b = route[i + 1];
  return {
    point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    index: i,
  };
}

export default function AdminMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const simMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const meMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeCache = useRef<Record<string, Coord[]>>({});
  const simRouteCache = useRef<Record<string, Coord[]>>({});
  const simTripsRef = useRef<Record<string, SimTrip>>({});
  const anchors = useRef<Record<string, Coord>>({});
  const selectedRef = useRef<SelectedRoute | null>(null);
  const [count, setCount] = useState(0);
  const [simCount, setSimCount] = useState(0);
  const [simActive, setSimActive] = useState(0);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const setLine = useCallback((id: string, coords: Coord[], color: string, width: number) => {
    const map = mapRef.current; if (!map) return;
    const data = coords.length >= 2
      ? lineFeature(coords)
      : { type: "FeatureCollection" as const, features: [] };
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as GeoJSON);
    else {
      map.addSource(id, { type: "geojson", data: data as GeoJSON });
      map.addLayer({ id, type: "line", source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": width, "line-opacity": 0.9 } });
    }
  }, []);

  const clearRoute = useCallback(() => {
    setLine("adminRouteDone", [], DONE_COLOR, 6);
    setLine("adminRouteNext", [], NEXT_COLOR, 5);
  }, [setLine]);

  const showRoute = useCallback(async (captainId: string, name: string, silent = false) => {
    const map = mapRef.current; if (!map) return;
    const { data } = await supabase.rpc("admin_captain_route", { p_captain_id: captainId });
    if (!data) {
      if (!silent) { setSelectedName(name + " — لا توجد رحلة جارية"); selectedRef.current = null; clearRoute(); }
      return;
    }

    if (!silent) { setSelectedName(name); selectedRef.current = { kind: "real", id: captainId, name }; }

    const beforeStart = data.status === "accepted" || data.status === "arrived";
    const from: Coord = [data.pickup.lng, data.pickup.lat];
    const to: Coord = [data.dropoff.lng, data.dropoff.lat];
    const cap: Coord | null = data.captain ? [data.captain.lng, data.captain.lat] : null;
    const phase = beforeStart ? "pickup" : "trip";
    const cacheKey = `${captainId}:${phase}`;

    let anchor: Coord, end: Coord;
    if (beforeStart) {
      if (!cap) return;
      if (!anchors.current[cacheKey]) anchors.current[cacheKey] = cap;
      anchor = anchors.current[cacheKey]; end = from;
    } else {
      anchor = from; end = to;
    }

    let route = routeCache.current[cacheKey];
    if (!route) {
      route = await fetchRoute([anchor, end]);
      routeCache.current[cacheKey] = route;
    }

    if (cap && route.length >= 2) {
      const i = nearestIndex(route, cap);
      setLine("adminRouteDone", [...route.slice(0, i + 1), cap], DONE_COLOR, 6);
      setLine("adminRouteNext", [cap, ...route.slice(i + 1)], NEXT_COLOR, 5);
    } else {
      setLine("adminRouteDone", [], DONE_COLOR, 6);
      setLine("adminRouteNext", route, NEXT_COLOR, 5);
    }

    if (!silent && route.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      route.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 500 });
    }
  }, [clearRoute, setLine]);

  const showSimRoute = useCallback(async (simId: string, silent = false) => {
    const map = mapRef.current;
    const trip = simTripsRef.current[simId];
    if (!map || !trip) return;

    if (trip.status !== "in_progress") {
      if (!silent) {
        setSelectedName(`${trip.captain_name} — متوقف`);
        selectedRef.current = null;
        clearRoute();
      }
      return;
    }

    if (!silent) {
      setSelectedName(trip.captain_name);
      selectedRef.current = { kind: "sim", id: simId, name: trip.captain_name };
    }

    let route = simRouteCache.current[simId];
    if (!route) {
      try {
        route = await fetchRoute([
          [Number(trip.pickup.lng), Number(trip.pickup.lat)],
          [Number(trip.dropoff.lng), Number(trip.dropoff.lat)],
        ]);
        simRouteCache.current[simId] = route;
      } catch {
        if (!silent) setSelectedName(`${trip.captain_name} — تعذّر تحميل المسار`);
        return;
      }
    }
    if (route.length < 2) return;

    const { point, index } = routePointAt(route, trip.progress);
    setLine("adminRouteDone", [...route.slice(0, index + 1), point], DONE_COLOR, 6);
    setLine("adminRouteNext", [point, ...route.slice(index + 1)], NEXT_COLOR, 5);

    if (!silent) {
      const bounds = new maplibregl.LngLatBounds();
      route.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 500 });
    }
  }, [clearRoute, setLine]);

  const render = useCallback((caps: CaptainPin[]) => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();

    for (const c of caps) {
      seen.add(c.id);
      const color = carColor(c.in_trip, c.is_moving);
      const rot = c.heading != null ? `transform:rotate(${c.heading}deg)` : "";
      let m = markersRef.current[c.id];
      if (!m) {
        const el = document.createElement("div");
        el.className = "carMarker";
        const img = document.createElement("img");
        img.className = "carImg"; img.src = carMarkerSvg(color); img.width = 36; img.height = 36;
        if (rot) img.style.cssText = rot;
        const label = document.createElement("b");
        label.textContent = c.full_name || "";
        el.append(img, label);
        el.style.cursor = "pointer";
        el.addEventListener("click", (ev) => { ev.stopPropagation(); void showRoute(c.id, c.full_name); });
        m = new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
        markersRef.current[c.id] = m;
      } else {
        m.setLngLat([c.lng, c.lat]);
        const img = m.getElement().querySelector("img") as HTMLImageElement;
        if (img) { img.src = carMarkerSvg(color); img.style.cssText = rot; }
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    }
    setCount(caps.length);
  }, [showRoute]);

  const clearSimulationMarkers = useCallback(() => {
    for (const id of Object.keys(simMarkersRef.current)) simMarkersRef.current[id].remove();
    simMarkersRef.current = {};
    simTripsRef.current = {};
    simRouteCache.current = {};
    setSimCount(0);
    setSimActive(0);
    if (selectedRef.current?.kind === "sim") {
      selectedRef.current = null;
      setSelectedName(null);
      clearRoute();
    }
  }, [clearRoute]);

  const renderSimulation = useCallback(async (snapshot: SimSnapshot | null) => {
    const map = mapRef.current;
    if (!map) return;
    if (!snapshot?.exists || snapshot.status !== "active") {
      clearSimulationMarkers();
      return;
    }

    const trips = snapshot.trips || [];
    simTripsRef.current = Object.fromEntries(trips.map((t) => [t.id, t]));
    const seen = new Set<string>();
    let activeNow = 0;

    await Promise.all(trips.map(async (t) => {
      seen.add(t.id);
      const inTrip = t.status === "in_progress";
      if (inTrip) activeNow += 1;

      let pos: Coord = t.status === "completed"
        ? [Number(t.dropoff.lng), Number(t.dropoff.lat)]
        : [Number(t.pickup.lng), Number(t.pickup.lat)];

      if (inTrip) {
        try {
          let route = simRouteCache.current[t.id];
          if (!route) {
            route = await fetchRoute([
              [Number(t.pickup.lng), Number(t.pickup.lat)],
              [Number(t.dropoff.lng), Number(t.dropoff.lat)],
            ]);
            simRouteCache.current[t.id] = route;
          }
          if (route.length >= 2) pos = routePointAt(route, t.progress).point;
        } catch {
          pos = [Number(t.captain.lng), Number(t.captain.lat)];
        }
      }

      const color = inTrip ? SIM_TRIP_COLOR : SIM_IDLE_COLOR;
      let marker = simMarkersRef.current[t.id];
      if (!marker) {
        const el = document.createElement("div");
        el.className = "carMarker simCarMarker";
        el.style.cursor = "pointer";
        el.title = t.captain_name;
        const img = document.createElement("img");
        img.className = "carImg";
        img.src = carMarkerSvg(color);
        img.width = 34; img.height = 34;
        el.append(img);
        el.addEventListener("click", (ev) => { ev.stopPropagation(); void showSimRoute(t.id); });
        marker = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(map);
        simMarkersRef.current[t.id] = marker;
      } else {
        marker.setLngLat(pos);
        const img = marker.getElement().querySelector("img") as HTMLImageElement;
        if (img) img.src = carMarkerSvg(color);
      }
    }));

    for (const id of Object.keys(simMarkersRef.current)) {
      if (!seen.has(id)) { simMarkersRef.current[id].remove(); delete simMarkersRef.current[id]; }
    }
    setSimCount(trips.length);
    setSimActive(activeNow);
  }, [clearSimulationMarkers, showSimRoute]);

  const load = useCallback(async () => {
    const [realRes, simRes] = await Promise.all([
      supabase.rpc("admin_captains_on_map"),
      supabase.rpc("admin_simulation_snapshot"),
    ]);
    if (realRes.data) render(realRes.data as CaptainPin[]);
    if (!simRes.error) await renderSimulation((simRes.data as SimSnapshot) || null);
  }, [render, renderSimulation]);

  const showMe = useCallback((lat: number, lng: number) => {
    const map = mapRef.current; if (!map) return;
    if (!meMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.25);";
      meMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      meMarkerRef.current.setLngLat([lng, lat]);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE,
      center: [CAIRO.lng, CAIRO.lat], zoom: 10,
    });
    mapRef.current = map;
    map.on("load", () => { map.resize(); void load(); });
    setTimeout(() => map.resize(), 300);

    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          showMe(p.coords.latitude, p.coords.longitude);
          map.jumpTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 13 });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
      watchId = navigator.geolocation.watchPosition(
        (p) => showMe(p.coords.latitude, p.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 30000 }
      );
    }

    const tick = () => {
      void load();
      const s = selectedRef.current;
      if (s?.kind === "real") void showRoute(s.id, s.name, true);
      if (s?.kind === "sim") void showSimRoute(s.id, true);
    };
    const interval = window.setInterval(tick, 5_000);
    const ch = supabase.channel("admin-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, tick)
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(ch);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      meMarkerRef.current?.remove(); meMarkerRef.current = null;
      for (const id of Object.keys(simMarkersRef.current)) simMarkersRef.current[id].remove();
      map.remove(); mapRef.current = null; markersRef.current = {}; simMarkersRef.current = {};
    };
  }, [load, showRoute, showSimRoute, showMe]);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>خريطة الكباتن المتصلين</h2>
        <p>
          {count} كابتن حقيقي متصل الآن
          {simCount > 0 ? ` · ${simCount} سيارة بث (${simActive} في رحلة)` : ""}
          {" · تتحدّث تلقائيًا"}
        </p>
      </div>
      <div className="mapLegend">
        <span><i style={{ background: "#3b82f6", border: "2px solid #fff" }} /> موقعي</span>
        <span><i style={{ background: "#1fbf8f" }} /> متحرك</span>
        <span><i style={{ background: "#93a1c0" }} /> ثابت / بث متوقف</span>
        <span><i style={{ background: "#3b82f6" }} /> في رحلة</span>
      </div>
      {selectedName && (
        <div className="routeBanner">
          <span>مسار: {selectedName}</span>
          <button onClick={() => { setSelectedName(null); selectedRef.current = null; clearRoute(); }}>مسح المسار</button>
        </div>
      )}
      <p className="mapTip">اضغط على أي سيارة في رحلة لعرض مسارها — الرمادي ما قطعته والأزرق المتبقي</p>
      <div ref={containerRef} className="adminMapCanvas" />
    </section>
  );
}
