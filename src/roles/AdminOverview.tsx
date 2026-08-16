import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

interface Stats {
  captains_approved: number; captains_online: number;
  trips_pending: number; trips_ongoing: number; trips_completed: number;
}
interface OnlineCaptain {
  id: string; full_name: string; phone: string;
  in_trip: boolean; trips_done: number;
  total_collected: number; company_share: number;
  total_paid: number; amount_due: number;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [online, setOnline] = useState<OnlineCaptain[]>([]);

  const load = useCallback(async () => {
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.rpc("admin_online_captains"),
    ]);
    if (s) setStats(s as Stats);
    if (o) setOnline(o as OnlineCaptain[]);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const recordSettlement = async (c: OnlineCaptain) => {
    const input = prompt(`تسجيل سداد من ${c.full_name}\nالمطلوب حاليًا: ${c.amount_due.toFixed(2)} ج.م\n\nأدخل المبلغ المسدّد:`);
    if (!input) return;
    const amount = parseFloat(input);
    if (!amount || amount <= 0) { alert("مبلغ غير صحيح"); return; }
    const { error } = await supabase.rpc("admin_record_settlement", {
      p_captain_id: c.id, p_amount: amount, p_note: null,
    });
    if (error) { alert("خطأ: " + error.message); return; }
    load();
  };

  return (
    <>
      <section className="metricsGrid">
        <div className="metric"><span>كباتن معتمدون</span><b>{stats?.captains_approved ?? "—"}</b></div>
        <div className="metric"><span>متصلون الآن</span><b>{stats?.captains_online ?? "—"}</b></div>
        <div className="metric"><span>طلبات قيد الانتظار</span><b>{stats?.trips_pending ?? "—"}</b></div>
        <div className="metric"><span>رحلات جارية الآن</span><b>{stats?.trips_ongoing ?? "—"}</b></div>
        <div className="metric"><span>رحلات مكتملة</span><b>{stats?.trips_completed ?? "—"}</b></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panelHead">
          <h2>الكباتن المتصلون الآن</h2>
          <p>الحالة والتحصيلات والمبالغ المطلوبة</p>
        </div>

        {online.length === 0 && <p className="emptyState">لا يوجد كباتن متصلون حاليًا</p>}

        <div className="capFinList">
          {online.map((c) => (
            <div className="capFinCard" key={c.id}>
              <div className="capFinTop">
                <div>
                  <b>{c.full_name}</b>
                  <span className="capFinPhone">{c.phone}</span>
                </div>
                <span className={`capState ${c.in_trip ? "busy" : "ready"}`}>
                  {c.in_trip ? "في رحلة جارية" : "جاهز — بانتظار رحلة"}
                </span>
              </div>

              <div className="capFinGrid">
                <div><span>رحلات منفّذة</span><b>{c.trips_done}</b></div>
                <div><span>إجمالي التحصيل</span><b>{Number(c.total_collected).toFixed(2)}</b></div>
                <div><span>نسبة الشركة</span><b>{Number(c.company_share).toFixed(2)}</b></div>
                <div><span>المسدّد</span><b>{Number(c.total_paid).toFixed(2)}</b></div>
                <div className="dueCell"><span>المطلوب سداده</span><b>{Number(c.amount_due).toFixed(2)} ج.م</b></div>
              </div>

              <button className="settleBtn" onClick={() => recordSettlement(c)}>تسجيل سداد</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
