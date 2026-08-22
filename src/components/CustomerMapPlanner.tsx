import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import type { LatLng } from "../lib/geo";
import { findArabicMatch } from "../lib/arabicSearch";
import { PIN_FROM, PIN_TO, STOP_PINS } from "../assets/v1172/mapPins";
import "./customerMapPlanner.css";
import "./customerMapAssetsV1172.css";

type KnownPlace = { id: string; name: string; lat: number; lng: number; district_name: string | null; city_name: string | null; parent_name: string | null };
type SearchResult = { key: string; name: string; context: string; loc: LatLng; placeId: string | null; source: "saved" | "map" };
type Stage = "pickup" | "dropoff" | "stop" | "done";
type StopEntry = { loc: LatLng | null; addr: string };
type PinKind = "pickup" | "dropoff" | "draft" | "stop";

type Props = {
  pickup: LatLng | null;
  pickupAddress: string;
  dropoff: LatLng | null;
  dropoffAddress: string;
  stops?: StopEntry[];
  stopRequestKey?: number;
  onStopConfirm?: (loc: LatLng, address: string) => void;
  onPickupChange: (loc: LatLng, address: string) => void;
  onDropoffChange: (loc: LatLng, address: string) => void;
  onPickupPlaceSelect?: (id: string | null) => void;
  onDropoffPlaceSelect?: (id: string | null) => void;
  children?: ReactNode;
};

const CAIRO: LatLng = { lat: 30.0444, lng: 31.2357 };
const GUIDE_SESSION_KEY = "wd-customer-map-guide-v1";
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

