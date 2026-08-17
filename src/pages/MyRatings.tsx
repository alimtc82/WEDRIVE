import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { FiltersBar, Pagination, initialFilters, rangeOf, fmtDateTime, type FiltersState } from "../components/ListFilters";
import "../listPages.css";

interface RatingRow { stars: number; comment: string | null; created_at: string; kind: string; }

function starsLine(n: number) { return "★".repeat(n) + "☆".repeat(5 - n); }

export default function MyRatings() {
  const [f, setF] = useState<FiltersState>(initialFilters());
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [avg, setAvg] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = rangeOf(f);
    const { data } = await supabase.rpc("my_ratings_list", {
      p_from: from, p_to: to, p_kind: f.kind || null,
      p_limit: f.pageSize, p_offset: f.page * f.pageSize,
    });
    if (data) { setRows(data.rows || []); setTotal(data.total || 0); setAvg(Number(data.avg) || 0); }
    setLoading(false);
  }, [f]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>تقييماتي</h2>
        <p>التقييمات التي حصلت عليها من الطرف الآخر</p>
      </div>

      <div className="rateSummary">
        <span className="big">{avg.toFixed(1)}</span>
        <div>
          <div className="starsLine">{starsLine(Math.round(avg))}</div>
          <small>{total} تقييم في الفترة المحددة</small>
        </div>
      </div>

      <FiltersBar f={f} onChange={setF} />
      {loading && <p className="emptyState">جارٍ التحميل...</p>}
      {!loading && rows.length === 0 && <p className="emptyState">لا توجد تقييمات في هذه الفترة</p>}

      {!loading && rows.map((r, i) => (
        <div className="lpRow" key={i}>
          <div className="lpRowTop">
            <span className="rateStars">{starsLine(r.stars)}</span>
            <span className="lpBadge kind">{r.kind === "intercity" ? "خارج المدينة" : "داخل المدينة"}</span>
            <span className="lpDate">{fmtDateTime(r.created_at)}</span>
          </div>
          {r.comment && <div className="rateComment">{r.comment}</div>}
        </div>
      ))}

      <Pagination total={total} pageSize={f.pageSize} page={f.page}
        onPage={(p) => setF({ ...f, page: p })} />
    </section>
  );
}
