import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import LiveNetworkActivity from "../components/LiveNetworkActivity";
import "../simulation.css";

type SimTrip = {
  id: string;
  seq: number;
  captain_name: string;
  customer_name: string;
  status: "waiting" | "in_progress" | "completed" | "stopped";
  scheduled_start_at: string;
  scheduled_end_at: string;
  distance_km: number;
  price: number;
  progress: number;
};

type Snapshot = {
  exists: boolean;
  status?: "active" | "completed" | "stopped";
  started_at?: string;
  elapsed_seconds?: number;
  captains?: number;
  customers?: number;
  total_trips?: number;
  started_trips?: number;
  active_trips?: number;
  completed_trips?: number;
  waiting_trips?: number;
  trips?: SimTrip[];
};

const statusLabel: Record<string, string> = {
  waiting: "بانتظار وقت البدء",
  in_progress: "جارية الآن",
  completed: "مكتملة",
  stopped: "متوقفة",
};

function fmtTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminSimulation() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ exists: false });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_simulation_snapshot");
    if (!error && data) setSnapshot(data as Snapshot);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    const onFocus = () => void load();
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const start = async () => {
    if (!password) { setMsg("أدخل كلمة مرور البث التجريبي"); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("admin_start_simulation", { p_password: password });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setPassword("");
    setMsg("بدأ البث التجريبي بنجاح ✓");
    await load();
  };

  const stop = async () => {
    if (!password) { setMsg("أدخل كلمة مرور البث التجريبي لإيقافه"); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("admin_stop_simulation", { p_password: password });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setPassword("");
    setMsg("تم إيقاف البث التجريبي ✓");
    await load();
  };

  const trips = snapshot.trips ?? [];
  const active = trips.filter((t) => t.status === "in_progress");
  const upcoming = trips.filter((t) => t.status === "waiting").slice(0, 5);
  const isRunning = snapshot.status === "active";

  return (
    <>
      <section className="panel simPanel">
        <div className="simHead">
          <div>
            <h2>البث التجريبي للنظام</h2>
            <p>30 كابتن + 30 عميل · رحلة جديدة كل دقيقة لمدة 30 دقيقة · مدة كل رحلة 15 دقيقة</p>
          </div>
          <span className={`simState ${isRunning ? "on" : "off"}`}>{isRunning ? "● يعمل الآن" : snapshot.status === "completed" ? "مكتمل" : "متوقف"}</span>
        </div>

        <div className="simNotice">
          البث يظهر على خريطة الأدمن فقط: 30 سيارة متصلة، الرمادي متوقف والأزرق في رحلة. لا يظهر أي نشاط تجريبي للعميل أو الكابتن.
        </div>

        <div className="simMetrics">
          <div><span>الكباتن</span><b>{snapshot.exists ? snapshot.captains ?? 30 : 30}</b></div>
          <div><span>العملاء</span><b>{snapshot.exists ? snapshot.customers ?? 30 : 30}</b></div>
          <div><span>بدأت</span><b>{snapshot.started_trips ?? 0}/30</b></div>
          <div><span>جارية الآن</span><b>{snapshot.active_trips ?? 0}</b></div>
          <div><span>مكتملة</span><b>{snapshot.completed_trips ?? 0}</b></div>
        </div>

        {snapshot.exists && (
          <div className="simRunMeta">
            <span>بداية البث: <b>{fmtTime(snapshot.started_at)}</b></span>
            <span>المتبقي للبدء: <b>{snapshot.waiting_trips ?? 0}</b></span>
            <span>زمن التشغيل: <b>{Math.floor((snapshot.elapsed_seconds ?? 0) / 60)} دقيقة</b></span>
          </div>
        )}

        <div className="simControl">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة مرور البث التجريبي"
            autoComplete="off"
          />
          {!isRunning ? (
            <button className="simStart" onClick={start} disabled={busy}>{busy ? "جارٍ التشغيل..." : "▶ بدء بث تجريبي"}</button>
          ) : (
            <button className="simStop" onClick={stop} disabled={busy}>{busy ? "جارٍ الإيقاف..." : "■ إيقاف البث"}</button>
          )}
        </div>
        {msg && <p className={msg.includes("✓") ? "okMsg" : "authError"}>{msg}</p>}

        {active.length > 0 && (
          <div className="simSection">
            <h3>الرحلات الجارية الآن ({active.length})</h3>
            <div className="simTrips">
              {active.map((t) => (
                <div className="simTrip" key={t.id}>
                  <div className="simTripTop">
                    <b>#{t.seq} · {t.captain_name}</b>
                    <span>{t.customer_name}</span>
                  </div>
                  <div className="simProgress"><i style={{ width: `${Math.round((t.progress || 0) * 100)}%` }} /></div>
                  <div className="simTripMeta">
                    <span>{Number(t.distance_km).toFixed(1)} كم</span>
                    <span>{Number(t.price).toFixed(0)} ج.م</span>
                    <span>{fmtTime(t.scheduled_start_at)} ← {fmtTime(t.scheduled_end_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="simSection">
            <h3>القادم</h3>
            <div className="simUpcoming">
              {upcoming.map((t) => <span key={t.id}>#{t.seq} · {fmtTime(t.scheduled_start_at)} · {statusLabel[t.status]}</span>)}
            </div>
          </div>
        )}
      </section>
      <LiveNetworkActivity />
    </>
  );
}
