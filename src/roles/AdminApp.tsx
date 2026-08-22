import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Settings } from "../lib/types";
import TopBar from "../components/TopBar";
import AdminCaptains from "./AdminCaptains";
import AdminOverview from "./AdminOverview";
import AdminMap from "./AdminMap";
import AdminRatings from "./AdminRatings";
import AdminPlaces from "./AdminPlacesV1178";
import AdminOnlineCaptains from "./AdminOnlineCaptains";
import AdminSimulation from "./AdminSimulation";
import AdminParentPlaceBridge from "./AdminParentPlaceBridge";
import AdminLegalRecords from "./AdminLegalRecords";

type Tab = "overview" | "map" | "captains" | "online" | "ratings" | "pricing" | "places" | "simulation" | "legal";

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>("overview");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSettings = async () => {
    const { data } = await supabase.from("settings").select("*").single();
    if (data) setSettings(data as Settings);
  };
  useEffect(() => { void loadSettings(); }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true); setSaveMsg("");
    const { error } = await supabase.rpc("admin_save_settings", {
      p_price_in_city: settings.price_per_km_in_city,
      p_price_intercity: settings.price_per_km_intercity,
      p_min_fare: settings.min_fare,
      p_service_fee: settings.service_fee_percent,
      p_dispatch_radius: settings.dispatch_radius_km,
      p_dispatch_timeout: settings.dispatch_timeout_sec,
      p_tracking_interval: settings.tracking_interval_sec,
      p_offer_ttl: settings.offer_ttl_sec,
      p_arrival_radius_m: settings.arrival_radius_m,
    });
    setBusy(false);
    setSaveMsg(error ? "تعذّر الحفظ: " + error.message : "تم حفظ الإعدادات ✓");
  };

  const upd = (k: keyof Settings, v: string) => setSettings((s) => s ? { ...s, [k]: parseFloat(v) || 0 } : s);

  return (
    <div className="roleShell" dir="rtl">
      <TopBar title="كابتن بنها — لوحة الأدمن" />
      <main className="roleMain wide">
        <div className="adminTabs">
          <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>نظرة عامة</button>
          <button className={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>الخريطة</button>
          <button className={tab === "captains" ? "on" : ""} onClick={() => setTab("captains")}>الكباتن</button>
          <button className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>المتصلون الآن</button>
          <button className={tab === "ratings" ? "on" : ""} onClick={() => setTab("ratings")}>التقييمات</button>
          <button className={tab === "places" ? "on" : ""} onClick={() => setTab("places")}>تسهيلات الاستخدام</button>
          <button className={tab === "pricing" ? "on" : ""} onClick={() => setTab("pricing")}>إعدادات التسعير والنطاق</button>
          <button className={tab === "legal" ? "on" : ""} onClick={() => setTab("legal")}>السجلات القانونية</button>
          <button className={tab === "simulation" ? "on" : ""} onClick={() => setTab("simulation")}>بث تجريبي</button>
        </div>

        {tab === "overview" && <AdminOverview onOpenOnline={() => setTab("online")} />}
        {tab === "map" && <AdminMap />}
        {tab === "ratings" && <AdminRatings />}
        {tab === "places" && <><AdminPlaces /><AdminParentPlaceBridge active /></>}
        {tab === "online" && <AdminOnlineCaptains onBack={() => setTab("overview")} />}
        {tab === "captains" && <AdminCaptains />}
        {tab === "legal" && <AdminLegalRecords />}
        {tab === "simulation" && <AdminSimulation />}

        {tab === "pricing" && settings && (
          <section className="panel">
            <div className="panelHead"><h2>معادلة التسعير والنطاق</h2><p>القيم هنا تُطبّق فورًا على الرحلات الجديدة وتشغيل الكابتن</p></div>
            <div className="settingsGrid">
              <label>سعر الكيلو داخل المدينة (ج.م)<input type="number" step="0.5" value={settings.price_per_km_in_city} onChange={(e) => upd("price_per_km_in_city", e.target.value)} /></label>
              <label>سعر الكيلو بين المدن (ج.م)<input type="number" step="0.5" value={settings.price_per_km_intercity} onChange={(e) => upd("price_per_km_intercity", e.target.value)} /></label>
              <label>الحد الأدنى للرحلة (ج.م)<input type="number" step="1" value={settings.min_fare} onChange={(e) => upd("min_fare", e.target.value)} /></label>
              <label>رسوم الخدمة (%)<input type="number" step="1" value={settings.service_fee_percent} onChange={(e) => upd("service_fee_percent", e.target.value)} /></label>
              <label>نطاق توزيع الطلب (كم)<input type="number" step="0.5" value={settings.dispatch_radius_km} onChange={(e) => upd("dispatch_radius_km", e.target.value)} /></label>
              <label>نطاق تفعيل «وصلت لنقطة العميل» (متر)<input type="number" step="50" min="50" max="5000" value={settings.arrival_radius_m ?? 300} onChange={(e) => upd("arrival_radius_m", e.target.value)} /></label>
              <label>مهلة قبول الطلب (ثانية)<input type="number" step="1" value={settings.dispatch_timeout_sec} onChange={(e) => upd("dispatch_timeout_sec", e.target.value)} /></label>
              <label>مهلة تتبّع موقع الكابتن<select value={[0,30].includes(settings.tracking_interval_sec) ? String(settings.tracking_interval_sec) : "custom"} onChange={(e) => e.target.value === "custom" ? upd("tracking_interval_sec","10") : upd("tracking_interval_sec",e.target.value)}><option value="30">كل 30 ثانية (الافتراضي)</option><option value="0">بث حي مستمر</option><option value="custom">نطاق مخصّص</option></select></label>
              {![0,30].includes(settings.tracking_interval_sec) && <label>النطاق المخصّص (بالثانية)<input type="number" step="1" min="2" value={settings.tracking_interval_sec} onChange={(e) => upd("tracking_interval_sec", e.target.value)} /></label>}
              <label>مهلة عرض السعر — دقائق<input type="number" step="1" min="0" value={Math.floor(settings.offer_ttl_sec/60)} onChange={(e) => upd("offer_ttl_sec", String((parseInt(e.target.value)||0)*60 + settings.offer_ttl_sec%60))} /></label>
              <label>مهلة عرض السعر — ثوانٍ<input type="number" step="1" min="0" max="59" value={settings.offer_ttl_sec%60} onChange={(e) => upd("offer_ttl_sec", String(Math.floor(settings.offer_ttl_sec/60)*60 + (parseInt(e.target.value)||0)))} /></label>
            </div>
            {saveMsg && <p className={saveMsg.includes("تعذّر") ? "authError" : "okMsg"}>{saveMsg}</p>}
            <button className="cta" onClick={saveSettings} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</button>
          </section>
        )}
      </main>
    </div>
  );
}
