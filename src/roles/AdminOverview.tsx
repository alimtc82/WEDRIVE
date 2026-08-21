import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { OnlineCaptainRow } from "./AdminOnlineCaptains";

interface Stats {
  captains_approved: number; captains_online: number;
  trips_pending: number; trips_ongoing: number; trips_completed: number;
}
export default function AdminOverview({ onOpenOnline }: { onOpenOnline: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [online, setOnline] = useState<OnlineCaptainRow[]>([]);

  const load = useCallback(async () => {
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.rpc("admin_online_captains_page", { p_query: "", p_page: 1, p_page_size: 3 }),
    ]);
    if (s) setStats(s as Stats);
    if (o) setOnline(((o as { items?: OnlineCaptainRow[] }).items) || []);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const recordSettlement = async (c: OnlineCaptainRow) => {
    const input = prompt(`تسجيل سداد من ${c.full_name}\nالمطلوب حاليًا: ${Number(c.amount_due).toFixed(2)} ج.م\n\nأدخل المبلغ المسدّد:`);
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
        <button type="button" className="metric metricButton onlineMetric" onClick={onOpenOnline}>
          <span>متصلون الآن</span>
          <b>{stats?.captains_online ?? "—"}</b>
          <small>{online.length > 0 ? online.map((captain) => captain.full_name).join("، ") : "اضغط لعرض القائمة"}</small>
        </button>
        <div className="metric"><span>طلبات قيد الانتظار</span><b>{stats?.trips_pending ?? "—"}</b></div>
        <div className="metric"><span>رحلات جارية الآن</span><b>{stats?.trips_ongoing ?? "—"}</b></div>
        <div className="metric"><span>رحلات مكتملة</span><b>{stats?.trips_completed ?? "—"}</b></div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panelHead">
          <h2>الكباتن المتصلون الآن</h2>
          <p>الحالة والتحصيلات والمبالغ المطلوبة</p>
          <button type="button" className="viewAllOnline" onClick={onOpenOnline}>عرض الكل</button>
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

