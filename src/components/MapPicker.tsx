import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import type { LatLng } from "../lib/geo";

type PinColor = "green" | "red" | "amber";

interface KnownPlace { id: string; name: string; lat: number; lng: number; district_name: string | null; city_name: string | null; }

interface Props {
  label: string;
  color: PinColor;
  value: LatLng | null;
  address: string;
  autoLocate?: boolean;
  onChange: (loc: LatLng, address: string) => void;
  // يُستدعى عند اختيار مكان معروف (بمعرّفه) أو أي نقطة أخرى (null)
  onPlaceSelect?: (placeId: string | null) => void;
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

// يتعرّف على إحداثيات ملصوقة من خرائط جوجل بأي صيغة شائعة:
// "30.4706813, 31.1844191" أو "(30.4706813, 31.1844191)" أو "@30.4706813,31.1844191"
function parseCoordsInput(text: string): LatLng | null {
  const m = text.match(/(-?\d{1,2}\.\d+)\s*[,،]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function MapPicker({ label, color, value, address, autoLocate, onChange, onPlaceSelect }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mapPicker">
      <label>{label}</label>
      <button type="button" className="pickerField" onClick={() => setOpen((o) => !o)}>
        <i className={color === "green" ? "dotFrom" : color === "amber" ? "dotStop" : "dotTo"} />
        <span>{address || "اضغط للاختيار على الخريطة"}</span>
      </button>
      {open && (
        <MapPanel color={color} value={value} autoLocate={autoLocate} onChange={onChange} onPlaceSelect={onPlaceSelect} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function MapPanel({
  color, value, autoLocate, onChange, onPlaceSelect, onClose,
}: { color: PinColor; value: LatLng | null; autoLocate?: boolean; onChange: Props["onChange"]; onPlaceSelect?: Props["onPlaceSelect"]; onClose: () => void; }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; loc: LatLng }[]>([]);
  const [localPlaces, setLocalPlaces] = useState<KnownPlace[]>([]);
  const [coordPick, setCoordPick] = useState<LatLng | null>(null);
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
        onPlaceSelect?.(null);
      });
    } else {
      markerRef.current.setLngLat([loc.lng, loc.lat]);
    }
  }, [color, onChange, onPlaceSelect]);

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
      onPlaceSelect?.(null);
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
      onPlaceSelect?.(null);
    });

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [value, autoLocate, setMarker, onChange, onPlaceSelect]);

  // التعرّف على إحداثيات ملصوقة من خرائط جوجل أثناء الكتابة
  useEffect(() => {
    setCoordPick(parseCoordsInput(query));
  }, [query]);

  // تلميحات الأماكن المعروفة أثناء الكتابة — بحث عربي متسامح (يظهر من أول حرف)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || parseCoordsInput(q)) { setLocalPlaces([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_places", { p_query: q });
      setLocalPlaces((data as KnownPlace[]) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // البحث عبر Nominatim
  const runSearch = async () => {
    if (!query.trim()) return;
    // لو المدخل إحداثيات، طبّقها مباشرة بدل البحث النصي
    const coords = parseCoordsInput(query);
    if (coords) { pickCoords(coords); return; }
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

  // تثبيت الدبوس على إحداثيات ملصوقة + جلب اسم المكان تلقائيًا
  const pickCoords = (loc: LatLng) => {
    mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 16 });
    setMarker(loc);
    reverseGeocode(loc).then((addr) => onChange(loc, addr));
    onPlaceSelect?.(null);
    setCoordPick(null);
    setLocalPlaces([]);
    setResults([]);
    setQuery(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
  };

  // اختيار مكان معروف من التلميحات
  const pickKnown = (p: KnownPlace) => {
    const loc = { lat: p.lat, lng: p.lng };
    mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 15 });
    setMarker(loc);
    const label = p.district_name ? `${p.name} — ${p.district_name}` : p.name;
    onChange(loc, label);
    onPlaceSelect?.(p.id);
    setLocalPlaces([]);
    setResults([]);
    setQuery(p.name);
  };

  const pick = (r: { name: string; loc: LatLng }) => {
    mapRef.current?.flyTo({ center: [r.loc.lng, r.loc.lat], zoom: 15 });
    setMarker(r.loc);
    onChange(r.loc, r.name);
    onPlaceSelect?.(null);
    setResults([]);
    setQuery(r.name);
  };

  return (
    <div className="pickerMap">
      <div className="searchRow">
        <input className="pickerSearch" value={query} placeholder="ابحث أو الصق إحداثيات من خرائط جوجل..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }} />
        <button type="button" className="searchBtn" onClick={runSearch} disabled={searching}>
          {searching ? "..." : "بحث"}
        </button>
      </div>
      {coordPick && (
        <ul className="searchResults localPlaces">
          <li onClick={() => pickCoords(coordPick)}>
            <span className="lpName">📍 {coordPick.lat.toFixed(6)}, {coordPick.lng.toFixed(6)}</span>
            <small className="lpCtx">تحديد هذه الإحداثيات على الخريطة</small>
          </li>
        </ul>
      )}
      {localPlaces.length > 0 && (
        <ul className="searchResults localPlaces">
          {localPlaces.map((p) => (
            <li key={p.id} onClick={() => pickKnown(p)}>
              <span className="lpName">{p.name}</span>
              {(p.district_name || p.city_name) && (
                <small className="lpCtx">{[p.district_name, p.city_name].filter(Boolean).join(" — ")}</small>
              )}
            </li>
          ))}
        </ul>
      )}
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
