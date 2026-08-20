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

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const DONE_COLOR = "#9aa3c0";   // الجزء المقطوع
const NEXT_COLOR = "#3b82f6";   // الجزء المتبقي

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

export default function AdminMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const meMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeCache = useRef<Record<string, Coord[]>>({});
  const anchors = useRef<Record<string, Coord>>({});
  const selectedRef = useRef<{ id: string; name: string } | null>(null);
  const [count, setCount] = useState(0);
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

  // رسم مسار رحلة كابتن معيّن (مقطوع + متبقٍ) — يُستدعى عند الضغط عليه ويُحدَّث دوريًا
  const showRoute = useCallback(async (captainId: string, name: string, silent = false) => {
    const map = mapRef.current; if (!map) return;
    const { data } = await supabase.rpc("admin_captain_route", { p_captain_id: captainId });
    if (!data) {
      if (!silent) { setSelectedName(name + " — لا توجد رحلة جارية"); selectedRef.current = null; clearRoute(); }
      return;
    }

    if (!silent) { setSelectedName(name); selectedRef.current = { id: captainId, name }; }

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

    // تقسيم المسار حسب موقع الكابتن الحالي
    if (cap && route.length >= 2) {
      const i = nearestIndex(route, cap);
      setLine("adminRouteDone", [...route.slice(0, i + 1), cap], DONE_COLOR, 6);
      setLine("adminRouteNext", [cap, ...route.slice(i + 1)], NEXT_COLOR, 5);
    } else {
      setLine("adminRouteDone", [], DONE_COLOR, 6);
      setLine("adminRouteNext", route, NEXT_COLOR, 5);
    }

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
        el.addEventListener("click", (ev) => { ev.stopPropagation(); showRoute(c.id, c.full_name); });
        m = new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
        markersRef.current[c.id] = m;
      } else {
        m.setLngLat([c.lng, c.lat]);
        const img = (m.getElement().querySelector("img") as HTMLImageElement);
        if (img) { img.src = carMarkerSvg(color); img.style.cssText = rot; }
      }
    }
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    }
    setCount(caps.length);
  }, [showRoute]);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_captains_on_map");
    if (data) render(data as CaptainPin[]);
  }, [render]);

  // نقطة موقع الأدمن الحالي على الخريطة (تُحدَّث مع حركته)
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
    map.on("load", () => { map.resize(); load(); });
    setTimeout(() => map.resize(), 300);

    // تحديد موقع الأدمن الحالي تلقائيًا بمجرد فتح الخريطة
    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          showMe(p.coords.latitude, p.coords.longitude);
          map.jumpTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 13 });
        },
        () => { /* لو رفض الإذن تبقى الخريطة على العرض الافتراضي */ },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
      watchId = navigator.geolocation.watchPosition(
        (p) => showMe(p.coords.latitude, p.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 30000 }
      );
    }

    // تحديث دوري كل 15 ثانية + realtime — مع تحديث المسار المعروض إن وُجد
    const tick = () => {
      load();
      const s = selectedRef.current;
      if (s) showRoute(s.id, s.name, true);
    };
    const interval = setInterval(tick, 15000);
    const ch = supabase.channel("admin-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, tick)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      meMarkerRef.current?.remove(); meMarkerRef.current = null;
      map.remove(); mapRef.current = null; markersRef.current = {};
    };
  }, [load, showRoute, showMe]);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>خريطة الكباتن المتصلين</h2>
        <p>{count} كابتن متصل الآن · تتحدّث تلقائيًا</p>
      </div>
      <div className="mapLegend">
        <span><i style={{ background: "#3b82f6", border: "2px solid #fff" }} /> موقعي</span>
        <span><i style={{ background: "#1fbf8f" }} /> متحرك</span>
        <span><i style={{ background: "#93a1c0" }} /> ثابت</span>
        <span><i style={{ background: "#3b82f6" }} /> في رحلة</span>
      </div>
      {selectedName && (
        <div className="routeBanner">
          <span>مسار: {selectedName}</span>
          <button onClick={() => { setSelectedName(null); selectedRef.current = null; clearRoute(); }}>مسح المسار</button>
        </div>
      )}
      <p className="mapTip">اضغط على أي كابتن لعرض مسار رحلته الجارية — الرمادي ما قطعه والأزرق المتبقي</p>
      <div ref={containerRef} className="adminMapCanvas" />
    </section>
  );
}
