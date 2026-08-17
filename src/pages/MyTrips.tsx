import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { FiltersBar, Pagination, initialFilters, rangeOf, fmtDateTime, type FiltersState } from "../components/ListFilters";
import type { LatLng } from "../lib/geo";
import "../listPages.css";

interface TripRow {
  id: string; status: string; kind: string;
  pickup_address: string; dropoff_address: string;
  pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number;
  distance_km: number; price: number;
  requested_at: string; completed_at: string | null;
  is_customer: boolean; other_name: string | null;
}

interface Fav {
  id: string;
  pickup_address: string; dropoff_address: string;
  pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد الانتظار", accepted: "مقبولة", arrived: "الكابتن وصل",
  in_progress: "جارية", completed: "مكتملة", cancelled: "ملغاة",
};

export default function MyTrips({ isCustomer, onPickFavorite }: {
  isCustomer: boolean;
  onPickFavorite?: (t: { pickup: LatLng; pickupAddr: string; dropoff: LatLng; dropoffAddr: string }) => void;
}) {
  const [f, setF] = useState<FiltersState>(initialFilters());
  const [rows, setRows] = useState<TripRow[]>([]);
  const [total, setTotal] = useState(0);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = rangeOf(f);
    const { data } = await supabase.rpc("my_trips_list", {
      p_from: from, p_to: to, p_kind: f.kind || null,
      p_limit: f.pageSize, p_offset: f.page * f.pageSize,
    });
    if (data) { setRows(data.rows || []); setTotal(data.total || 0); }
    setLoading(false);
  }, [f]);

  useEffect(() => { load(); }, [load]);

  const loadFavs = useCallback(async () => {
    if (!isCustomer) return;
    const { data } = await supabase
      .from("favorite_trips")
      .select("id,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng")
      .order("created_at", { ascending: false });
    if (data) setFavs(data as Fav[]);
  }, [isCustomer]);
  useEffect(() => { loadFavs(); }, [loadFavs]);

  const addFav = async (t: TripRow) => {
    setMsg("");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("favorite_trips").insert({
      customer_id: u.user.id,
      pickup_address: t.pickup_address, dropoff_address: t.dropoff_address,
      pickup_lat: t.pickup_lat, pickup_lng: t.pickup_lng,
      dropoff_lat: t.dropoff_lat, dropoff_lng: t.dropoff_lng,
    });
    if (error) { setMsg("تعذّر الحفظ في المفضلة"); return; }
    setMsg("أُضيفت إلى المفضلة ✓");
    loadFavs();
  };

  const removeFav = async (id: string) => {
    await supabase.from("favorite_trips").delete().eq("id", id);
    loadFavs();
  };

  const useFav = (fv: Fav) => {
    onPickFavorite?.({
      pickup: { lat: fv.pickup_lat, lng: fv.pickup_lng },
      pickupAddr: fv.pickup_address || "",
      dropoff: { lat: fv.dropoff_lat, lng: fv.dropoff_lng },
      dropoffAddr: fv.dropoff_address || "",
    });
  };

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>رحلاتي</h2>
        <p>سجل كامل بكل رحلاتك مع الوقت والسعر</p>
      </div>

      {isCustomer && favs.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>⭐ رحلاتي المفضلة</h3>
          {favs.map((fv) => (
            <div className="favCard" key={fv.id}>
              <div className="lpRoute">
                <div className="rSeg"><i className="dotFrom" /><span>{fv.pickup_address || "—"}</span></div>
                <div className="rSeg"><i className="dotTo" /><span>{fv.dropoff_address || "—"}</span></div>
              </div>
              <button className="favUse" onClick={() => useFav(fv)}>اطلب الآن</button>
              <button className="favDel" onClick={() => removeFav(fv.id)} aria-label="حذف من المفضلة">✕</button>
            </div>
          ))}
        </>
      )}

      <FiltersBar f={f} onChange={setF} />
      {msg && <p className="okMsg">{msg}</p>}
      {loading && <p className="emptyState">جارٍ التحميل...</p>}
      {!loading && rows.length === 0 && <p className="emptyState">لا توجد رحلات في هذه الفترة</p>}

      {!loading && rows.map((t) => (
        <div className="lpRow" key={t.id}>
          <div className="lpRowTop">
            <span className={`lpBadge ${t.status === "completed" ? "done" : t.status === "cancelled" ? "cancel" : ""}`}>
              {STATUS_LABEL[t.status] || t.status}
            </span>
            <span className="lpBadge kind">{t.kind === "intercity" ? "خارج المدينة" : "داخل المدينة"}</span>
            {isCustomer && t.pickup_lat != null && (
              <button className="lpFavBtn" onClick={() => addFav(t)}>☆ أضف للمفضلة</button>
            )}
            <span className="lpDate">{fmtDateTime(t.requested_at)}</span>
          </div>
          <div className="lpRoute">
            <div className="rSeg"><i className="dotFrom" /><span>{t.pickup_address || "—"}</span></div>
            <div className="rSeg"><i className="dotTo" /><span>{t.dropoff_address || "—"}</span></div>
          </div>
          <div className="lpMeta">
            <span>{isCustomer ? "الكابتن" : "العميل"}: <b>{t.other_name || "—"}</b></span>
            <span>{t.distance_km} كم</span>
            <span className="lpPrice">{Number(t.price).toFixed(2)} ج.م</span>
            {t.completed_at && <span>اكتملت: {fmtDateTime(t.completed_at)}</span>}
          </div>
        </div>
      ))}

      <Pagination total={total} pageSize={f.pageSize} page={f.page}
        onPage={(p) => setF({ ...f, page: p })} />
    </section>
  );
}
