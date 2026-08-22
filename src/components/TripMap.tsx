import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import { carMarkerSvg } from "../lib/carMarker";
import { fetchRouteDetails, type Coord } from "../lib/routing";

interface Props { tripId: string; status: string; onEtaChange?: (minutes: number | null) => void; }
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
const DONE_COLOR = "#9aa3c0";
const NEXT_PICKUP = "#3b82f6";
const NEXT_TRIP = "#1fbf8f";

function pinEl(kind: "captain" | "from" | "to" | "stop"): HTMLDivElement {
  const el = document.createElement("div");
  if (kind === "captain") {
    el.className = "carMarker";
    el.innerHTML = `<img class="carImg" src="${carMarkerSvg("#1fbf8f")}" width="56" height="20" alt=""/>`;
  } else el.className = "tripDot " + kind;
  return el;
}
function lineFeature(coords: Coord[]) { return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }; }

export default function TripMap({ tripId, status, onEtaChange }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markers = useRef<{ captain?: maplibregl.Marker; from?: maplibregl.Marker; to?: maplibregl.Marker; stops: maplibregl.Marker[] }>({ stops: [] });
  const stopsRef = useRef<Stop[]>([]);
  const [ready, setReady] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const userMovedMap = useRef(false);
  const beforeStart = status === "accepted" || status === "arrived";
  const inProgress = status === "in_progress";

  const setLine = useCallback((id: string, coords: Coord[], color: string, width: number) => {
    const map = mapRef.current; if (!map) return;
    const data = coords.length >= 2 ? lineFeature(coords) : { type: "FeatureCollection" as const, features: [] };
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as GeoJSON);
    else {
      map.addSource(id, { type: "geojson", data: data as GeoJSON });
      map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": width, "line-opacity": 0.92 } });
    }
  }, []);

  const followCarAndRoute = useCallback((route: Coord[], cap: Coord | null, force = false) => {
    const map = mapRef.current; if (!map || !cap) return;
    if (userMovedMap.current && !force) return;
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend(cap);
    const sample = route.slice(0, Math.min(route.length, 80));
    sample.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { padding: { top: 72, right: 48, bottom: 92, left: 48 }, maxZoom: 16.8, duration: 550 });
  }, []);

  const drawRoute = useCallback(async (d: MapData, forceFocus = false) => {
    const pickup: Coord = [d.pickup.lng, d.pickup.lat];
    const dropoff: Coord = [d.dropoff.lng, d.dropoff.lat];
    const cap: Coord | null = d.captain ? [d.captain.lng, d.captain.lat] : null;
    if (!cap) { onEtaChange?.(null); return; }

    let waypoints: Coord[];
    if (beforeStart) waypoints = [cap, pickup];
    else if (inProgress) {
      const stopCoords: Coord[] = stopsRef.current.map(s => [s.lng, s.lat]);
      waypoints = [cap, ...stopCoords, dropoff];
    } else waypoints = [pickup, dropoff];

    try {
      const route = await fetchRouteDetails(waypoints);
      setRouteError(false);
      setLine("routeDone", [], DONE_COLOR, 6);
      setLine("routeNext", route.coordinates, beforeStart ? NEXT_PICKUP : NEXT_TRIP, 5);
      followCarAndRoute(route.coordinates, cap, forceFocus);
      if (beforeStart) {
        const minutes = route.durationSec == null ? null : Math.max(1, Math.ceil(route.durationSec / 60));
        onEtaChange?.(minutes);
      } else onEtaChange?.(null);
    } catch {
      setRouteError(true);
      onEtaChange?.(null);
      setLine("routeDone", [], DONE_COLOR, 6);
      setLine("routeNext", [], beforeStart ? NEXT_PICKUP : NEXT_TRIP, 5);
    }
  }, [beforeStart, inProgress, followCarAndRoute, onEtaChange, setLine]);

  const update = useCallback((d: MapData, forceFocus = false) => {
    const map = mapRef.current; if (!map) return;
    const from: Coord = [d.pickup.lng, d.pickup.lat];
    const to: Coord = [d.dropoff.lng, d.dropoff.lat];
    if (!markers.current.from) markers.current.from = new maplibregl.Marker({ element: pinEl("from") }).setLngLat(from).addTo(map); else markers.current.from.setLngLat(from);
    if (!markers.current.to) markers.current.to = new maplibregl.Marker({ element: pinEl("to") }).setLngLat(to).addTo(map); else markers.current.to.setLngLat(to);
    const st = stopsRef.current;
    while (markers.current.stops.length < st.length) markers.current.stops.push(new maplibregl.Marker({ element: pinEl("stop") }));
    markers.current.stops.forEach((m, i) => { if (i < st.length) m.setLngLat([st[i].lng, st[i].lat]).addTo(map); else m.remove(); });

    if (d.captain) {
      const pos: Coord = [d.captain.lng, d.captain.lat];
      if (!markers.current.captain) markers.current.captain = new maplibregl.Marker({ element: pinEl("captain") }).setLngLat(pos).addTo(map); else markers.current.captain.setLngLat(pos);
      const img = markers.current.captain.getElement().querySelector("img") as HTMLImageElement | null;
      if (img) {
        const heading = d.captain.heading;
        if (heading != null && Number.isFinite(heading)) img.style.transform = `rotate(${heading - 90}deg)`;
      }
    }
    void drawRoute(d, forceFocus);
  }, [drawRoute]);

  const load = useCallback(async (forceFocus = false) => {
    const [mapRes, tripRes] = await Promise.all([
      supabase.rpc("trip_map_data", { p_trip_id: tripId }),
      supabase.from("trips").select("stops").eq("id", tripId).single(),
    ]);
    if (tripRes.data && Array.isArray(tripRes.data.stops)) stopsRef.current = tripRes.data.stops as Stop[];
    if (mapRes.data) update(mapRes.data as MapData, forceFocus);
  }, [tripId, update]);

  const recenter = useCallback(() => {
    userMovedMap.current = false;
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: STYLE, center: [31.2357, 30.0444], zoom: 11 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("load", () => { map.resize(); setReady(true); void load(true); });
    map.on("dragstart", () => { userMovedMap.current = true; });
    map.on("zoomstart", (e) => { if ((e as any).originalEvent) userMovedMap.current = true; });
    const interval = window.setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void load(false); }, 5000);
    const ch = supabase.channel("trip-map-" + tripId)
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => { void load(true); })
      .subscribe((s) => { if (s === "SUBSCRIBED") void load(true); });
    const onVisible = () => { if (document.visibilityState === "visible") { map.resize(); void load(true); } };
    window.addEventListener("focus", onVisible); window.addEventListener("online", onVisible); document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval); window.removeEventListener("focus", onVisible); window.removeEventListener("online", onVisible); document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(ch); map.remove(); mapRef.current = null; markers.current = { stops: [] };
    };
  }, [tripId, load]);

  useEffect(() => { if (ready) { userMovedMap.current = false; void load(true); } }, [status, ready, load]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} className="tripMapCanvas" />
      <button type="button" onClick={recenter} aria-label="إعادة توسيط الخريطة على السيارة" title="إعادة التوسيط" style={{ position:"absolute", right:12, bottom:12, width:44, height:44, borderRadius:14, border:"1px solid #cbd5e1", background:"rgba(255,255,255,.96)", boxShadow:"0 4px 14px rgba(15,23,42,.18)", zIndex:5, fontSize:22, fontWeight:900 }}>◎</button>
      {routeError && <p className="locWarn" role="status" style={{ marginTop: 8 }}>تعذّر تحميل مسار الطريق مؤقتًا — جارٍ إعادة المحاولة تلقائيًا</p>}
    </div>
  );
}
