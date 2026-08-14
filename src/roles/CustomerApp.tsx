import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import type { Settings, TripKind } from "../lib/types";
import TopBar from "../components/TopBar";

export default function CustomerApp() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [distance, setDistance] = useState("");
  const [kind, setKind] = useState<TripKind>("in_city");
  const [fare, setFare] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").single().then(({ data }) => {
      if (data) setSettings(data as Settings);
    });
  }, []);

  // حساب تقديري فوري (نفس معادلة الخادم) لعرضه قبل الطلب
  useEffect(() => {
    if (!settings) return;
    const d = parseFloat(distance);
    if (!d || d <= 0) { setFare(null); return; }
    const ppk = kind === "intercity" ? settings.price_per_km_intercity : settings.price_per_km_in_city;
    const raw = Math.round(d * ppk * 100) / 100;
    setFare(Math.max(raw, settings.min_fare));
  }, [distance, kind, settings]);

  const requestTrip = async () => {
    setErr(""); setMsg("");
    const d = parseFloat(distance);
    if (!pickup.trim() || !dropoff.trim()) { setErr("اكتب مكان الانطلاق والوجهة"); return; }
    if (!d || d <= 0) { setErr("اكتب مسافة صحيحة بالكيلومتر"); return; }

    setBusy(true);
    // ملاحظة: الإحداثيات مؤقتة (0,0) لحين ربط خرائط جوجل — الخادم يحسب السعر بنفسه
    const { error } = await supabase.rpc("create_trip", {
      p_pickup_lng: 0, p_pickup_lat: 0, p_pickup_address: pickup.trim(),
      p_dropoff_lng: 0, p_dropoff_lat: 0, p_dropoff_address: dropoff.trim(),
      p_distance_km: d, p_kind: kind,
    });
    setBusy(false);

    if (error) { setErr("تعذّر إنشاء الطلب: " + error.message); return; }
    setMsg("تم إرسال طلبك ✓ جارٍ البحث عن كابتن قريب");
    setPickup(""); setDropoff(""); setDistance("");
  };

  return (
    <div className="roleShell" dir="rtl">
      <TopBar title="WE DRIVE — العميل" />
      <main className="roleMain">
        <section className="panel">
          <div className="panelHead">
            <h2>اطلب رحلة</h2>
            <p>أهلاً {profile?.full_name || ""}، حدّد وجهتك وسنبحث لك عن أقرب كابتن</p>
          </div>

          <div className="mapPlaceholder">
            <span>الخريطة — قريبًا (Google Maps)</span>
          </div>

          <div className="field">
            <label>من</label>
            <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="نقطة الانطلاق" />
          </div>
          <div className="field">
            <label>إلى</label>
            <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="الوجهة" />
          </div>

          <div className="row2">
            <div className="field">
              <label>المسافة (كم)</label>
              <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="مثال 18.6" inputMode="decimal" />
            </div>
            <div className="field">
              <label>نوع الرحلة</label>
              <div className="segmented">
                <button className={kind === "in_city" ? "on" : ""} onClick={() => setKind("in_city")} type="button">داخل المدينة</button>
                <button className={kind === "intercity" ? "on" : ""} onClick={() => setKind("intercity")} type="button">بين المدن</button>
              </div>
            </div>
          </div>

          <div className="fareBox">
            <span>السعر المقترح</span>
            <b>{fare != null ? `${fare.toFixed(2)} ج.م` : "—"}</b>
          </div>

          {err && <p className="authError" role="alert">{err}</p>}
          {msg && <p className="okMsg" role="status">{msg}</p>}

          <button className="cta" onClick={requestTrip} disabled={busy}>
            {busy ? "جارٍ الإرسال..." : "اطلب رحلة"}
          </button>
        </section>
      </main>
    </div>
  );
}
