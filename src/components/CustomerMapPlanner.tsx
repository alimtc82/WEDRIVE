import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import type { LatLng } from "../lib/geo";
import { findArabicMatch } from "../lib/arabicSearch";
import "./customerMapPlanner.css";

type KnownPlace = { id: string; name: string; lat: number; lng: number; district_name: string | null; city_name: string | null; parent_name: string | null };
type SearchResult = { key: string; name: string; context: string; loc: LatLng; placeId: string | null; source: "saved" | "map" };
type Stage = "pickup" | "dropoff" | "done";

type Props = {
  pickup: LatLng | null;
  pickupAddress: string;
  dropoff: LatLng | null;
  dropoffAddress: string;
  onPickupChange: (loc: LatLng, address: string) => void;
  onDropoffChange: (loc: LatLng, address: string) => void;
  onPickupPlaceSelect?: (id: string | null) => void;
  onDropoffPlaceSelect?: (id: string | null) => void;
  children?: ReactNode;
};

const CAIRO: LatLng = { lat: 30.0444, lng: 31.2357 };
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function Highlight({ text, query }: { text: string; query: string }) {
  const m = findArabicMatch(text, query);
  if (!m) return <>{text}</>;
  return <>{text.slice(0, m.start)}<mark>{text.slice(m.start, m.start + m.length)}</mark>{text.slice(m.start + m.length)}</>;
}

