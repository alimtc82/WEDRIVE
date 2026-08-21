import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: "customer" | "captain";
  terms_version: string;
  accepted_at: string;
  signup_created_at: string | null;
  policy_sha256: string | null;
  total_count: number;
};

type Detail = Omit<Row, "total_count"> & {
  source: string;
  policy_text: string;
};

const PAGE_SIZE = 30;

function fmt(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(v));
}

function esc(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

export default function AdminLegalRecords() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const total = rows[0]?.total_count || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("admin_list_terms_acceptances", {
      p_query: query.trim(), p_role: role || null, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
    });
    setBusy(false);
    if (error) { setErr("تعذّر تحميل سجلات الموافقات: " + error.message); return; }
    setRows((data as Row[]) || []);
  }, [query, role, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 180);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setPage(1); }, [query, role]);

  const openDetail = async (id: number) => {
    setDetailBusy(true); setErr("");
    const { data, error } = await supabase.rpc("admin_get_terms_acceptance", { p_id: id });
    setDetailBusy(false);
    if (error) { setErr("تعذّر فتح إثبات الموافقة: " + error.message); return; }
    const first = Array.isArray(data) ? data[0] : null;
    setDetail((first as Detail) || null);
  };

  const printProof = (d: Detail) => {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) { setErr("اسمح بالنوافذ المنبثقة لطباعة الإثبات"); return; }
    const roleLabel = d.role === "captain" ? "كابتن" : "عميل";
    const policy = esc(d.policy_text || "").replace(/\n/g, "<br>");
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إثبات موافقة ${esc(d.full_name || d.user_id)}</title><style>
      body{font-family:Arial,Tahoma,sans-serif;color:#111827;margin:32px;line-height:1.8}h1{font-size:24px;margin:0 0 6px}h2{font-size:18px;margin-top:28px}table{width:100%;border-collapse:collapse;margin:20px 0}td{border:1px solid #cbd5e1;padding:8px;vertical-align:top}.note{padding:12px;border:1px solid #93c5fd;background:#eff6ff;border-radius:8px}.policy{white-space:normal;font-size:13px;border-top:2px solid #111827;padding-top:18px}.hash{direction:ltr;text-align:left;word-break:break-all;font-family:monospace;font-size:11px}@media print{button{display:none}}
    </style></head><body><h1>إثبات موافقة إلكترونية على سياسات الاستخدام</h1><div>كابتن بنها</div><table>
      <tr><td>الاسم</td><td>${esc(d.full_name || "—")}</td></tr><tr><td>نوع الحساب</td><td>${roleLabel}</td></tr>
      <tr><td>البريد</td><td>${esc(d.email || "—")}</td></tr><tr><td>الهاتف</td><td>${esc(d.phone || "—")}</td></tr>
      <tr><td>User ID</td><td class="hash">${esc(d.user_id)}</td></tr><tr><td>إصدار السياسة</td><td>${esc(d.terms_version)}</td></tr>
      <tr><td>وقت الموافقة</td><td>${esc(fmt(d.accepted_at))}</td></tr><tr><td>وقت إنشاء الحساب</td><td>${esc(fmt(d.signup_created_at))}</td></tr>
      <tr><td>بصمة النص SHA-256</td><td class="hash">${esc(d.policy_sha256 || "—")}</td></tr></table>
      <p class="note"><b>حفظ حقوق المستخدم:</b> هذا السجل يثبت الموافقة الإلكترونية على النسخة الموضحة فقط، ولا يُعد تنازلاً عن أي حق إلزامي للعميل أو الكابتن أو إسقاطًا لأي مسؤولية لا يجوز قانونًا استبعادها.</p>
      <h2>النص الذي تمت الموافقة عليه</h2><div class="policy">${policy}</div><script>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  };

  const selectedRole = useMemo(() => detail?.role === "captain" ? "كابتن" : "عميل", [detail]);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>السجلات القانونية</h2>
        <p>سجل قراءة فقط لإثبات الموافقات الإلكترونية مع الاحتفاظ بالنص التاريخي الذي وافق عليه المستخدم.</p>
      </div>
      <div className="legalNotice">
        <b>حفظ حقوق العميل والكابتن</b>
        <span>السجل يثبت القبول ولا يسمح بتغيير نص الموافقة بأثر رجعي، ولا يسقط أي حق إلزامي مقرر قانونًا.</span>
      </div>
      <div className="apFilters">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو الهاتف أو البريد أو User ID" />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">كل أنواع الحسابات</option><option value="customer">العملاء</option><option value="captain">الكباتن</option>
        </select>
        <button className="wizBack" onClick={() => { setQuery(""); setRole(""); }}>مسح البحث</button>
      </div>
      {err && <p className="authError">{err}</p>}
      {busy ? <p className="emptyState">جارٍ تحميل السجلات...</p> : (
        <div className="apList">
          {rows.map((r) => <div className="apRow" key={r.id}>
            <div className="apRowMain"><b>{r.full_name || "بدون اسم"}</b><span className="apMeta">{r.role === "captain" ? "كابتن" : "عميل"} · {r.email || r.phone || r.user_id}<br/>وافق على {r.terms_version} — {fmt(r.accepted_at)}</span></div>
            <div className="apRowActions"><button onClick={() => void openDetail(r.id)} disabled={detailBusy}>عرض الإثبات</button></div>
          </div>)}
          {!rows.length && <p className="emptyState">لا توجد موافقات مطابقة.</p>}
        </div>
      )}
      <div className="apPager"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>التالي</button></div>
      <p className="apCount">إجمالي السجلات: {total}</p>

      {detail && <div className="legalOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
        <section className="legalModal" role="dialog" aria-modal="true" dir="rtl">
          <header><div><small>إثبات موافقة رقم #{detail.id}</small><h3>{detail.full_name || detail.user_id}</h3></div><button onClick={() => setDetail(null)}>×</button></header>
          <div className="legalMetaGrid"><div><span>نوع الحساب</span><b>{selectedRole}</b></div><div><span>إصدار السياسة</span><b>{detail.terms_version}</b></div><div><span>وقت الموافقة</span><b>{fmt(detail.accepted_at)}</b></div><div><span>إنشاء الحساب</span><b>{fmt(detail.signup_created_at)}</b></div><div><span>البريد</span><b>{detail.email || "—"}</b></div><div><span>الهاتف</span><b>{detail.phone || "—"}</b></div></div>
          <div className="legalHash"><span>SHA-256 للنص</span><code>{detail.policy_sha256 || "—"}</code></div>
          <p className="legalRights">هذا الإثبات لا ينتقص من الحقوق الإلزامية للمستخدم ولا يغير النص الذي وافق عليه وقت التسجيل.</p>
          <div className="legalPolicyText">{detail.policy_text}</div>
          <footer><button className="authSubmit" onClick={() => printProof(detail)}>طباعة / حفظ PDF</button><button className="wizBack" onClick={() => setDetail(null)}>إغلاق</button></footer>
        </section>
      </div>}
    </section>
  );
}
