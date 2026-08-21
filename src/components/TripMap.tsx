import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSON } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import { carMarkerSvg } from "../lib/carMarker";
import { fetchRoute, fetchRouteDetails, type Coord } from "../lib/routing";

interface Props {
  tripId: string;
  status: string;
  onEtaChange?: (minutes: number | null) => void;
}
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
    el.innerHTML = `<img class="carImg" src="${carMarkerSvg("#1fbf8f")}" width="38" height="38" alt=""/>`;
  } else {
    el.className = "tripDot " + kind;
  }
  return el;
}

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

export default function TripMap({ tripId, status, onEtaChange }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markers = useRef<{ captain?: maplibregl.Marker; from?: maplibregl.Marker; to?: maplibregl.Marker; stops: maplibregl.Marker[] }>({ stops: [] });
  const stopsRef = useRef<Stop[]>([]);
  const routeCache = useRef<Record<string, Coord[]>>({});
  const anchors = useRef<Record<string, Coord>>({});
  const fittedPhase = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [routeError, setRouteError] = useState(false);

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
      map.addLayer({
        id, type: "line", source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": width, "line-opacity": 0.9 },
      });
    }
  }, []);

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

  const focusRoute = useCallback((route: Coord[], cap: Coord | null) => {
    const map = mapRef.current;
    if (!map || route.length < 2 || fittedPhase.current === phase) return;

    const bounds = new maplibregl.LngLatBounds();
    route.forEach((p) => bounds.extend(p));
    if (cap) bounds.extend(cap);

    map.fitBounds(bounds, {
      padding: { top: 48, right: 42, bottom: 48, left: 42 },
      maxZoom: 15.5,
      duration: 700,
    });
    fittedPhase.current = phase;
  }, [phase]);

  const drawRoute = useCallback(async (d: MapData) => {
    const from: Coord = [d.pickup.lng, d.pickup.lat];
    const to: Coord = [d.dropoff.lng, d.dropoff.lat];
    const cap: Coord | null = d.captain ? [d.captain.lng, d.captain.lat] : null;

    let waypoints: Coord[];
    if (beforeStart) {
      if (!cap) { onEtaChange?.(null); return; }
      if (!anchors.current.pickup) anchors.current.pickup = cap;
      waypoints = [anchors.current.pickup, from];
    } else {
      const stopCoords: Coord[] = stopsRef.current.map((s) => [s.lng, s.lat]);
      waypoints = [from, ...stopCoords, to];
      onEtaChange?.(null);
    }

    try {
      let route = routeCache.current[phase];
      if (!route) {
        route = await fetchRoute(waypoints);
        routeCache.current[phase] = route;
      }
      setRouteError(false);
      paintProgress(route, cap);
      focusRoute(route, cap);

      // ETA to pickup is recalculated from the captain's CURRENT location so it
      // naturally decreases as the captain moves, while the displayed route can
      // retain its full progress geometry from the original accepted position.
      if (beforeStart && cap) {
        try {
          const current = await fetchRouteDetails([cap, from]);
          const minutes = current.durationSec == null ? null : Math.max(1, Math.ceil(current.durationSec / 60));
          onEtaChange?.(minutes);
        } catch {
          onEtaChange?.(null);
        }
      }
    } catch {
      setRouteError(true);
      onEtaChange?.(null);
      setLine("routeDone", [], DONE_COLOR, 6);
      setLine("routeNext", [], beforeStart ? NEXT_PICKUP : NEXT_TRIP, 5);
    }
  }, [beforeStart, phase, paintProgress, focusRoute, setLine, onEtaChange]);

  const update = useCallback((d: MapData) => {
    const map = mapRef.current; if (!map) return;
    const from: [number, number] = [d.pickup.lng, d.pickup.lat];
    const to: [number, number] = [d.dropoff.lng, d.dropoff.lat];

    if (!markers.current.from) markers.current.from = new maplibregl.Marker({ element: pinEl("from") }).setLngLat(from).addTo(map);
    if (!markers.current.to) markers.current.to = new maplibregl.Marker({ element: pinEl("to") }).setLngLat(to).addTo(map);

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
    }

    void drawRoute(d);
  }, [drawRoute]);

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
    map.on("load", () => { map.resize(); setReady(true); void load(); });
    const resizeTimer = window.setTimeout(() => map.resize(), 300);

    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        map.resize();
        refresh();
      }
    };

    const interval = window.setInterval(refresh, 8_000);
    const ch = supabase.channel("trip-map-" + tripId)
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => { void load(); })
      .subscribe((state) => {
        if (state === "SUBSCRIBED") void load();
      });

    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(resizeTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(ch);
      map.remove();
      mapRef.current = null;
      markers.current = { stops: [] };
    };
  }, [tripId, load]);

  useEffect(() => {
    if (!ready) return;
    fittedPhase.current = null;
    delete routeCache.current[phase];
    void load();
  }, [status, phase, ready, load]);

  return (
    <div>
      <div ref={containerRef} className="tripMapCanvas" />
      {routeError && (
        <p className="locWarn" role="status" style={{ marginTop: 8 }}>
          تعذّر تحميل مسار الطريق مؤقتًا — جارٍ إعادة المحاولة تلقائيًا
        </p>
      )}
    </div>
  );
}