export default function CustomerMapPlanner({ pickup, pickupAddress, dropoff, dropoffAddress, stops = [], stopRequestKey = 0, onStopConfirm, onPickupChange, onDropoffChange, onPickupPlaceSelect, onDropoffPlaceSelect, children }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const stageRef = useRef<Stage>(pickup && dropoff ? "done" : pickup ? "dropoff" : "pickup");
  const pickupMarker = useRef<maplibregl.Marker | null>(null);
  const dropoffMarker = useRef<maplibregl.Marker | null>(null);
  const draftMarker = useRef<maplibregl.Marker | null>(null);
  const stopMarkers = useRef<maplibregl.Marker[]>([]);
  const pointJustDraggedAt = useRef(0);
  const [stage, setStageState] = useState<Stage>(stageRef.current);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<SearchResult[]>([]);
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<{ loc: LatLng; address: string; placeId: string | null } | null>(null);
  const [locating, setLocating] = useState(!pickup);
  const [routeCardSmall, setRouteCardSmall] = useState(false);
  const [routeCardY, setRouteCardY] = useState(104);
  const [guideVisible, setGuideVisible] = useState(false);
  const routeDrag = useRef<{ y: number; top: number } | null>(null);
  const lastStopRequest = useRef(stopRequestKey);

  const setStage = (next: Stage) => { stageRef.current = next; setStageState(next); };
  const activeLabel = stage === "pickup" ? "نقطة الانطلاق" : stage === "dropoff" ? "نقطة الوصول" : "نقطة توقف";

  const dismissGuide = useCallback(() => {
    setGuideVisible(false);
    try { sessionStorage.setItem(GUIDE_SESSION_KEY, "1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let shown = false;
    try { shown = sessionStorage.getItem(GUIDE_SESSION_KEY) === "1"; } catch { /* ignore */ }
    if (!shown) {
      const t = window.setTimeout(() => setGuideVisible(true), 850);
      return () => window.clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!guideVisible) return;
    const t = window.setTimeout(dismissGuide, 9500);
    return () => window.clearTimeout(t);
  }, [guideVisible, dismissGuide]);

  const pinAsset = useCallback((kind: PinKind, stopIndex = 0) => {
    if (kind === "pickup") return PIN_FROM;
    if (kind === "dropoff") return PIN_TO;
    if (kind === "stop") return STOP_PINS[Math.max(0, Math.min(2, stopIndex))];
    if (stageRef.current === "pickup") return PIN_FROM;
    if (stageRef.current === "dropoff") return PIN_TO;
    return STOP_PINS[Math.max(0, Math.min(2, stops.length))];
  }, [stops.length]);

  const makePin = useCallback((kind: PinKind, onClick?: () => void, stopIndex = 0) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `cmpPin assetPin ${kind}`;
    el.setAttribute("aria-label", kind === "pickup" ? "اسحب لتغيير نقطة الانطلاق أو اضغط لفتح التحرير" : kind === "dropoff" ? "اسحب لتغيير نقطة الوصول أو اضغط لفتح التحرير" : kind === "stop" ? `نقطة توقف ${stopIndex + 1}` : "الموقع المحدد");
    const img = document.createElement("img");
    img.src = pinAsset(kind, stopIndex);
    img.alt = "";
    img.draggable = false;
    el.appendChild(img);
    if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return el;
  }, [pinAsset]);

  const openPickup = useCallback(() => {
    if (Date.now() - pointJustDraggedAt.current < 450) return;
    dismissGuide();
    setStage("pickup");
    setDraft(pickup ? { loc: pickup, address: pickupAddress, placeId: null } : null);
    setQuery(pickupAddress);
    setSearchOpen(true);
    setRouteCardSmall(false);
  }, [pickup, pickupAddress, dismissGuide]);

  const openDropoff = useCallback(() => {
    if (Date.now() - pointJustDraggedAt.current < 450 || !pickup) return;
    dismissGuide();
    setStage("dropoff");
    setDraft(dropoff ? { loc: dropoff, address: dropoffAddress, placeId: null } : null);
    setQuery(dropoffAddress);
    setSearchOpen(true);
    setRouteCardSmall(false);
  }, [pickup, dropoff, dropoffAddress, dismissGuide]);

  const syncMarker = useCallback((ref: { current: maplibregl.Marker | null }, loc: LatLng | null, kind: "pickup" | "dropoff", click: () => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (!loc) { ref.current?.remove(); ref.current = null; return; }
    if (!ref.current) {
      const marker = new maplibregl.Marker({ element: makePin(kind, click), draggable: true }).setLngLat([loc.lng, loc.lat]).addTo(map);
      marker.on("dragstart", () => dismissGuide());
      marker.on("dragend", async () => {
        pointJustDraggedAt.current = Date.now();
        const p = marker.getLngLat();
        const next = { lat: p.lat, lng: p.lng };
        const address = await reverseGeocode(next);

        // لا نعتمد التغيير فور السحب: نرجع الماركر الأصلي لمكانه ونظهر ماركر المعاينة مع زر تأكيد.
        marker.setLngLat([loc.lng, loc.lat]);
        if (kind === "pickup") onPickupPlaceSelect?.(null); else onDropoffPlaceSelect?.(null);
        setStage(kind);
        setDraft({ loc: next, address, placeId: null });
        setQuery("");
        setSearchOpen(false);
        setRouteCardSmall(false);
        mapRef.current?.easeTo({ center: [next.lng, next.lat], zoom: Math.max(mapRef.current.getZoom(), 15), offset: [0, 105], duration: 300 });
      });
      ref.current = marker;
    } else ref.current.setLngLat([loc.lng, loc.lat]);
  }, [makePin, dismissGuide, onPickupPlaceSelect, onDropoffPlaceSelect]);

  const fitPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map || searchOpen || draft) return;
    const pts = [pickup, ...stops.map(s => s.loc).filter(Boolean), dropoff].filter(Boolean) as LatLng[];
    if (pts.length === 1) map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 15, offset: [0, 105] });
    if (pts.length >= 2) {
      const b = new maplibregl.LngLatBounds();
      pts.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: { top: 190, right: 48, bottom: 230, left: 48 }, maxZoom: 15, duration: 450 });
    }
  }, [pickup, dropoff, stops, searchOpen, draft]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: mapEl.current, style: STYLE, center: [CAIRO.lng, CAIRO.lat], zoom: 11 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("load", () => { map.resize(); setTimeout(() => map.resize(), 250); });
    map.on("click", async (e) => {
      const activeStage = stageRef.current;
      if (activeStage === "done") return;
      dismissGuide();
      const loc = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      const address = await reverseGeocode(loc);
      setDraft({ loc, address, placeId: null });
      setSearchOpen(false);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [dismissGuide]);

  useEffect(() => { syncMarker(pickupMarker, pickup, "pickup", openPickup); }, [pickup, openPickup, syncMarker]);
  useEffect(() => { syncMarker(dropoffMarker, dropoff, "dropoff", openDropoff); }, [dropoff, openDropoff, syncMarker]);
  useEffect(() => { if (mapRef.current) fitPoints(); }, [pickup, dropoff, stops, fitPoints]);

  useEffect(() => {
    stopMarkers.current.forEach(m => m.remove());
    stopMarkers.current = [];
    const map = mapRef.current;
    if (!map) return;
    stops.forEach((s, i) => {
      if (s.loc) stopMarkers.current.push(new maplibregl.Marker({ element: makePin("stop", undefined, i) }).setLngLat([s.loc.lng, s.loc.lat]).addTo(map));
    });
  }, [stops, makePin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draft) { draftMarker.current?.remove(); draftMarker.current = null; return; }
    draftMarker.current?.remove();
    const draftKind: PinKind = stage === "pickup" ? "pickup" : stage === "dropoff" ? "dropoff" : stage === "stop" ? "stop" : "draft";
    draftMarker.current = new maplibregl.Marker({ element: makePin(draftKind, undefined, stops.length), draggable: true }).setLngLat([draft.loc.lng, draft.loc.lat]).addTo(map);
    draftMarker.current.on("dragend", async () => {
      const p = draftMarker.current!.getLngLat();
      const loc = { lat: p.lat, lng: p.lng };
      setDraft({ loc, address: await reverseGeocode(loc), placeId: null });
    });
    map.flyTo({ center: [draft.loc.lng, draft.loc.lat], zoom: Math.max(map.getZoom(), 15), duration: 350 });
    return () => { draftMarker.current?.remove(); draftMarker.current = null; };
  }, [draft?.loc.lat, draft?.loc.lng, stage, stops.length, makePin]);

  useEffect(() => {
    if (pickup) { setLocating(false); return; }
    if (!navigator.geolocation) { setLocating(false); setStage("pickup"); setSearchOpen(false); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const address = await reverseGeocode(loc);
      onPickupChange(loc, address);
      onPickupPlaceSelect?.(null);
      setStage("dropoff");
      setLocating(false);
      setSearchOpen(false);
      mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 16, offset: [0, 115], duration: 450 });
    }, () => {
      setLocating(false);
      setStage("pickup");
      setSearchOpen(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }, []);

  useEffect(() => {
    if (stopRequestKey === lastStopRequest.current) return;
    lastStopRequest.current = stopRequestKey;
    if (!pickup || !dropoff) return;
    dismissGuide();
    setStage("stop");
    setDraft(null);
    setQuery("");
    setSearchOpen(false);
    setRouteCardSmall(true);
  }, [stopRequestKey, pickup, dropoff, dismissGuide]);

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
    setSearchOpen(false);
    setQuery(r.name);
  };

  const confirmDraft = () => {
    if (!draft) return;
    if (stage === "pickup") {
      onPickupChange(draft.loc, draft.address);
      onPickupPlaceSelect?.(draft.placeId);
      setStage("dropoff");
      setDraft(null);
      setQuery("");
      setSearchOpen(false);
      window.setTimeout(() => {
        if (!dropoff) {
          setStage("dropoff");
          setDraft(null);
          mapRef.current?.easeTo({ center: [draft.loc.lng, draft.loc.lat], zoom: Math.max(mapRef.current.getZoom(), 15), offset: [0, 105], duration: 250 });
        }
      }, 0);
    } else if (stage === "dropoff") {
      onDropoffChange(draft.loc, draft.address);
      onDropoffPlaceSelect?.(draft.placeId);
      setStage("done");
      setDraft(null);
      setQuery("");
      setSearchOpen(false);
    } else if (stage === "stop") {
      onStopConfirm?.(draft.loc, draft.address);
      setStage("done");
      setDraft(null);
      setQuery("");
      setSearchOpen(false);
      setRouteCardSmall(false);
    }
  };

  const results = useMemo(() => [...saved, ...remote.filter(r => !saved.some(s => s.name === r.name))], [saved, remote]);
  const startRouteDrag = (e: React.PointerEvent<HTMLDivElement>) => { routeDrag.current = { y: e.clientY, top: routeCardY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const moveRouteDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!routeDrag.current) return;
    setRouteCardY(Math.max(74, Math.min(window.innerHeight * 0.55, routeDrag.current.top + (e.clientY - routeDrag.current.y))));
  };
  const endRouteDrag = () => { routeDrag.current = null; };

  return (
    <div className="cmpShell" dir="rtl">
      <div ref={mapEl} className="cmpMap" />
      <div className={`cmpTopCard ${routeCardSmall ? "small" : ""} ${guideVisible ? "guided" : ""}`} style={{ top: routeCardY }} onClickCapture={dismissGuide}>
        <div className="cmpFloatHandle" onPointerDown={startRouteDrag} onPointerMove={moveRouteDrag} onPointerUp={endRouteDrag} onPointerCancel={endRouteDrag}><span/><button type="button" onClick={() => setRouteCardSmall(v => !v)} aria-label={routeCardSmall ? "تكبير لوحة النقاط" : "تصغير لوحة النقاط"}>{routeCardSmall ? "□" : "—"}</button></div>
        {!routeCardSmall && <>
          <div className="cmpPointRow pickup"><button type="button" className="cmpReselect" onClick={openPickup} aria-label="إعادة اختيار نقطة الانطلاق">↻</button><button type="button" className="cmpPoint" onClick={openPickup}><span className="cmpDot green"/><span className="cmpAddressText"><small>من</small><b title={pickupAddress}>{pickupAddress || (locating ? "جارٍ تحديد موقعك..." : "حدد نقطة الانطلاق")}</b></span></button></div>
          <div className="cmpPointRow dropoff"><button type="button" className="cmpReselect" onClick={openDropoff} disabled={!pickup} aria-label="إعادة اختيار نقطة الوصول">↻</button><button type="button" className="cmpPoint" onClick={openDropoff} disabled={!pickup}><span className="cmpDot blue"/><span className="cmpAddressText"><small>إلى</small><b title={dropoffAddress}>{dropoffAddress || "إلى أين؟"}</b></span></button></div>
        </>}
        {routeCardSmall && <button type="button" className="cmpMiniRoute" onClick={() => setRouteCardSmall(false)}><span className="cmpDot green"/><b>من</b><span>←</span><span className="cmpDot blue"/><b>إلى</b></button>}
      </div>

      {guideVisible && !searchOpen && stage !== "stop" && <div className="cmpWelcomeGuide" style={{ top: Math.min(routeCardY + (routeCardSmall ? 64 : 164), 360) }} role="status"><button type="button" className="cmpGuideClose" onClick={dismissGuide} aria-label="إغلاق الإرشاد">×</button><div className="cmpGuideAvatar" aria-label="أفاتار كابتن بنها المؤقت">🚕</div><div className="cmpGuideText"><b>أهلاً بيك في كابتن بنها 👋</b><span>تقدر تغيّر نقطة الانطلاق أو الوصول من البحث الذكي <strong>من هنا</strong>، أو تختار المكان مباشرة من الخريطة.</span></div><i className="cmpGuideArrow" aria-hidden="true">↑</i></div>}
      {stage === "dropoff" && !dropoff && !searchOpen && !draft && <button type="button" className="cmpDestinationPrompt" onClick={openDropoff}>🔎 إلى أين تريد الذهاب؟</button>}
      {stage === "stop" && !searchOpen && !draft && <div className="cmpStopPrompt"><b>حدد نقطة التوقف</b><span>اضغط على الخريطة أو ابحث عن المكان</span><button type="button" onClick={() => setSearchOpen(true)}>بحث</button></div>}
      {draft && !searchOpen && <div className={`cmpConfirmCard ${stage === "stop" ? "stop" : ""}`}><div><small>{activeLabel}</small><b>{draft.address}</b><span>يمكنك سحب الدبوس لضبط المكان بدقة</span></div><button type="button" onClick={confirmDraft}>{stage === "pickup" ? "تأكيد نقطة الانطلاق" : stage === "dropoff" ? "تأكيد نقطة الوصول" : "تأكيد"}</button></div>}
      {stage === "done" && children && <div className="cmpTripSheet">{children}</div>}
      {searchOpen && <section className="cmpSearchSheet" aria-label={`بحث ${activeLabel}`}><div className="cmpGrab"/><header><button type="button" onClick={() => setSearchOpen(false)}>×</button><div><small>{activeLabel}</small><h2>{stage === "pickup" ? "اختر نقطة الانطلاق" : stage === "dropoff" ? "أدخل وجهتك" : "أضف نقطة توقف"}</h2></div></header><div className="cmpSearchBox">⌕<input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={stage === "pickup" ? "ابحث عن مكان الانطلاق..." : stage === "dropoff" ? "ابحث عن مكان الوصول..." : "ابحث عن نقطة التوقف..."}/>{query && <button type="button" onClick={() => setQuery("")}>×</button>}</div><div className="cmpResults">{searching && <p className="cmpStatus">جارٍ البحث في الأماكن المحفوظة والخريطة...</p>}{!searching && query.trim() && results.length === 0 && <p className="cmpStatus">لا توجد نتائج مطابقة — يمكنك اختيار النقطة مباشرة من الخريطة.</p>}{results.map(r => <button type="button" key={r.key} className="cmpResult" onClick={() => choose(r)}><span className={`cmpResultIcon ${r.source}`}>⌖</span><span><b><Highlight text={r.name} query={query}/></b>{r.context && <small><Highlight text={r.context} query={query}/></small>}<em>{r.source === "saved" ? "مكان محفوظ في كابتن بنها" : "نتيجة من الخريطة"}</em></span></button>)}</div></section>}
    </div>
  );
}
