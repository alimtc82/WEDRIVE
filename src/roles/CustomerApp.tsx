import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Settings, TripKind } from "../lib/types";
import { drivingRouteKm, guessKind, type LatLng } from "../lib/geo";
import TopBar from "../components/TopBar";
import CustomerMapPlanner from "../components/CustomerMapPlanner";
import CustomerHelpGuide from "../components/CustomerHelpGuide";
import ActiveTrip from "../components/ActiveTrip";
import CustomerOffers from "./CustomerOffers";
import MyTrips from "../pages/MyTrips";
import MyRatings from "../pages/MyRatings";
import "../listPages.css";

const MAX_STOPS = 3;
const roundFareDownTo5 = (value: number) => Math.floor(value / 5) * 5;
interface StopEntry { loc: LatLng | null; addr: string; }
interface FixedRoute { id: string; name: string | null; from_place_id: string; from_name: string; from_lat: number; from_lng: number; to_place_id: string; to_name: string; to_lat: number; to_lng: number; price: number; reverse_price: number | null; }
type CustomerTab = "home" | "trips" | "ratings";

export default function CustomerApp() {
  const [tab, setTab] = useState<CustomerTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpReplay, setHelpReplay] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeTrip, setActiveTrip] = useState<{ id: string; status: string } | null>(null);
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupAddr, setPickupAddr] = useState("");
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [dropoffAddr, setDropoffAddr] = useState("");
  const [pickupPlaceId, setPickupPlaceId] = useState<string | null>(null);
  const [dropoffPlaceId, setDropoffPlaceId] = useState<string | null>(null);
  const [fixedPrice, setFixedPrice] = useState<number | null>(null);
  const [stops, setStops] = useState<StopEntry[]>([]);
  const [stopPickSeq, setStopPickSeq] = useState(0);
  const [showFixedRoutes, setShowFixedRoutes] = useState(false);
  const [fixedRoutes, setFixedRoutes] = useState<FixedRoute[]>([]);
  const [pickedRouteId, setPickedRouteId] = useState<string | null>(null);
  const [kind, setKind] = useState<TripKind>("in_city");
  const [distance, setDistance] = useState<number | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailsMinimized, setDetailsMinimized] = useState(false);
  const detailsDragStart = useRef<{ y: number; last: number } | null>(null);

  const checkActive = useCallback(async () => {
    const { data } = await supabase.rpc("my_active_trip");
    if (data) setActiveTrip({ id: data.id, status: data.status }); else setActiveTrip(null);
  }, []);

  useEffect(() => {
    void checkActive();
    const ch = supabase.channel("cust-active").on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => void checkActive()).subscribe(status => { if (status === "SUBSCRIBED") void checkActive(); });
    const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine) void checkActive(); };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(refresh, 8000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", onVisibility); void supabase.removeChannel(ch); };
  }, [checkActive]);

  useEffect(() => {
    supabase.from("settings").select("*").single().then(({ data }) => {
      if (!data) return;
      setSettings(data as Settings);
      const visible = (data as Settings & { show_fixed_routes?: boolean }).show_fixed_routes !== false;
      setShowFixedRoutes(visible);
      if (visible) supabase.rpc("list_fixed_routes").then(({ data: rows }) => setFixedRoutes((rows as FixedRoute[]) || []));
    });
  }, []);

  useEffect(() => {
    if (!pickupPlaceId || !dropoffPlaceId || stops.length > 0) { setFixedPrice(null); return; }
    supabase.rpc("fixed_route_price", { p_from: pickupPlaceId, p_to: dropoffPlaceId }).then(({ data }) => setFixedPrice(typeof data === "number" ? data : null));
  }, [pickupPlaceId, dropoffPlaceId, stops.length]);

  useEffect(() => {
    let cancelled = false;
    if (!pickup || !dropoff || !settings || stops.some(s => !s.loc)) { setDistance(null); setFare(null); setRouteLoading(false); setRouteError(""); return; }
    const points: LatLng[] = [pickup, ...stops.map(s => s.loc!), dropoff];
    setRouteLoading(true); setRouteError(""); setDistance(null); setFare(null);
    drivingRouteKm(points).then(d => {
      if (cancelled) return;
      setDistance(d);
      const automaticKind = guessKind(d);
      setKind(automaticKind);
      const ppk = automaticKind === "intercity" ? settings.price_per_km_intercity : settings.price_per_km_in_city;
      setFare(roundFareDownTo5(Math.max(Math.round(d * ppk * 100) / 100, settings.min_fare)));
    }).catch(() => { if (!cancelled) { setDistance(null); setFare(null); setRouteError("تعذّر حساب مسافة الطريق الآن. تحقق من الإنترنت ثم أعد تحديد الوجهة."); } }).finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [pickup, dropoff, stops, settings]);

  const pickFixedRoute = (r: FixedRoute, reversed: boolean) => {
    const from = reversed ? { id: r.to_place_id, name: r.to_name, lat: r.to_lat, lng: r.to_lng } : { id: r.from_place_id, name: r.from_name, lat: r.from_lat, lng: r.from_lng };
    const to = reversed ? { id: r.from_place_id, name: r.from_name, lat: r.from_lat, lng: r.from_lng } : { id: r.to_place_id, name: r.to_name, lat: r.to_lat, lng: r.to_lng };
    setPickup({ lat: from.lat, lng: from.lng }); setPickupAddr(from.name); setDropoff({ lat: to.lat, lng: to.lng }); setDropoffAddr(to.name);
    setPickupPlaceId(from.id); setDropoffPlaceId(to.id); setStops([]); setPickedRouteId(r.id + (reversed ? "-r" : "")); setDetailsMinimized(false);
  };

  const clearRoute = () => {
    setPickup(null); setPickupAddr(""); setDropoff(null); setDropoffAddr("");
    setPickupPlaceId(null); setDropoffPlaceId(null); setFixedPrice(null); setStops([]); setPickedRouteId(null);
    setDistance(null); setFare(null); setRouteError(""); setErr(""); setMsg(""); setDetailsMinimized(false);
  };

  const requestTrip = async () => {
    setErr(""); setMsg("");
    if (!pickup || !dropoff) { setErr("حدّد مكان الانطلاق والوجهة"); return; }
    if (stops.some(s => !s.loc)) { setErr("حدّد مكان كل نقاط التوقف أو احذفها"); return; }
    if (routeLoading) { setErr("انتظر حتى يكتمل حساب مسافة الطريق"); return; }
    if (routeError || distance == null || distance <= 0) { setErr(routeError || "تعذّر حساب مسافة الطريق"); return; }
    const automaticKind = guessKind(distance);
    setKind(automaticKind);
    setBusy(true);
    const { error } = await supabase.rpc("create_trip", {
      p_pickup_lng: pickup.lng, p_pickup_lat: pickup.lat, p_pickup_address: pickupAddr,
      p_dropoff_lng: dropoff.lng, p_dropoff_lat: dropoff.lat, p_dropoff_address: dropoffAddr,
      p_distance_km: distance, p_kind: automaticKind,
      p_stops: stops.filter(s => s.loc).map(s => ({ lat: s.loc!.lat, lng: s.loc!.lng, address: s.addr })),
      p_from_place_id: pickupPlaceId, p_to_place_id: dropoffPlaceId,
    });
    setBusy(false);
    if (error) { setErr("تعذّر إنشاء الطلب: " + error.message); return; }
    setMsg("تم إرسال طلبك ✓ جارٍ البحث عن كابتن قريب"); clearRoute(); void checkActive();
  };

  const pickFavorite = (t: { pickup: LatLng; pickupAddr: string; dropoff: LatLng; dropoffAddr: string }) => {
    setPickup(t.pickup); setPickupAddr(t.pickupAddr); setDropoff(t.dropoff); setDropoffAddr(t.dropoffAddr);
    setPickupPlaceId(null); setDropoffPlaceId(null); setFixedPrice(null); setStops([]); setPickedRouteId(null); setTab("home"); setMenuOpen(false);
  };

  const navTo = (next: CustomerTab) => { setTab(next); setMenuOpen(false); };
  const replayHelp = () => { setTab("home"); setMenuOpen(false); setHelpReplay(v => v + 1); };

  const beginDetailsDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    detailsDragStart.current = { y: e.clientY, last: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDetailsDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!detailsDragStart.current) return;
    detailsDragStart.current.last = e.clientY;
  };
  const endDetailsDrag = () => {
    const d = detailsDragStart.current;
    detailsDragStart.current = null;
    if (d && d.last - d.y > 90) setDetailsMinimized(true);
  };

  const bookingDetails = pickup && dropoff ? (
    detailsMinimized ? (
      <button className="cmpRestoreDetails" type="button" onClick={() => setDetailsMinimized(false)}>▲ تفاصيل الرحلة</button>
    ) : (
      <div className="cmpBookingDetails">
        <div className="cmpDetailsDrag" onPointerDown={beginDetailsDrag} onPointerMove={moveDetailsDrag} onPointerUp={endDetailsDrag} onPointerCancel={endDetailsDrag} aria-label="اسحب لأسفل لتصغير تفاصيل الرحلة"><span /></div>
        <div className="cmpBookingHead"><b>تفاصيل الرحلة</b><button className="cmpResetTrip" type="button" onClick={clearRoute}>حذف واختيار جديد</button></div>
        {showFixedRoutes && fixedRoutes.length > 0 && (
          <details className="fixedRoutes"><summary className="frTitle">مشاوير بأسعار ثابتة</summary><div className="frList">{fixedRoutes.map(r => <div key={r.id} className={`frRow ${pickedRouteId?.startsWith(r.id) ? "on" : ""}`}><div className="frMain"><b>{r.name || `${r.from_name} ← ${r.to_name}`}</b><small>{r.from_name} ← {r.to_name}</small></div><div className="frSide"><span className="frPrice">{Number(r.price).toFixed(0)} ج</span><button type="button" className="frPick" onClick={() => pickFixedRoute(r, false)}>ذهاب</button>{r.reverse_price != null && <button type="button" className="frPick rev" onClick={() => pickFixedRoute(r, true)}>عودة {Number(r.reverse_price).toFixed(0)} ج</button>}</div></div>)}</div></details>
        )}
        {stops.length > 0 && <div className="cmpStopsList">{stops.map((s, i) => <div key={i}><span className="cmpStopDot"/><span>{s.addr || `نقطة توقف ${i + 1}`}</span><button type="button" onClick={() => setStops(arr => arr.filter((_, j) => j !== i))}>حذف</button></div>)}</div>}
        {stops.length < MAX_STOPS && <button type="button" className="addStopBtn" onClick={() => { setStopPickSeq(v => v + 1); setPickedRouteId(null); setDetailsMinimized(true); }}>＋ إضافة نقطة توقف ({stops.length}/{MAX_STOPS})</button>}
        <div className="cmpAutoKind"><span>نوع الرحلة</span><b>{kind === "in_city" ? "داخل المدينة" : "بين المدن"}</b><small>يحدده النظام تلقائيًا من مسافة الطريق</small></div>
        <div className="fareBox"><div><span>مسافة الطريق{stops.length ? " (شاملة التوقفات)" : ""}</span><b className="distVal">{routeLoading ? "جارٍ الحساب..." : distance != null ? `${distance} كم` : "—"}</b></div><div style={{ textAlign: "left" }}><span>السعر المقترح</span><b>{routeLoading ? "..." : (fixedPrice ?? fare) != null ? `${(fixedPrice ?? fare)!.toFixed(0)} ج.م` : "—"}</b></div></div>
        {routeError && <p className="authError" role="alert">{routeError}</p>}{err && <p className="authError" role="alert">{err}</p>}{msg && <p className="okMsg" role="status">{msg}</p>}
        <button className="cta cmpRequestTrip" onClick={requestTrip} disabled={busy || routeLoading || !distance || !!routeError}>{busy ? "جارٍ الإرسال..." : routeLoading ? "جارٍ حساب الطريق..." : "اطلب رحلة"}</button>
      </div>
    )
  ) : null;

  return <div className="roleShell customerShell" dir="rtl">
    <TopBar title="كابتن بنها — العميل"/>
    <main className="roleMain customerMain">
      <button className="customerMenuBtn" type="button" onClick={() => setMenuOpen(true)} aria-label="فتح قائمة العميل"><span/><span/><span/></button>
      {menuOpen && <div className="customerNavOverlay" onMouseDown={e => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
        <nav className="customerNavDrawer" aria-label="قائمة العميل">
          <div className="customerNavHead"><b>القائمة</b><button type="button" onClick={() => setMenuOpen(false)}>×</button></div>
          <button className={tab === "home" ? "on" : ""} onClick={() => navTo("home")}>⌂ الرئيسية</button>
          <button className={tab === "trips" ? "on" : ""} onClick={() => navTo("trips")}>🚕 رحلاتي</button>
          <button className={tab === "ratings" ? "on" : ""} onClick={() => navTo("ratings")}>★ تقييماتي</button>
          <button type="button" onClick={replayHelp}>👨‍✈️ شرح استخدام الخريطة</button>
        </nav>
      </div>}
      {tab === "trips" && <MyTrips isCustomer onPickFavorite={pickFavorite}/>} {tab === "ratings" && <MyRatings/>}
      {tab === "home" && !activeTrip && <CustomerHelpGuide replayKey={helpReplay}/>} 
      {tab === "home" && (activeTrip?.status === "pending" ? <CustomerOffers tripId={activeTrip.id} onAccepted={() => void checkActive()} onCancel={() => { setActiveTrip(null); void checkActive(); }}/> : activeTrip ? <ActiveTrip onDone={() => { setActiveTrip(null); void checkActive(); }}/> : <CustomerMapPlanner
        pickup={pickup} pickupAddress={pickupAddr} dropoff={dropoff} dropoffAddress={dropoffAddr}
        stops={stops}
        stopRequestKey={stopPickSeq}
        onStopConfirm={(loc, addr) => { setStops(arr => arr.length < MAX_STOPS ? [...arr, { loc, addr }] : arr); setDetailsMinimized(false); }}
        onPickupChange={(loc, addr) => { setPickup(loc); setPickupAddr(addr); setPickedRouteId(null); }}
        onDropoffChange={(loc, addr) => { setDropoff(loc); setDropoffAddr(addr); setPickedRouteId(null); }}
        onPickupPlaceSelect={setPickupPlaceId} onDropoffPlaceSelect={setDropoffPlaceId}>{bookingDetails}</CustomerMapPlanner>)}
    </main>
  </div>;
}
