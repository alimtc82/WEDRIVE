import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import { carMarkerSvg, carColor } from "../lib/carMarker";

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

export default function AdminMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const [count, setCount] = useState(0);

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
        el.innerHTML = `<img class="carImg" src="${carMarkerSvg(color)}" width="36" height="36" style="${rot}" alt=""/><b>${c.full_name || ""}</b>`;
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
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_captains_on_map");
    if (data) render(data as CaptainPin[]);
  }, [render]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current, style: STYLE,
      center: [CAIRO.lng, CAIRO.lat], zoom: 10,
    });
    mapRef.current = map;
    map.on("load", () => { map.resize(); load(); });
    setTimeout(() => map.resize(), 300);

    // تحديث دوري كل 15 ثانية + realtime عند أي تغيير
    const interval = setInterval(load, 15000);
    const ch = supabase.channel("admin-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, () => load())
      .subscribe();

    return () => { clearInterval(interval); supabase.removeChannel(ch); map.remove(); mapRef.current = null; markersRef.current = {}; };
  }, [load]);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>خريطة الكباتن المتصلين</h2>
        <p>{count} كابتن متصل الآن · تتحدّث تلقائيًا</p>
      </div>
      <div className="mapLegend">
        <span><i style={{ background: "#1fbf8f" }} /> متحرك</span>
        <span><i style={{ background: "#93a1c0" }} /> ثابت</span>
        <span><i style={{ background: "#3b82f6" }} /> في رحلة</span>
      </div>
      <div ref={containerRef} className="adminMapCanvas" />
    </section>
  );
}
