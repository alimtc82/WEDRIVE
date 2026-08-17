import "../listPages.css";

export type TimeKey = "today" | "yesterday" | "last7" | "month" | "prevMonth" | "year" | "custom";

export interface FiltersState {
  time: TimeKey;
  customFrom: string;
  customTo: string;
  kind: string; // "" = الكل | in_city | intercity
  pageSize: number;
  page: number;
}

export function initialFilters(): FiltersState {
  return { time: "month", customFrom: "", customTo: "", kind: "", pageSize: 20, page: 0 };
}

const dstr = (x: Date) => x.toISOString().slice(0, 10);

export function rangeOf(f: FiltersState): { from: string; to: string } {
  const now = new Date();
  const today = dstr(now);
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const last7 = new Date(now); last7.setDate(last7.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  switch (f.time) {
    case "today": return { from: today, to: today };
    case "yesterday": return { from: dstr(yest), to: dstr(yest) };
    case "last7": return { from: dstr(last7), to: today };
    case "prevMonth": return { from: dstr(prevStart), to: dstr(prevEnd) };
    case "year": return { from: dstr(yearStart), to: today };
    case "custom": return { from: f.customFrom || today, to: f.customTo || today };
    case "month":
    default: return { from: dstr(monthStart), to: today };
  }
}

export function fmtDateTime(x: string | null): string {
  if (!x) return "—";
  return new Date(x).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

export function FiltersBar({ f, onChange }: { f: FiltersState; onChange: (nf: FiltersState) => void }) {
  const set = (patch: Partial<FiltersState>) => onChange({ ...f, page: 0, ...patch });
  return (
    <div className="lpFilters">
      <select value={f.time} onChange={(e) => set({ time: e.target.value as TimeKey })} aria-label="الفترة الزمنية">
        <option value="today">اليوم</option>
        <option value="yesterday">أمس</option>
        <option value="last7">آخر 7 أيام</option>
        <option value="month">هذا الشهر</option>
        <option value="prevMonth">الشهر الماضي</option>
        <option value="year">هذه السنة</option>
        <option value="custom">نطاق مخصص</option>
      </select>
      <select value={f.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="نوع الرحلة">
        <option value="">الكل</option>
        <option value="in_city">داخل المدينة</option>
        <option value="intercity">خارج المدينة</option>
      </select>
      <select value={f.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })} aria-label="عدد السجلات">
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
        <option value={100000}>الكل</option>
      </select>
      {f.time === "custom" && (
        <div className="lpCustomRange">
          <label>من: <input type="date" value={f.customFrom} onChange={(e) => set({ customFrom: e.target.value })} /></label>
          <label>إلى: <input type="date" value={f.customTo} onChange={(e) => set({ customTo: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}

export function Pagination({ total, pageSize, page, onPage }: {
  total: number; pageSize: number; page: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums: number[] = [];
  const start = Math.max(0, Math.min(page - 2, pages - 5));
  for (let i = start; i < Math.min(start + 5, pages); i++) nums.push(i);
  return (
    <div className="lpPages">
      <button disabled={page === 0} onClick={() => onPage(page - 1)}>السابق</button>
      {nums.map((n) => (
        <button key={n} className={n === page ? "on" : ""} onClick={() => onPage(n)}>{n + 1}</button>
      ))}
      <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>التالي</button>
      <span className="lpPagesInfo">صفحة {page + 1} من {pages} · {total} سجل</span>
    </div>
  );
}
