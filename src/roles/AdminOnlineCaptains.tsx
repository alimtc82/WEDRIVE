import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface OnlineCaptainRow {
  id: string;
  full_name: string;
  phone: string;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  rating_avg: number;
  trips_count: number;
  last_seen_at: string;
  in_trip: boolean;
  trips_done: number;
  total_collected: number;
  company_share: number;
  total_paid: number;
  amount_due: number;
}

interface OnlineCaptainsPage {
  items: OnlineCaptainRow[];
  total: number;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 20;

function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

export default function AdminOnlineCaptains({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OnlineCaptainRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("admin_online_captains_page", {
      p_query: appliedQuery,
      p_page: page,
      p_page_size: PAGE_SIZE,
    });
    if (rpcError) {
      setRows([]);
      setTotal(0);
      setError("تعذّر تحميل الكباتن المتصلين: " + rpcError.message);
    } else {
      const result = data as unknown as OnlineCaptainsPage;
      setRows(result?.items || []);
      setTotal(Number(result?.total || 0));
    }
    setLoading(false);
  }, [appliedQuery, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel("admin-online-directory")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "captains" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="panel onlineDirectory">
      <div className="onlineDirectoryHead">
        <div>
          <button type="button" className="backLink" onClick={onBack}>→ العودة إلى النظرة العامة</button>
          <h2>الكباتن المتصلون الآن</h2>
          <p>{total} كابتن متصل خلال آخر 3 دقائق</p>
        </div>
        <span className="livePill"><i /> مباشر</span>
      </div>

      <form className="onlineSearch" onSubmit={search} role="search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث بالاسم أو رقم الهاتف أو رقم السيارة"
          aria-label="البحث في الكباتن المتصلين"
        />
        <button type="submit">بحث</button>
      </form>

      {error && <p className="authError" role="alert">{error}</p>}
      {loading && <p className="emptyState">جارٍ تحميل الكباتن المتصلين...</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="emptyState">{appliedQuery ? "لا توجد نتائج مطابقة" : "لا يوجد كباتن متصلون حاليًا"}</p>
      )}

      <div className="onlineCaptainGrid">
        {rows.map((captain) => (
          <article className="onlineCaptainCard" key={captain.id}>
            <div className="onlineCaptainTop">
              <div className="onlineCaptainAvatar">{(captain.full_name || "؟").trim().charAt(0)}</div>
              <div className="onlineCaptainIdentity">
                <h3>{captain.full_name || "بدون اسم"}</h3>
                <p>{captain.phone || "بدون هاتف"}</p>
              </div>
              <span className={`capState ${captain.in_trip ? "busy" : "ready"}`}>
                {captain.in_trip ? "في رحلة" : "جاهز"}
              </span>
            </div>

            <div className="onlineCaptainVehicle">
              <span>السيارة</span>
              <b>{captain.vehicle_type || "غير مسجل"}</b>
              <span>رقم السيارة</span>
              <b>{captain.vehicle_plate || "غير مسجل"}</b>
            </div>

            <div className="onlineCaptainStats">
              <div><span>التقييم</span><b>★ {Number(captain.rating_avg || 0).toFixed(1)}</b></div>
              <div><span>الرحلات</span><b>{captain.trips_done}</b></div>
              <div><span>المطلوب</span><b>{Number(captain.amount_due || 0).toFixed(2)} ج.م</b></div>
            </div>

            <div className="captainContactActions">
              <a className="callCaptain" href={`tel:${captain.phone}`} aria-label={`اتصال بـ ${captain.full_name}`}>
                ☎ اتصال
              </a>
              <a
                className="whatsappCaptain"
                href={`https://wa.me/${whatsappNumber(captain.phone)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`إرسال واتساب إلى ${captain.full_name}`}
              >
                واتساب
              </a>
            </div>
          </article>
        ))}
      </div>

      {!loading && total > PAGE_SIZE && (
        <nav className="onlinePagination" aria-label="صفحات الكباتن المتصلين">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>السابق</button>
          <span>صفحة {page} من {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>التالي</button>
        </nav>
      )}
    </section>
  );
}
