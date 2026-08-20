import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import TopBar from "../components/TopBar";
import ActiveTrip from "../components/ActiveTrip";
import CaptainOffer from "./CaptainOffer";
import { useLocationTracker } from "../lib/useLocationTracker";
import MyTrips from "../pages/MyTrips";
import MyRatings from "../pages/MyRatings";
import "../listPages.css";

interface PendingTrip {
  trip_id: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number;
  price: number;
  kind: string;
  requested_at: string;
  customer_name: string;
  customer_avatar: string | null;
  customer_rating: number;
  customer_rating_count: number;
  customer_trips_count: number;
}

export default function CaptainApp() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"home" | "trips" | "ratings">("home");
  const [online, setOnline] = useState(false);
  const [trips, setTrips] = useState<PendingTrip[]>([]);
  const [note, setNote] = useState("");
  const [capStatus, setCapStatus] = useState<string | null>(null);
  const [hasActive, setHasActive] = useState<boolean>(false);
  const [hasOffer, setHasOffer] = useState<boolean>(false);
  const [trackInterval, setTrackInterval] = useState<number>(30);
  // modal تعديل السعر اليدوي
  const [priceModal, setPriceModal] = useState<{ open: boolean; tripId: string; defaultPrice: number; value: string }>({
    open: false, tripId: "", defaultPrice: 0, value: "",
  });

  const checkOffer = useCallback(async () => {
    const { data } = await supabase.rpc("my_active_offer");
    setHasOffer(!!data);
  }, []);

  useEffect(() => {
    checkOffer();
    const ch = supabase.channel("cap-offer-check")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trip_offers", filter: `captain_id=eq.${profile!.id}`,
      }, () => checkOffer())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [checkOffer, profile]);

  useEffect(() => {
    supabase.from("settings").select("tracking_interval_sec").single()
      .then(({ data }) => { if (data) setTrackInterval(data.tracking_interval_sec ?? 30); });
  }, []);

  const checkActive = useCallback(async () => {
    const { data } = await supabase.rpc("my_active_trip");
    setHasActive(!!data);
  }, []);

  // تتبّع الموقع طالما الكابتن متصل أو في رحلة
  const locStatus = useLocationTracker(online || hasActive, trackInterval);

  useEffect(() => {
    checkActive();
    const ch = supabase.channel("cap-active")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trips", filter: `captain_id=eq.${profile!.id}`,
      }, () => checkActive())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [checkActive, profile]);

  useEffect(() => {
    supabase.from("captains").select("status,reject_reason").eq("id", profile!.id).single()
      .then(({ data }) => { if (data) setCapStatus(data.status); });
  }, [profile]);

  const loadPending = useCallback(async () => {
    const { data, error } = await supabase.rpc("pending_trips_for_captain");
    if (!error && data) setTrips(data as PendingTrip[]);
  }, []);

  const toggleOnline = async (val: boolean) => {
    setOnline(val);
    await supabase.from("captains")
      .update({ is_online: val, location_updated_at: new Date().toISOString() })
      .eq("id", profile!.id);
    if (val) loadPending();
    else setTrips([]);
  };

  useEffect(() => {
    if (!online) return;
    loadPending();
    const channel = supabase
      .channel("pending-trips")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trips", filter: "status=eq.pending",
      }, () => loadPending())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [online, loadPending]);

  const submitOffer = async (tripId: string, price: number) => {
    setNote("");
    const { error } = await supabase.rpc("submit_offer", { p_trip_id: tripId, p_price: price });
    if (error) {
      setNote(error.message || "تعذّر تقديم العرض");
      loadPending();
      return;
    }
    setNote("تم تقديم عرضك ✓ في انتظار رد العميل");
    checkOffer();
    checkActive();
    loadPending();
  };

  // شاشة انتظار الموافقة أو الرفض
  if (capStatus && capStatus !== "approved") {
    return (
      <div className="roleShell" dir="rtl">
        <TopBar title="كابتن بنها — الكابتن" />
        <main className="roleMain">
          <section className="panel statusPanel">
            {capStatus === "rejected" ? (
              <>
                <div className="statusIcon rej">!</div>
                <h2>تم رفض الطلب</h2>
                <p>للأسف لم يتم قبول طلبك. يمكنك التواصل مع الإدارة لمعرفة التفاصيل.</p>
              </>
            ) : capStatus === "suspended" ? (
              <>
                <div className="statusIcon rej">!</div>
                <h2>الحساب موقوف</h2>
                <p>تم إيقاف حسابك مؤقتًا. تواصل مع الإدارة.</p>
              </>
            ) : (
              <>
                <div className="statusIcon pend">⏳</div>
                <h2>حسابك قيد المراجعة</h2>
                <p>شكرًا لتسجيلك. يقوم فريق الإدارة بمراجعة مستنداتك، وسيتم تفعيل حسابك بعد الموافقة. ستظهر لك الرحلات فور التفعيل.</p>
              </>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (hasActive) {
    return (
      <div className="roleShell" dir="rtl">
        <TopBar title="كابتن بنها — الكابتن" />
        <main className="roleMain">
          <ActiveTrip onDone={() => { setHasActive(false); checkActive(); loadPending(); }} />
        </main>
      </div>
    );
  }

  return (
    <div className="roleShell" dir="rtl">
      <TopBar title="كابتن بنها — الكابتن" />
      <main className="roleMain">
        <div className="lpTabs">
          <button className={tab === "home" ? "on" : ""} onClick={() => setTab("home")}>الرئيسية</button>
          <button className={tab === "trips" ? "on" : ""} onClick={() => setTab("trips")}>رحلاتي</button>
          <button className={tab === "ratings" ? "on" : ""} onClick={() => setTab("ratings")}>تقييماتي</button>
        </div>

        {tab === "trips" && <MyTrips isCustomer={false} />}
        {tab === "ratings" && <MyRatings />}

        {tab === "home" && (
          <>
            <section className="panel">
              <div className="onlineRow">
                <div>
                  <h2>مرحبًا كابتن {profile?.full_name || ""}</h2>
                  <p>{online ? "أنت متصل — تستقبل الطلبات القريبة" : "أنت غير متصل"}</p>
                  {online && locStatus.error && (
                    <p className="locWarn">⚠ {locStatus.error}</p>
                  )}
                  {online && locStatus.ok && (
                    <p className="locOk">📍 موقعك يُحدَّث بنجاح</p>
                  )}
                </div>
                <button className={`onlineToggle ${online ? "isOn" : ""}`} onClick={() => toggleOnline(!online)}>
                  <i />{online ? "متصل" : "غير متصل"}
                </button>
              </div>
            </section>

            {hasOffer && <CaptainOffer onCleared={() => { setHasOffer(false); loadPending(); }} />}

            {!hasOffer && (
              <section className="panel">
                <div className="panelHead">
                  <h2>الطلبات الواردة</h2>
                  <p>{online ? `${trips.length} طلب متاح` : "اتصل لاستقبال الطلبات"}</p>
                </div>

                {note && <p className="okMsg">{note}</p>}
                {online && trips.length === 0 && <p className="emptyState">لا توجد طلبات حاليًا — سنُعلمك فور وصول طلب</p>}

                <div className="reqList">
                  {trips.map((t) => (
                    <article className="reqCard" key={t.trip_id}>
                      <div className="reqCustomer">
                        <div className="custAvatar">
                          {t.customer_avatar
                            ? <img src={t.customer_avatar} alt="" />
                            : <span>{(t.customer_name || "؟").trim().charAt(0)}</span>}
                        </div>
                        <div className="custInfo">
                          <b className="custName">{t.customer_name || "عميل"}</b>
                          <div className="custStats">
                            <span className="stStar">★ {Number(t.customer_rating).toFixed(1)}</span>
                            <span className="stDot">·</span>
                            <span>{t.customer_trips_count} رحلة</span>
                          </div>
                        </div>
                        <div className="custPrice">
                          <b>{Number(t.price).toFixed(2)}</b>
                          <span>ج.م · نقداً</span>
                        </div>
                      </div>

                      <div className="reqRoute">
                        <div className="rSeg"><i className="dotFrom" /><span>{t.pickup_address}</span></div>
                        <div className="rSeg"><i className="dotTo" /><span>{t.dropoff_address}</span></div>
                      </div>

                      <div className="reqFoot">
                        <span className="chip">{t.distance_km} كم</span>
                        <span className="chip">{t.kind === "intercity" ? "بين المدن" : "داخل المدينة"}</span>
                      </div>

                      <div className="offerBtns">
                        <button className="offerMain" onClick={() => submitOffer(t.trip_id, Number(t.price))}>
                          اعرض بالسعر {Number(t.price).toFixed(0)} ج
                        </button>
                        <button className="offerPlus" onClick={() => submitOffer(t.trip_id, Number(t.price) + 5)}>+5</button>
                        <button className="offerPlus" onClick={() => submitOffer(t.trip_id, Number(t.price) + 10)}>+10</button>
                        <button className="offerManual" onClick={() => {
                          setPriceModal({
                            open: true,
                            tripId: t.trip_id,
                            defaultPrice: Number(t.price),
                            value: String(Math.round(Number(t.price))),
                          });
                        }}>✎</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* مودال تعديل السعر اليدوي */}
            {priceModal.open && (
              <div className="modalWrap" onClick={(e) => { if (e.target === e.currentTarget) setPriceModal({ open: false, tripId: "", defaultPrice: 0, value: "" }); }}>
                <div className="modalCard" style={{ maxWidth: 360 }}>
                  <div className="modalHead">
                    <h3>سعر مخصّص</h3>
                    <button className="modalX" onClick={() => setPriceModal({ open: false, tripId: "", defaultPrice: 0, value: "" })}>✕</button>
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>
                    السعر الافتراضي: <b style={{ color: "var(--green)" }}>{priceModal.defaultPrice} ج</b>
                  </p>
                  <div className="field">
                    <label>أدخل السعر المقترح (ج.م)</label>
                    <input
                      type="number"
                      autoFocus
                      value={priceModal.value}
                      onChange={(e) => setPriceModal((m) => ({ ...m, value: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { const p = parseFloat(priceModal.value); if (p > 0) { submitOffer(priceModal.tripId, p); setPriceModal({ open: false, tripId: "", defaultPrice: 0, value: "" }); } } }}
                      placeholder="مثال: 45"
                    />
                  </div>
                  <div className="wizBtns" style={{ marginTop: 12 }}>
                    <button className="wizBack" onClick={() => setPriceModal({ open: false, tripId: "", defaultPrice: 0, value: "" })}>إلغاء</button>
                    <button
                      className="authSubmit"
                      disabled={!parseFloat(priceModal.value) || parseFloat(priceModal.value) <= 0}
                      onClick={() => {
                        const p = parseFloat(priceModal.value);
                        submitOffer(priceModal.tripId, p);
                        setPriceModal({ open: false, tripId: "", defaultPrice: 0, value: "" });
                      }}
                    >
                      تقديم العرض
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
