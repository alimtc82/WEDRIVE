import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import TopBar from "../components/TopBar";

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
  const [online, setOnline] = useState(false);
  const [trips, setTrips] = useState<PendingTrip[]>([]);
  const [note, setNote] = useState("");

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
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => loadPending())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [online, loadPending]);

  const accept = async (tripId: string) => {
    setNote("");
    const { error } = await supabase.rpc("accept_trip", { p_trip_id: tripId });
    if (error) {
      setNote("لم يعد الطلب متاحًا — ربما قبله كابتن آخر");
      loadPending();
      return;
    }
    setNote("تم قبول الرحلة ✓");
    loadPending();
  };

  return (
    <div className="roleShell" dir="rtl">
      <TopBar title="WE DRIVE — الكابتن" />
      <main className="roleMain">
        <section className="panel">
          <div className="onlineRow">
            <div>
              <h2>مرحبًا كابتن {profile?.full_name || ""}</h2>
              <p>{online ? "أنت متصل — تستقبل الطلبات القريبة" : "أنت غير متصل"}</p>
            </div>
            <button className={`onlineToggle ${online ? "isOn" : ""}`} onClick={() => toggleOnline(!online)}>
              <i />{online ? "متصل" : "غير متصل"}
            </button>
          </div>
        </section>

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

                <button className="acceptBtn" onClick={() => accept(t.trip_id)}>قبول الرحلة</button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
