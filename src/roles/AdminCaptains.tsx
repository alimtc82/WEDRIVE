import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { signedDocUrl } from "../lib/captainDocs";

interface CaptainRow {
  id: string; full_name: string; phone: string; email: string;
  status: string; created_at: string;
  id_card_front: string; id_card_back: string; id_card_expiry: string;
  vehicle_license_front: string; vehicle_license_back: string; vehicle_license_expiry: string;
  driver_license_front: string; driver_license_back: string; driver_license_expiry: string;
  terms_accepted_at: string; reject_reason: string | null;
  rating_avg: number; trips_count: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض", suspended: "موقوف",
};

export default function AdminCaptains() {
  const [filter, setFilter] = useState<string>("pending");
  const [rows, setRows] = useState<CaptainRow[]>([]);
  const [selected, setSelected] = useState<CaptainRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("admin_list_captains", {
      p_status: filter === "all" ? null : filter,
    });
    setRows((data as CaptainRow[]) || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, status: string) => {
    let reason: string | null = null;
    if (status === "rejected") {
      reason = prompt("سبب الرفض (اختياري):") || null;
    }
    const { error } = await supabase.rpc("admin_review_captain", {
      p_captain_id: id, p_status: status, p_reason: reason,
    });
    if (error) { alert("خطأ: " + error.message); return; }
    setSelected(null);
    load();
  };

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>إدارة الكباتن</h2>
        <p>راجع مستندات الكباتن ووافق أو ارفض</p>
      </div>

      <div className="capFilter">
        {["pending", "approved", "rejected", "all"].map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "الكل" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading && <p className="emptyState">جارٍ التحميل...</p>}
      {!loading && rows.length === 0 && <p className="emptyState">لا يوجد كباتن في هذه الحالة</p>}

      <div className="capList">
        {rows.map((c) => (
          <div className="capRow" key={c.id} onClick={() => setSelected(c)}>
            <div className="capAvatar">{(c.full_name || "؟").charAt(0)}</div>
            <div className="capMeta">
              <b>{c.full_name || "بدون اسم"}</b>
              <span>{c.phone} · {c.email}</span>
            </div>
            <span className={`capBadge ${c.status}`}>{STATUS_LABEL[c.status]}</span>
          </div>
        ))}
      </div>

      {selected && (
        <CaptainDetail row={selected} onClose={() => setSelected(null)} onReview={review} />
      )}
    </section>
  );
}

function CaptainDetail({ row, onClose, onReview }: {
  row: CaptainRow; onClose: () => void; onReview: (id: string, status: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const docs = [
    { label: "البطاقة - الوجه", path: row.id_card_front },
    { label: "البطاقة - الظهر", path: row.id_card_back },
    { label: "رخصة السيارة - الوجه", path: row.vehicle_license_front },
    { label: "رخصة السيارة - الظهر", path: row.vehicle_license_back },
    { label: "رخصة القيادة - الوجه", path: row.driver_license_front },
    { label: "رخصة القيادة - الظهر", path: row.driver_license_back },
  ];
  const expiries = [
    { label: "انتهاء البطاقة", date: row.id_card_expiry },
    { label: "انتهاء رخصة السيارة", date: row.vehicle_license_expiry },
    { label: "انتهاء رخصة القيادة", date: row.driver_license_expiry },
  ];

  return (
    <div className="modalWrap" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="modalHead">
          <h3>{row.full_name}</h3>
          <button className="modalX" onClick={onClose}>✕</button>
        </div>

        <div className="detailGrid">
          <div><span>الهاتف</span><b>{row.phone || "—"}</b></div>
          <div><span>البريد</span><b>{row.email}</b></div>
          <div><span>الحالة</span><b>{STATUS_LABEL[row.status]}</b></div>
          <div><span>عدد الرحلات</span><b>{row.trips_count}</b></div>
        </div>

        <div className="expiryRow">
          {expiries.map((e, i) => {
            const expired = e.date && e.date <= today;
            return (
              <div key={i} className={`expiryChip ${expired ? "expired" : "valid"}`}>
                {e.label}: {e.date || "—"} {expired ? "⚠ منتهية" : "✓"}
              </div>
            );
          })}
        </div>

        <div className="docsGrid">
          {docs.map((d, i) => <DocThumb key={i} label={d.label} path={d.path} />)}
        </div>

        {row.status === "pending" && (
          <div className="reviewBtns">
            <button className="rejectBtn" onClick={() => onReview(row.id, "rejected")}>رفض</button>
            <button className="approveBtn" onClick={() => onReview(row.id, "approved")}>موافقة وتفعيل</button>
          </div>
        )}
        {row.status === "approved" && (
          <button className="suspendBtn" onClick={() => onReview(row.id, "suspended")}>إيقاف الحساب</button>
        )}
        {(row.status === "rejected" || row.status === "suspended") && (
          <button className="approveBtn" onClick={() => onReview(row.id, "approved")}>إعادة التفعيل</button>
        )}
      </div>
    </div>
  );
}

function DocThumb({ label, path }: { label: string; path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) signedDocUrl(path).then(setUrl); }, [path]);
  return (
    <a className="docThumb" href={url || undefined} target="_blank" rel="noreferrer">
      {url ? <img src={url} alt={label} /> : <div className="docThumbEmpty">—</div>}
      <span>{label}</span>
    </a>
  );
}
