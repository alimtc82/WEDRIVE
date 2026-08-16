import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";

interface CaptainPin {
  id: string; full_name: string;
  lat: number; lng: number;
  is_moving: boolean; in_trip: boolean;
  location_updated_at: string;
}

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// أيقونة سيارة SVG ملوّنة
function carSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="white" stroke="${color}" stroke-width="2"/><path fill="${color}" d="M6.5 11l1-3h9l1 3 .8.4c.4.2.7.6.7 1.1v2.5c0 .3-.2.5-.5.5H18c0 .8-.7 1.5-1.5 1.5S15 17.8 15 17H9c0 .8-.7 1.5-1.5 1.5S6 17.8 6 17h-.2c-.3 0-.5-.2-.5-.5V14c0-.5.3-.9.7-1.1zm1.3-.5h8.4l-.6-2H8.4z"/></svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

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
      const color = c.in_trip ? "#3b82f6" : c.is_moving ? "#1fbf8f" : "#93a1c0";
      let m = markersRef.current[c.id];
      if (!m) {
        const el = document.createElement("div");
        el.className = "carMarker";
        el.innerHTML = `<img src="${carSvg(color)}" width="34" height="34" alt=""/><b>${c.full_name || ""}</b>`;
        m = new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
        markersRef.current[c.id] = m;
      } else {
        m.setLngLat([c.lng, c.lat]);
        const img = (m.getElement().querySelector("img") as HTMLImageElement);
        if (img) img.src = carSvg(color);
      }
    }
    // إزالة الكباتن اللي فصلوا
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
