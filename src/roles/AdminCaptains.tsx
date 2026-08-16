import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { signedDocUrl, deleteCaptainDocs } from "../lib/captainDocs";

interface CaptainRow {
  id: string; full_name: string; phone: string; email: string;
  status: string; created_at: string;
  id_card_front: string; id_card_back: string; id_card_expiry: string;
  vehicle_license_front: string; vehicle_license_back: string; vehicle_license_expiry: string;
  driver_license_front: string; driver_license_back: string; driver_license_expiry: string;
  selfie_photo: string; car_front_photo: string; car_back_photo: string; plate_photo: string;
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

  const remove = async (id: string, name: string) => {
    const ok = window.confirm(
      `⚠️ حذف نهائي\n\nهل أنت متأكد من حذف الكابتن "${name}" نهائيًا؟\nسيتم حذف حسابه ومستنداته بالكامل، ولا يمكن التراجع.`
    );
    if (!ok) return;
    // حذف الملفات من التخزين أولًا (عبر Storage API)، ثم حذف الحساب
    try { await deleteCaptainDocs(id); } catch { /* تجاهل لو لا توجد ملفات */ }
    const { error } = await supabase.rpc("admin_delete_captain", { p_captain_id: id });
    if (error) { alert("تعذّر الحذف: " + error.message); return; }
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
        <CaptainDetail row={selected} onClose={() => setSelected(null)} onReview={review} onRemove={remove} />
      )}
    </section>
  );
}

function CaptainDetail({ row, onClose, onReview, onRemove }: {
  row: CaptainRow; onClose: () => void; onReview: (id: string, status: string) => void;
  onRemove: (id: string, name: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [lightbox, setLightbox] = useState<number | null>(null);
  const docs = [
    { label: "البطاقة - الوجه", path: row.id_card_front },
    { label: "البطاقة - الظهر", path: row.id_card_back },
    { label: "رخصة السيارة - الوجه", path: row.vehicle_license_front },
    { label: "رخصة السيارة - الظهر", path: row.vehicle_license_back },
    { label: "رخصة القيادة - الوجه", path: row.driver_license_front },
    { label: "رخصة القيادة - الظهر", path: row.driver_license_back },
    { label: "صورة الكابتن", path: row.selfie_photo },
    { label: "السيارة - أمام", path: row.car_front_photo },
    { label: "السيارة - خلف", path: row.car_back_photo },
    { label: "اللوحة المعدنية", path: row.plate_photo },
  ].filter((d) => d.path);
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
          {docs.map((d, i) => <DocThumb key={i} label={d.label} path={d.path} onOpen={() => setLightbox(i)} />)}
        </div>

        {lightbox !== null && (
          <DocLightbox docs={docs} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
        )}

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

        <button className="deleteBtn" onClick={() => onRemove(row.id, row.full_name)}>حذف الكابتن نهائيًا</button>
      </div>
    </div>
  );
}

function DocThumb({ label, path, onOpen }: { label: string; path: string; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) signedDocUrl(path).then(setUrl); }, [path]);
  return (
    <button type="button" className="docThumb" onClick={onOpen} aria-label={`عرض ${label}`}>
      {url ? <img src={url} alt={label} /> : <div className="docThumbEmpty">—</div>}
      <span>{label}</span>
    </button>
  );
}

function DocLightbox({ docs, index, onIndex, onClose }: {
  docs: { label: string; path: string }[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    signedDocUrl(docs[index].path).then(setUrl);
  }, [docs, index]);

  const prev = () => onIndex((index - 1 + docs.length) % docs.length);
  const next = () => onIndex((index + 1) % docs.length);

  // إغلاق/تنقّل بلوحة المفاتيح
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="lbWrap" onClick={onClose}>
      <button className="lbClose" onClick={onClose} aria-label="خروج">✕</button>

      <button className="lbNav lbPrev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="السابق">‹</button>

      <div className="lbBody" onClick={(e) => e.stopPropagation()}>
        {url
          ? <img src={url} alt={docs[index].label} className="lbImg" />
          : <div className="lbLoading">جارٍ التحميل...</div>}
        <div className="lbCaption">{docs[index].label} · {index + 1} / {docs.length}</div>
      </div>

      <button className="lbNav lbNext" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="التالي">›</button>
    </div>
  );
}
