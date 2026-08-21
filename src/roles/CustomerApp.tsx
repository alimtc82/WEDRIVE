import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import type { Settings, TripKind } from "../lib/types";
import { drivingRouteKm, guessKind, type LatLng } from "../lib/geo";
import TopBar from "../components/TopBar";
import MapPicker, { RouteMapPicker } from "../components/MapPicker";
import ActiveTrip from "../components/ActiveTrip";
import CustomerOffers from "./CustomerOffers";
import MyTrips from "../pages/MyTrips";
import MyRatings from "../pages/MyRatings";
import "../listPages.css";

const MAX_STOPS = 3;
const roundFareDownTo5 = (value: number) => Math.floor(value / 5) * 5;

interface StopEntry { loc: LatLng | null; addr: string; }

interface FixedRoute {
  id: string; name: string | null;
  from_place_id: string; from_name: string; from_lat: number; from_lng: number;
  to_place_id: string; to_name: string; to_lat: number; to_lng: number;
  price: number; reverse_price: number | null;
}

export default function CustomerApp() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"home" | "trips" | "ratings">("home");
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

  const checkActive = useCallback(async () => {
    const { data } = await supabase.rpc("my_active_trip");
    if (data) setActiveTrip({ id: data.id, status: data.status });
    else setActiveTrip(null);
  }, []);

  useEffect(() => {
    void checkActive();

    // لا نعتمد على Realtime وحده في الويب؛ بعض المتصفحات تعلق websocket بعد النوم/تغيير الشبكة.
    const ch = supabase.channel("cust-active")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trips",
      }, () => { void checkActive(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void checkActive();
      });

    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void checkActive();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(refresh, 8_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(ch);
    };
  }, [checkActive, profile]);

  useEffect(() => {
    supabase.from("settings").select("*").single().then(({ data }) => {
      if (data) {
        setSettings(data as Settings);
        const visible = (data as Settings & { show_fixed_routes?: boolean }).show_fixed_routes !== false;
        setShowFixedRoutes(visible);
        if (visible) {
          supabase.rpc("list_fixed_routes").then(({ data: rows }) => {
            setFixedRoutes((rows as FixedRoute[]) || []);
          });
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!pickupPlaceId || !dropoffPlaceId || stops.length > 0) { setFixedPrice(null); return; }
    supabase.rpc("fixed_route_price", { p_from: pickupPlaceId, p_to: dropoffPlaceId })
      .then(({ data }) => setFixedPrice(typeof data === "number" ? data : null));
  }, [pickupPlaceId, dropoffPlaceId, stops.length]);

  // التسعير يعتمد على مسافة القيادة الفعلية على شبكة الطرق، وليس الخط المستقيم.
  useEffect(() => {
    let cancelled = false;
    if (!pickup || !dropoff || !settings || stops.some((s) => !s.loc)) {
      setDistance(null);
      setFare(null);
      setRouteLoading(false);
      setRouteError("");
      return;
    }

    const points: LatLng[] = [pickup, ...stops.map((s) => s.loc!), dropoff];
    setRouteLoading(true);
    setRouteError("");
    setDistance(null);
    setFare(null);

    drivingRouteKm(points)
      .then((d) => {
        if (cancelled) return;
        setDistance(d);
        const k = guessKind(d);
        setKind(k);
        const ppk = k === "intercity" ? settings.price_per_km_intercity : settings.price_per_km_in_city;
        const raw = Math.round(d * ppk * 100) / 100;
        setFare(roundFareDownTo5(Math.max(raw, settings.min_fare)));
      })
      .catch(() => {
        if (cancelled) return;
        setDistance(null);
        setFare(null);
        setRouteError("تعذّر حساب مسافة الطريق الآن. تحقق من الإنترنت ثم أعد تحديد الوجهة.");
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => { cancelled = true; };
  }, [pickup, dropoff, stops, settings]);

  useEffect(() => {
    if (distance == null || !settings) return;
    const ppk = kind === "intercity" ? settings.price_per_km_intercity : settings.price_per_km_in_city;
    const raw = Math.round(distance * ppk * 100) / 100;
    setFare(roundFareDownTo5(Math.max(raw, settings.min_fare)));
  }, [kind, distance, settings]);

  const pickFixedRoute = (r: FixedRoute, reversed: boolean) => {
    const from = reversed
      ? { id: r.to_place_id, name: r.to_name, lat: r.to_lat, lng: r.to_lng }
      : { id: r.from_place_id, name: r.from_name, lat: r.from_lat, lng: r.from_lng };
    const to = reversed
      ? { id: r.from_place_id, name: r.from_name, lat: r.from_lat, lng: r.from_lng }
      : { id: r.to_place_id, name: r.to_name, lat: r.to_lat, lng: r.to_lng };
    setPickup({ lat: from.lat, lng: from.lng }); setPickupAddr(from.name);
    setDropoff({ lat: to.lat, lng: to.lng }); setDropoffAddr(to.name);
    setPickupPlaceId(from.id); setDropoffPlaceId(to.id);
    setStops([]);
    setPickedRouteId(r.id + (reversed ? "-r" : ""));
  };

  const requestTrip = async () => {
    setErr(""); setMsg("");
    if (!pickup || !dropoff) { setErr("حدّد مكان الانطلاق والوجهة على الخريطة"); return; }
    if (stops.some((s) => !s.loc)) { setErr("حدّد مكان كل نقاط التوقف أو احذفها"); return; }
    if (routeLoading) { setErr("انتظر حتى يكتمل حساب مسافة الطريق"); return; }
    if (routeError || distance == null || distance <= 0) { setErr(routeError || "تعذّر حساب مسافة الطريق"); return; }

    setBusy(true);
    const { error } = await supabase.rpc("create_trip", {
      p_pickup_lng: pickup.lng, p_pickup_lat: pickup.lat, p_pickup_address: pickupAddr,
      p_dropoff_lng: dropoff.lng, p_dropoff_lat: dropoff.lat, p_dropoff_address: dropoffAddr,
      p_distance_km: distance, p_kind: kind,
      p_stops: stops.filter((s) => s.loc).map((s) => ({ lat: s.loc!.lat, lng: s.loc!.lng, address: s.addr })),
      p_from_place_id: pickupPlaceId, p_to_place_id: dropoffPlaceId,
    });
    setBusy(false);

    if (error) { setErr("تعذّر إنشاء الطلب: " + error.message); return; }
    setMsg("تم إرسال طلبك ✓ جارٍ البحث عن كابتن قريب");
    setPickup(null); setPickupAddr(""); setDropoff(null); setDropoffAddr("");
    setPickupPlaceId(null); setDropoffPlaceId(null); setFixedPrice(null);
    setStops([]); setPickedRouteId(null);
    setDistance(null); setFare(null); setRouteError("");
    void checkActive();
  };

  const pickFavorite = (t: { pickup: LatLng; pickupAddr: string; dropoff: LatLng; dropoffAddr: string }) => {
    setPickup(t.pickup); setPickupAddr(t.pickupAddr);
    setDropoff(t.dropoff); setDropoffAddr(t.dropoffAddr);
    setPickupPlaceId(null); setDropoffPlaceId(null); setFixedPrice(null);
    setStops([]); setPickedRouteId(null);
    setTab("home");
  };

  return (
    <div className="roleShell" dir="rtl">
      <TopBar title="كابتن بنها — العميل" />
      <main className="roleMain">
        <div className="lpTabs">
          <button className={tab === "home" ? "on" : ""} onClick={() => setTab("home")}>الرئيسية</button>
          <button className={tab === "trips" ? "on" : ""} onClick={() => setTab("trips")}>رحلاتي</button>
          <button className={tab === "ratings" ? "on" : ""} onClick={() => setTab("ratings")}>تقييماتي</button>
        </div>

        {tab === "trips" && <MyTrips isCustomer onPickFavorite={pickFavorite} />}
        {tab === "ratings" && <MyRatings />}

        {tab === "home" && (
          <>
            {activeTrip && activeTrip.status === "pending" ? (
              <CustomerOffers tripId={activeTrip.id}
                onAccepted={() => void checkActive()}
                onCancel={() => { setActiveTrip(null); void checkActive(); }} />
            ) : activeTrip ? (
              <ActiveTrip onDone={() => { setActiveTrip(null); void checkActive(); }} />
            ) : (
              <section className="panel">
                <div className="panelHead">
                  <h2>اطلب رحلة</h2>
                  <p>أهلاً {profile?.full_name || ""}، حدّد وجهتك وسنبحث لك عن أقرب كابتن</p>
                </div>

                {showFixedRoutes && fixedRoutes.length > 0 && (
                  <div className="fixedRoutes">
                    <h3 className="frTitle">مشاوير بأسعار ثابتة</h3>
                    <div className="frList">
                      {fixedRoutes.map((r) => (
                        <div key={r.id} className={`frRow ${pickedRouteId?.startsWith(r.id) ? "on" : ""}`}>
                          <div className="frMain">
                            <b>{r.name || `${r.from_name} ← ${r.to_name}`}</b>
                            <small>{r.from_name} ← {r.to_name}</small>
                          </div>
                          <div className="frSide">
                            <span className="frPrice">{Number(r.price).toFixed(0)} ج</span>
                            <button type="button" className="frPick" onClick={() => pickFixedRoute(r, false)}>ذهاب</button>
                            {r.reverse_price != null && (
                              <button type="button" className="frPick rev" onClick={() => pickFixedRoute(r, true)}>
                                عودة {Number(r.reverse_price).toFixed(0)} ج
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {pickedRouteId && (
                      <button type="button" className="frClear" onClick={() => {
                        setPickup(null); setPickupAddr(""); setDropoff(null); setDropoffAddr("");
                        setPickupPlaceId(null); setDropoffPlaceId(null); setPickedRouteId(null);
                      }}>إلغاء المشوار المختار</button>
                    )}
                  </div>
                )}

                <RouteMapPicker key={pickedRouteId || (pickup || dropoff ? "manual" : "empty")}
                  pickup={pickup} pickupAddress={pickupAddr}
                  dropoff={dropoff} dropoffAddress={dropoffAddr}
                  onPickupChange={(loc, addr) => { setPickup(loc); setPickupAddr(addr); setPickedRouteId(null); }}
                  onDropoffChange={(loc, addr) => { setDropoff(loc); setDropoffAddr(addr); setPickedRouteId(null); }}
                  onPickupPlaceSelect={setPickupPlaceId}
                  onDropoffPlaceSelect={setDropoffPlaceId} />

                {stops.map((s, i) => (
                  <div className="stopRow" key={i}>
                    <MapPicker label={`نقطة توقف ${i + 1}`} color="amber" value={s.loc} address={s.addr}
                      onChange={(loc, addr) => setStops((arr) => arr.map((x, j) => (j === i ? { loc, addr } : x)))} />
                    <button type="button" className="stopRemove"
                      onClick={() => setStops((arr) => arr.filter((_, j) => j !== i))}>
                      ✕ إزالة نقطة التوقف
                    </button>
                  </div>
                ))}
                {stops.length < MAX_STOPS && (
                  <button type="button" className="addStopBtn"
                    onClick={() => { setStops((arr) => [...arr, { loc: null, addr: "" }]); setPickedRouteId(null); }}>
                    ＋ إضافة نقطة توقف ({stops.length}/{MAX_STOPS})
                  </button>
                )}

                <div className="field">
                  <label>نوع الرحلة</label>
                  <div className="segmented">
                    <button className={kind === "in_city" ? "on" : ""} onClick={() => setKind("in_city")} type="button">داخل المدينة</button>
                    <button className={kind === "intercity" ? "on" : ""} onClick={() => setKind("intercity")} type="button">بين المدن</button>
                  </div>
                </div>

                <div className="fareBox">
                  <div>
                    <span>مسافة الطريق{stops.length > 0 ? " (شاملة التوقفات)" : ""}</span>
                    <b className="distVal">{routeLoading ? "جارٍ الحساب..." : distance != null ? `${distance} كم` : "—"}</b>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <span>السعر المقترح</span>
                    <b>{routeLoading ? "..." : (fixedPrice ?? fare) != null ? `${(fixedPrice ?? fare)!.toFixed(0)} ج.م` : "—"}</b>
                  </div>
                </div>

                {routeError && <p className="authError" role="alert">{routeError}</p>}
                {err && <p className="authError" role="alert">{err}</p>}
                {msg && <p className="okMsg" role="status">{msg}</p>}

                <button className="cta" onClick={requestTrip} disabled={busy || routeLoading || !distance || !!routeError}>
                  {busy ? "جارٍ الإرسال..." : routeLoading ? "جارٍ حساب الطريق..." : "اطلب رحلة"}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
