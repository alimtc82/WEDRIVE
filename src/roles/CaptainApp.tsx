import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import TopBar from "../components/TopBar";

interface PendingTrip {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number;
  price: number;
  kind: string;
  requested_at: string;
}

export default function CaptainApp() {
  const { profile } = useAuth();
  const [online, setOnline] = useState(false);
  const [trips, setTrips] = useState<PendingTrip[]>([]);
  const [note, setNote] = useState("");

  const loadPending = useCallback(async () => {
    const { data } = await supabase
      .from("trips")
      .select("id,pickup_address,dropoff_address,distance_km,price,kind,requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: false });
    if (data) setTrips(data as PendingTrip[]);
  }, []);

  // تحديث حالة الاتصال في جدول الكباتن
  const toggleOnline = async (val: boolean) => {
    setOnline(val);
    await supabase.from("captains").update({ is_online: val, location_updated_at: new Date().toISOString() }).eq("id", profile!.id);
    if (val) loadPending();
  };

  // الاستماع الفوري للطلبات الجديدة
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
              <article className="reqCard" key={t.id}>
                <div className="reqTop">
                  <span className="reqKind">{t.kind === "intercity" ? "بين المدن" : "داخل المدينة"}</span>
                  <b className="reqPrice">{t.price.toFixed(2)} ج.م</b>
                </div>
                <div className="reqRoute">
                  <div><i className="dotFrom" /> {t.pickup_address}</div>
                  <div><i className="dotTo" /> {t.dropoff_address}</div>
                </div>
                <div className="reqMeta">
                  <span>{t.distance_km} كم</span>
                  <span>نقداً</span>
                </div>
                <button className="cta" onClick={() => accept(t.id)}>قبول الرحلة</button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
