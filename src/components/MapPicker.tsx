import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "../lib/geo";

interface Props {
  label: string;
  color: "green" | "red";
  value: LatLng | null;
  address: string;
  autoLocate?: boolean;
  onChange: (loc: LatLng, address: string) => void;
}

// مركز افتراضي: القاهرة
const CAIRO: LatLng = { lat: 30.0444, lng: 31.2357 };
// نمط بلاطات نقطية من OpenStreetMap مباشرة — الأكثر موثوقية (بدون مفتاح)
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function MapPicker({ label, color, value, address, autoLocate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mapPicker">
      <label>{label}</label>
      <button type="button" className="pickerField" onClick={() => setOpen((o) => !o)}>
        <i className={color === "green" ? "dotFrom" : "dotTo"} />
        <span>{address || "اضغط للاختيار على الخريطة"}</span>
      </button>
      {open && (
        <MapPanel color={color} value={value} autoLocate={autoLocate} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function MapPanel({
  color, value, autoLocate, onChange, onClose,
}: { color: "green" | "red"; value: LatLng | null; autoLocate?: boolean; onChange: Props["onChange"]; onClose: () => void; }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; loc: LatLng }[]>([]);
  const [searching, setSearching] = useState(false);

  const setMarker = useCallback((loc: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = `mapPin ${color}`;
      markerRef.current = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([loc.lng, loc.lat])
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLngLat();
        const l = { lat: p.lat, lng: p.lng };
        reverseGeocode(l).then((addr) => onChange(l, addr));
      });
    } else {
      markerRef.current.setLngLat([loc.lng, loc.lat]);
    }
  }, [color, onChange]);

  // تهيئة الخريطة مرة واحدة
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: value ? [value.lng, value.lat] : [CAIRO.lng, CAIRO.lat],
      zoom: value ? 14 : 10,
    });
    mapRef.current = map;
    if (value) setMarker(value);

    // زر الموقع الحالي (أيقونة السهم) — يظهر في الخريطة
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: true,
    });
    map.addControl(geolocate, "top-left");

    // عند تحديد الموقع بالزر: ضع الدبوس على موقع المستخدم واملأ العنوان
    geolocate.on("geolocate", (pos) => {
      const c = (pos as unknown as GeolocationPosition).coords;
      const loc = { lat: c.latitude, lng: c.longitude };
      setMarker(loc);
      reverseGeocode(loc).then((addr) => onChange(loc, addr));
    });

    // إصلاح مشكلة الخريطة الفاضية في MapLibre 6.x + تحديد الموقع تلقائيًا أول مرة
    map.on("load", () => {
      map.resize();
      const c = map.getCenter();
      map.jumpTo({ center: [c.lng, c.lat], zoom: map.getZoom() });
      // لو مطلوب التحديد التلقائي ولسه مفيش موقع محدد، شغّل تحديد الموقع
      if (autoLocate && !value) {
        setTimeout(() => geolocate.trigger(), 400);
      }
    });
    // إعادة قياس إضافية بعد ظهور العنصر (لو كان مخفيًا لحظة الإنشاء)
    setTimeout(() => map.resize(), 300);

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      const loc = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      setMarker(loc);
      reverseGeocode(loc).then((addr) => onChange(loc, addr));
    });

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [value, autoLocate, setMarker, onChange]);

  // البحث عبر Nominatim
  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=eg&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "ar" } });
      const data = await res.json();
      setResults(
        (data as Array<{ display_name: string; lat: string; lon: string }>).map((d) => ({
          name: d.display_name,
          loc: { lat: parseFloat(d.lat), lng: parseFloat(d.lon) },
        }))
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pick = (r: { name: string; loc: LatLng }) => {
    mapRef.current?.flyTo({ center: [r.loc.lng, r.loc.lat], zoom: 15 });
    setMarker(r.loc);
    onChange(r.loc, r.name);
    setResults([]);
    setQuery(r.name);
  };

  return (
    <div className="pickerMap">
      <div className="searchRow">
        <input className="pickerSearch" value={query} placeholder="ابحث عن مكان..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }} />
        <button type="button" className="searchBtn" onClick={runSearch} disabled={searching}>
          {searching ? "..." : "بحث"}
        </button>
      </div>
      {results.length > 0 && (
        <ul className="searchResults">
          {results.map((r, i) => (
            <li key={i} onClick={() => pick(r)}>{r.name}</li>
          ))}
        </ul>
      )}
      <div ref={containerRef} className="mapCanvas" />
      <p className="mapHint">اضغط على الخريطة أو اسحب الدبوس لتحديد الموقع بدقة</p>
      <button type="button" className="pickerDone" onClick={onClose}>تم</button>
    </div>
  );
}

async function reverseGeocode(loc: LatLng): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`;
    const res = await fetch(url, { headers: { "Accept-Language": "ar" } });
    const data = await res.json();
    return data.display_name || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
  } catch {
    return `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
  }
}
