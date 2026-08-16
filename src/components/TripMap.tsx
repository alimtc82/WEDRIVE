import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";

interface Props { tripId: string; status: string; }
interface MapData {
  status: string;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  captain: { lat: number; lng: number; moving: boolean; updated_at: string } | null;
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function pinEl(kind: "captain" | "from" | "to"): HTMLDivElement {
  const el = document.createElement("div");
  if (kind === "captain") {
    el.innerHTML = `<div class="tripCar">🚗</div>`;
  } else {
    el.className = "tripDot " + kind;
  }
  return el;
}

export default function TripMap({ tripId, status }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markers = useRef<{ captain?: maplibregl.Marker; from?: maplibregl.Marker; to?: maplibregl.Marker }>({});
  const [ready, setReady] = useState(false);

  // قبل بدء الرحلة: الخط بين الكابتن ونقطة العميل. بعد البدء: بين الانطلاق والوجهة.
  const beforeStart = status === "accepted" || status === "arrived";

  const drawLine = useCallback((a: [number, number], b: [number, number]) => {
    const map = mapRef.current; if (!map) return;
    const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [a, b] } };
    const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      map.addSource("route", { type: "geojson", data });
      map.addLayer({ id: "route", type: "line", source: "route",
        paint: { "line-color": "#1fbf8f", "line-width": 3, "line-dasharray": [2, 1] } });
    }
  }, []);

  const update = useCallback((d: MapData) => {
    const map = mapRef.current; if (!map) return;
    const from: [number, number] = [d.pickup.lng, d.pickup.lat];
    const to: [number, number] = [d.dropoff.lng, d.dropoff.lat];

    // نقطة الانطلاق
    if (!markers.current.from) markers.current.from = new maplibregl.Marker({ element: pinEl("from") }).setLngLat(from).addTo(map);
    // الوجهة
    if (!markers.current.to) markers.current.to = new maplibregl.Marker({ element: pinEl("to") }).setLngLat(to).addTo(map);

    // الكابتن
    const cap = d.captain;
    if (cap) {
      const pos: [number, number] = [cap.lng, cap.lat];
      if (!markers.current.captain) markers.current.captain = new maplibregl.Marker({ element: pinEl("captain") }).setLngLat(pos).addTo(map);
      else markers.current.captain.setLngLat(pos);

      // الخط: قبل البدء من الكابتن لنقطة العميل، بعده من الانطلاق للوجهة
      if (beforeStart) drawLine(pos, from);
      else drawLine(from, to);

      // ضبط الإطار ليشمل النقاط المهمة
      const b = new maplibregl.LngLatBounds();
      b.extend(pos); b.extend(beforeStart ? from : to);
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 500 });
    } else {
      if (beforeStart) drawLine(from, from);
      else drawLine(from, to);
    }
  }, [beforeStart, drawLine]);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("trip_map_data", { p_trip_id: tripId });
    if (data) update(data as MapData);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => load())
      .subscribe();

    return () => { clearInterval(interval); supabase.removeChannel(ch); map.remove(); mapRef.current = null; markers.current = {}; };
  }, [tripId, load]);

  useEffect(() => { if (ready) load(); }, [status, ready, load]);

  return <div ref={containerRef} className="tripMapCanvas" />;
}
