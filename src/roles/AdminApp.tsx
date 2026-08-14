import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import type { Settings } from "../lib/types";
import TopBar from "../components/TopBar";

interface Stats { trips: number; captainsOnline: number; customers: number; revenue: number; }

export default function AdminApp() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"overview" | "pricing">("overview");
  const [stats, setStats] = useState<Stats>({ trips: 0, captainsOnline: 0, customers: 0, revenue: 0 });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadStats = async () => {
    const [{ count: trips }, { count: online }, { count: custs }, { data: completed }] = await Promise.all([
      supabase.from("trips").select("*", { count: "exact", head: true }),
      supabase.from("captains").select("*", { count: "exact", head: true }).eq("is_online", true),
      supabase.from("customers").select("*", { count: "exact", head: true }),
      supabase.from("trips").select("price").eq("status", "completed"),
    ]);
    const revenue = (completed || []).reduce((s: number, r: { price: number }) => s + Number(r.price), 0);
    setStats({ trips: trips || 0, captainsOnline: online || 0, customers: custs || 0, revenue });
  };

  const loadSettings = async () => {
    const { data } = await supabase.from("settings").select("*").single();
    if (data) setSettings(data as Settings);
  };

  useEffect(() => { loadStats(); loadSettings(); }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true); setSaveMsg("");
    const { error } = await supabase.from("settings").update({
      price_per_km_in_city: settings.price_per_km_in_city,
      price_per_km_intercity: settings.price_per_km_intercity,
      min_fare: settings.min_fare,
      service_fee_percent: settings.service_fee_percent,
      dispatch_radius_km: settings.dispatch_radius_km,
      dispatch_timeout_sec: settings.dispatch_timeout_sec,
      updated_by: profile!.id,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    setBusy(false);
    setSaveMsg(error ? "تعذّر الحفظ: " + error.message : "تم حفظ الإعدادات ✓");
  };

  const upd = (k: keyof Settings, v: string) =>
    setSettings((s) => (s ? { ...s, [k]: parseFloat(v) || 0 } : s));

  return (
    <div className="roleShell" dir="rtl">
      <TopBar title="WE DRIVE — لوحة الأدمن" />
      <main className="roleMain wide">
        <div className="adminTabs">
          <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>نظرة عامة</button>
          <button className={tab === "pricing" ? "on" : ""} onClick={() => setTab("pricing")}>إعدادات التسعير والنطاق</button>
        </div>

        {tab === "overview" && (
          <section className="metricsGrid">
            <div className="metric"><span>إجمالي الرحلات</span><b>{stats.trips}</b></div>
            <div className="metric"><span>كباتن متصلون</span><b>{stats.captainsOnline}</b></div>
            <div className="metric"><span>العملاء</span><b>{stats.customers}</b></div>
            <div className="metric"><span>الإيرادات المكتملة</span><b>{stats.revenue.toFixed(2)} ج.م</b></div>
          </section>
        )}

        {tab === "pricing" && settings && (
          <section className="panel">
            <div className="panelHead">
              <h2>معادلة التسعير</h2>
              <p>القيم هنا تُطبّق فورًا على حساب سعر أي رحلة جديدة</p>
            </div>
            <div className="settingsGrid">
              <label>سعر الكيلو داخل المدينة (ج.م)
                <input type="number" step="0.5" value={settings.price_per_km_in_city} onChange={(e) => upd("price_per_km_in_city", e.target.value)} />
              </label>
              <label>سعر الكيلو بين المدن (ج.م)
                <input type="number" step="0.5" value={settings.price_per_km_intercity} onChange={(e) => upd("price_per_km_intercity", e.target.value)} />
              </label>
              <label>الحد الأدنى للرحلة (ج.م)
                <input type="number" step="1" value={settings.min_fare} onChange={(e) => upd("min_fare", e.target.value)} />
              </label>
              <label>رسوم الخدمة (%)
                <input type="number" step="1" value={settings.service_fee_percent} onChange={(e) => upd("service_fee_percent", e.target.value)} />
              </label>
              <label>نطاق توزيع الطلب (كم)
                <input type="number" step="0.5" value={settings.dispatch_radius_km} onChange={(e) => upd("dispatch_radius_km", e.target.value)} />
              </label>
              <label>مهلة قبول الطلب (ثانية)
                <input type="number" step="1" value={settings.dispatch_timeout_sec} onChange={(e) => upd("dispatch_timeout_sec", e.target.value)} />
              </label>
            </div>
            {saveMsg && <p className={saveMsg.includes("تعذّر") ? "authError" : "okMsg"}>{saveMsg}</p>}
            <button className="cta" onClick={saveSettings} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</button>
          </section>
        )}
      </main>
    </div>
  );
}
