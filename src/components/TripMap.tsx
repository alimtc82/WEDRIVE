import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import { carMarkerSvg } from "../lib/carMarker";
import { fetchRoute, type Coord } from "../lib/routing";

interface Props { tripId: string; status: string; }
interface Stop { lat: number; lng: number; address?: string; }
interface MapData {
  status: string;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  captain: { lat: number; lng: number; moving: boolean; heading: number | null; updated_at: string } | null;
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// ألوان المسار التقدّمي
const DONE_COLOR = "#9aa3c0";   // الجزء المقطوع (باهت)
const NEXT_PICKUP = "#3b82f6";  // المتبقي: الكابتن في الطريق للعميل
const NEXT_TRIP = "#1fbf8f";    // المتبقي: الرحلة الجارية

function pinEl(kind: "captain" | "from" | "to" | "stop"): HTMLDivElement {
  const el = document.createElement("div");
  if (kind === "captain") {
    el.className = "carMarker";
    el.innerHTML = `<img class="carImg" src="${carMarkerSvg("#1fbf8f")}" width="38" height="38" alt=""/>`;
  } else {
    el.className = "tripDot " + kind;
  }
  return el;
}

function lineFeature(coords: Coord[]) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } };
}

// أقرب نقطة على هندسة المسار لموقع الكابتن الحالي
function nearestIndex(route: Coord[], pos: Coord): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i][0] - pos[0], dy = route[i][1] - pos[1];
    const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

export default function TripMap({ tripId, status }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markers = useRef<{ captain?: maplibregl.Marker; from?: maplibregl.Marker; to?: maplibregl.Marker; stops: maplibregl.Marker[] }>({ stops: [] });
  const stopsRef = useRef<Stop[]>([]);
  const routeCache = useRef<Record<string, Coord[]>>({});
  // نقطة بداية المسار لكل مرحلة — تُثبَّت عند أول قراءة حتى لا يتحرك "بداية المقطوع" مع الكابتن
  const anchors = useRef<Record<string, Coord>>({});
  const [ready, setReady] = useState(false);

  // قبل بدء الرحلة: المسار كابتن → نقطة العميل. بعد البدء: انطلاق ← توقفات ← وجهة
  const beforeStart = status === "accepted" || status === "arrived";
  const phase = beforeStart ? "pickup" : "trip";

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

  // يرسم المسار مقسومًا: مقطوع (باهت) + متبقٍ (ملوّن) حسب موقع الكابتن
  const paintProgress = useCallback((route: Coord[], cap: Coord | null) => {
    const nextColor = beforeStart ? NEXT_PICKUP : NEXT_TRIP;
    if (!cap || route.length < 2) {
      setLine("routeDone", [], DONE_COLOR, 6);
      setLine("routeNext", route, nextColor, 5);
      return;
    }
    const i = nearestIndex(route, cap);
    setLine("routeDone", [...route.slice(0, i + 1), cap], DONE_COLOR, 6);
    setLine("routeNext", [cap, ...route.slice(i + 1)], nextColor, 5);
  }, [beforeStart, setLine]);

  const drawRoute = useCallback(async (d: MapData) => {
    const from: Coord = [d.pickup.lng, d.pickup.lat];
    const to: Coord = [d.dropoff.lng, d.dropoff.lat];
    const cap: Coord | null = d.captain ? [d.captain.lng, d.captain.lat] : null;

    let anchor: Coord, waypoints: Coord[];
    if (beforeStart) {
      if (!cap) return; // لا موقع للكابتن بعد
      if (!anchors.current.pickup) anchors.current.pickup = cap; // تثبيت البداية لحظة القبول
      anchor = anchors.current.pickup;
      waypoints = [anchor, from];
    } else {
      anchor = from;
      // المسار يمر بكل نقاط التوقف بالترتيب قبل الوجهة النهائية
      const stopCoords: Coord[] = stopsRef.current.map((s) => [s.lng, s.lat]);
      waypoints = [anchor, ...stopCoords, to];
    }

    let route = routeCache.current[phase];
    if (!route) {
      route = await fetchRoute(waypoints);
      routeCache.current[phase] = route;
    }
    paintProgress(route, cap);
  }, [beforeStart, phase, paintProgress]);

  const update = useCallback((d: MapData) => {
    const map = mapRef.current; if (!map) return;
    const from: [number, number] = [d.pickup.lng, d.pickup.lat];
    const to: [number, number] = [d.dropoff.lng, d.dropoff.lat];

    if (!markers.current.from) markers.current.from = new maplibregl.Marker({ element: pinEl("from") }).setLngLat(from).addTo(map);
    if (!markers.current.to) markers.current.to = new maplibregl.Marker({ element: pinEl("to") }).setLngLat(to).addTo(map);

    // علامات نقاط التوقف (أصفر)
    const st = stopsRef.current;
    while (markers.current.stops.length < st.length) {
      markers.current.stops.push(new maplibregl.Marker({ element: pinEl("stop") }));
    }
    markers.current.stops.forEach((m, i) => {
      if (i < st.length) m.setLngLat([st[i].lng, st[i].lat]).addTo(map);
      else m.remove();
    });

    const cap = d.captain;
    if (cap) {
      const pos: [number, number] = [cap.lng, cap.lat];
      if (!markers.current.captain) markers.current.captain = new maplibregl.Marker({ element: pinEl("captain") }).setLngLat(pos).addTo(map);
      else markers.current.captain.setLngLat(pos);

      if (cap.heading != null) {
        const img = markers.current.captain.getElement().querySelector("img") as HTMLImageElement | null;
        if (img) img.style.transform = `rotate(${cap.heading}deg)`;
      }

      const b = new maplibregl.LngLatBounds();
      b.extend(pos); b.extend(beforeStart ? from : to);
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 500 });
    }

    drawRoute(d);
  }, [beforeStart, drawRoute]);

  const load = useCallback(async () => {
    const [mapRes, tripRes] = await Promise.all([
      supabase.rpc("trip_map_data", { p_trip_id: tripId }),
      supabase.from("trips").select("stops").eq("id", tripId).single(),
    ]);
    if (tripRes.data && Array.isArray(tripRes.data.stops)) {
      stopsRef.current = tripRes.data.stops as Stop[];
    }
    if (mapRes.data) update(mapRes.data as MapData);
  }, [tripId, update]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: STYLE, center: [31.2357, 30.0444], zoom: 11 });
    mapRef.current = map;
    map.on("load", () => { map.resize(); setReady(true); load(); });
    setTimeout(() => map.resize(), 300);

    // تحديث دوري + realtime على مواقع الكباتن والرحلة
    const interval = setInterval(load, 15000);
    const ch = supabase.channel("trip-map-" + tripId)
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, () => load())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}`,
      }, () => load())
      .subscribe();

    return () => { clearInterval(interval); supabase.removeChannel(ch); map.remove(); mapRef.current = null; markers.current = { stops: [] }; };
  }, [tripId, load]);

  useEffect(() => { if (ready) load(); }, [status, ready, load]);

  return <div ref={containerRef} className="tripMapCanvas" />;
}