async function reverseGeocode(loc: LatLng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`, { headers: { "Accept-Language": "ar" } });
    const d = await r.json();
    return d.display_name || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
  } catch { return `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`; }
}

export default function CustomerMapPlanner({ pickup, pickupAddress, dropoff, dropoffAddress, onPickupChange, onDropoffChange, onPickupPlaceSelect, onDropoffPlaceSelect, children }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pickupMarker = useRef<maplibregl.Marker | null>(null);
  const dropoffMarker = useRef<maplibregl.Marker | null>(null);
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  const [stage, setStage] = useState<Stage>(pickup && dropoff ? "done" : pickup ? "dropoff" : "pickup");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<SearchResult[]>([]);
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<{ loc: LatLng; address: string; placeId: string | null } | null>(null);
  const [locating, setLocating] = useState(!pickup);
  const activeLabel = stage === "pickup" ? "نقطة الانطلاق" : "نقطة الوصول";

  const makePin = useCallback((kind: "pickup" | "dropoff" | "draft", onClick?: () => void) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `cmpPin ${kind}`;
    el.setAttribute("aria-label", kind === "pickup" ? "تعديل نقطة الانطلاق" : kind === "dropoff" ? "تعديل نقطة الوصول" : "الموقع المحدد");
    if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return el;
  }, []);

  const openPickup = useCallback(() => { setStage("pickup"); setDraft(pickup ? { loc: pickup, address: pickupAddress, placeId: null } : null); setQuery(pickupAddress); setSearchOpen(true); }, [pickup, pickupAddress]);
  const openDropoff = useCallback(() => { if (!pickup) return; setStage("dropoff"); setDraft(dropoff ? { loc: dropoff, address: dropoffAddress, placeId: null } : null); setQuery(dropoffAddress); setSearchOpen(true); }, [pickup, dropoff, dropoffAddress]);

  const syncMarker = useCallback((ref: React.MutableRefObject<maplibregl.Marker | null>, loc: LatLng | null, kind: "pickup" | "dropoff", click: () => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (!loc) { ref.current?.remove(); ref.current = null; return; }
    if (!ref.current) ref.current = new maplibregl.Marker({ element: makePin(kind, click) }).setLngLat([loc.lng, loc.lat]).addTo(map);
    else ref.current.setLngLat([loc.lng, loc.lat]);
  }, [makePin]);

  const fitPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [pickup, dropoff].filter(Boolean) as LatLng[];
    if (pts.length === 1) map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 15 });
    if (pts.length === 2) {
      const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: { top: 110, right: 55, bottom: 210, left: 55 }, maxZoom: 15, duration: 500 });
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: mapEl.current, style: STYLE, center: [CAIRO.lng, CAIRO.lat], zoom: 11 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("load", () => { map.resize(); setTimeout(() => map.resize(), 250); });
    map.on("click", async (e) => {
      if (stage === "done") return;
      const loc = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      const address = await reverseGeocode(loc);
      setDraft({ loc, address, placeId: null });
      setSearchOpen(false);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []); // intentional: map lifetime only

  useEffect(() => { syncMarker(pickupMarker, pickup, "pickup", openPickup); }, [pickup, openPickup, syncMarker]);
  useEffect(() => { syncMarker(dropoffMarker, dropoff, "dropoff", openDropoff); }, [dropoff, openDropoff, syncMarker]);
  useEffect(() => { if (mapRef.current) fitPoints(); }, [pickup, dropoff, fitPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draft) { draftMarker.current?.remove(); draftMarker.current = null; return; }
    if (!draftMarker.current) {
      draftMarker.current = new maplibregl.Marker({ element: makePin("draft"), draggable: true }).setLngLat([draft.loc.lng, draft.loc.lat]).addTo(map);
      draftMarker.current.on("dragend", async () => {
        const p = draftMarker.current!.getLngLat();
        const loc = { lat: p.lat, lng: p.lng };
        setDraft({ loc, address: await reverseGeocode(loc), placeId: null });
      });
    } else draftMarker.current.setLngLat([draft.loc.lng, draft.loc.lat]);
    map.flyTo({ center: [draft.loc.lng, draft.loc.lat], zoom: Math.max(map.getZoom(), 15), duration: 400 });
  }, [draft?.loc.lat, draft?.loc.lng, makePin]);

  useEffect(() => {
    if (pickup) { setLocating(false); return; }
    if (!navigator.geolocation) { setLocating(false); setSearchOpen(true); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const address = await reverseGeocode(loc);
      onPickupChange(loc, address); onPickupPlaceSelect?.(null);
      setStage("dropoff"); setLocating(false);
      mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 15 });
    }, () => { setLocating(false); setStage("pickup"); setSearchOpen(true); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 1) { setSaved([]); setRemote([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(async () => {
      const localReq = supabase.rpc("search_places", { p_query: q });
      const mapReq = fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=eg&limit=7&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "ar" } }).then(r => r.ok ? r.json() : []);
      const [localRes, mapRes] = await Promise.allSettled([localReq, mapReq]);
      if (cancelled) return;
      if (localRes.status === "fulfilled") {
        const rows = ((localRes.value.data || []) as KnownPlace[]);
        setSaved(rows.map(p => ({ key: `saved-${p.id}`, name: p.name, context: [p.parent_name, p.district_name, p.city_name].filter(Boolean).join(" — "), loc: { lat: p.lat, lng: p.lng }, placeId: p.id, source: "saved" })));
      } else setSaved([]);
      if (mapRes.status === "fulfilled") {
        const rows = mapRes.value as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
        setRemote(rows.map(r => { const parts = r.display_name.split(","); return { key: `map-${r.place_id}`, name: parts[0] || r.display_name, context: parts.slice(1, 4).join("، "), loc: { lat: Number(r.lat), lng: Number(r.lon) }, placeId: null, source: "map" as const }; }));
      } else setRemote([]);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [query, searchOpen]);

  const choose = (r: SearchResult) => {
    const address = r.context ? `${r.name} — ${r.context}` : r.name;
    setDraft({ loc: r.loc, address, placeId: r.placeId });
    setSearchOpen(false); setQuery(r.name);
  };

  const confirmDraft = () => {
    if (!draft) return;
    if (stage === "pickup") {
      onPickupChange(draft.loc, draft.address); onPickupPlaceSelect?.(draft.placeId);
      setStage("dropoff"); setDraft(null); setQuery(""); setSearchOpen(true);
    } else {
      onDropoffChange(draft.loc, draft.address); onDropoffPlaceSelect?.(draft.placeId);
      setStage("done"); setDraft(null); setQuery(""); setSearchOpen(false);
    }
  };

  const results = useMemo(() => [...saved, ...remote.filter(r => !saved.some(s => s.name === r.name))], [saved, remote]);

  return (
    <div className="cmpShell" dir="rtl">
      <div ref={mapEl} className="cmpMap" />
      <div className="cmpTopCard">
        <button type="button" className="cmpPoint pickup" onClick={openPickup}>
          <span className="cmpDot green"/><span><small>من</small><b>{pickupAddress || (locating ? "جارٍ تحديد موقعك..." : "حدد نقطة الانطلاق")}</b></span>
        </button>
        <button type="button" className="cmpPoint dropoff" onClick={openDropoff} disabled={!pickup}>
          <span className="cmpDot red"/><span><small>إلى</small><b>{dropoffAddress || "إلى أين؟"}</b></span>
        </button>
      </div>

      {stage === "dropoff" && !dropoff && !searchOpen && !draft && (
        <button type="button" className="cmpDestinationPrompt" onClick={openDropoff}>🔎 إلى أين تريد الذهاب؟</button>
      )}

      {draft && !searchOpen && (
        <div className="cmpConfirmCard">
          <div><small>{activeLabel}</small><b>{draft.address}</b><span>يمكنك سحب الدبوس لضبط المكان بدقة</span></div>
          <button type="button" onClick={confirmDraft}>تأكيد</button>
        </div>
      )}

      {stage === "done" && children && <div className="cmpTripSheet">{children}</div>}

      {searchOpen && (
        <section className="cmpSearchSheet" aria-label={`بحث ${activeLabel}`}>
          <div className="cmpGrab" />
          <header><button type="button" onClick={() => setSearchOpen(false)}>×</button><div><small>{activeLabel}</small><h2>{stage === "pickup" ? "اختر نقطة الانطلاق" : "أدخل وجهتك"}</h2></div></header>
          <div className="cmpSearchBox">⌕<input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={stage === "pickup" ? "ابحث عن مكان الانطلاق..." : "ابحث عن مكان الوصول..."}/>{query && <button type="button" onClick={() => setQuery("")}>×</button>}</div>
          <div className="cmpResults">
            {searching && <p className="cmpStatus">جارٍ البحث في الأماكن المحفوظة والخريطة...</p>}
            {!searching && query.trim() && results.length === 0 && <p className="cmpStatus">لا توجد نتائج مطابقة — يمكنك اختيار النقطة مباشرة من الخريطة.</p>}
            {results.map(r => <button type="button" key={r.key} className="cmpResult" onClick={() => choose(r)}>
              <span className={`cmpResultIcon ${r.source}`}>⌖</span><span><b><Highlight text={r.name} query={query}/></b>{r.context && <small><Highlight text={r.context} query={query}/></small>}<em>{r.source === "saved" ? "مكان محفوظ في كابتن بنها" : "نتيجة من الخريطة"}</em></span>
            </button>)}
          </div>
        </section>
      )}
    </div>
  );
}
