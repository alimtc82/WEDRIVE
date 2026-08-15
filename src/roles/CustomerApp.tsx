import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import type { Settings, TripKind } from "../lib/types";
import { haversineKm, guessKind, type LatLng } from "../lib/geo";
import TopBar from "../components/TopBar";
import MapPicker from "../components/MapPicker";

export default function CustomerApp() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupAddr, setPickupAddr] = useState("");
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [dropoffAddr, setDropoffAddr] = useState("");

  const [kind, setKind] = useState<TripKind>("in_city");
  const [distance, setDistance] = useState<number | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").single().then(({ data }) => {
      if (data) setSettings(data as Settings);
    });
  }, []);

  useEffect(() => {
    if (!pickup || !dropoff || !settings) { setDistance(null); setFare(null); return; }
    const d = haversineKm(pickup, dropoff);
    setDistance(d);
    const k = guessKind(d);
    setKind(k);
    const ppk = k === "intercity" ? settings.price_per_km_intercity : settings.price_per_km_in_city;
    const raw = Math.round(d * ppk * 100) / 100;
    setFare(Math.max(raw, settings.min_fare));
  }, [pickup, dropoff, settings]);

  useEffect(() => {
    if (distance == null || !settings) return;
    const ppk = kind === "intercity" ? settings.price_per_km_intercity : settings.price_per_km_in_city;
    const raw = Math.round(distance * ppk * 100) / 100;
    setFare(Math.max(raw, settings.min_fare));
  }, [kind, distance, settings]);

  const requestTrip = async () => {
    setErr(""); setMsg("");
    if (!pickup || !dropoff) { setErr("حدّد مكان الانطلاق والوجهة على الخريطة"); return; }
    if (distance == null || distance <= 0) { setErr("تعذّر حساب المسافة"); return; }

    setBusy(true);
    const { error } = await supabase.rpc("create_trip", {
      p_pickup_lng: pickup.lng, p_pickup_lat: pickup.lat, p_pickup_address: pickupAddr,
      p_dropoff_lng: dropoff.lng, p_dropoff_lat: dropoff.lat, p_dropoff_address: dropoffAddr,
      p_distance_km: distance, p_kind: kind,
    });
    setBusy(false);

    if (error) { setErr("تعذّر إنشاء الطلب: " + error.message); return; }
    setMsg("تم إرسال طلبك ✓ جارٍ البحث عن كابتن قريب");
    setPickup(null); setPickupAddr(""); setDropoff(null); setDropoffAddr("");
    setDistance(null); setFare(null);
  };

  const body = (
    <div className="roleShell" dir="rtl">
      <TopBar title="WE DRIVE — العميل" />
      <main className="roleMain">
        <section className="panel">
          <div className="panelHead">
            <h2>اطلب رحلة</h2>
            <p>أهلاً {profile?.full_name || ""}، حدّد وجهتك وسنبحث لك عن أقرب كابتن</p>
          </div>

          <MapPicker label="من" color="green" value={pickup} address={pickupAddr} autoLocate
            onChange={(loc, addr) => { setPickup(loc); setPickupAddr(addr); }} />
          <MapPicker label="إلى" color="red" value={dropoff} address={dropoffAddr}
            onChange={(loc, addr) => { setDropoff(loc); setDropoffAddr(addr); }} />

          <div className="field">
            <label>نوع الرحلة</label>
            <div className="segmented">
              <button className={kind === "in_city" ? "on" : ""} onClick={() => setKind("in_city")} type="button">داخل المدينة</button>
              <button className={kind === "intercity" ? "on" : ""} onClick={() => setKind("intercity")} type="button">بين المدن</button>
            </div>
          </div>

          <div className="fareBox">
            <div>
              <span>المسافة</span>
              <b className="distVal">{distance != null ? `${distance} كم` : "—"}</b>
            </div>
            <div style={{ textAlign: "left" }}>
              <span>السعر المقترح</span>
              <b>{fare != null ? `${fare.toFixed(2)} ج.م` : "—"}</b>
            </div>
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

  return body;
}
