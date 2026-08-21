import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import StarRating from "./StarRating";
import TripMap from "./TripMap";

interface TripStop { lat: number; lng: number; address?: string; }

interface ActiveTrip {
  id: string; status: string; kind: string;
  pickup_address: string; dropoff_address: string;
  distance_km: number; price: number;
  is_customer: boolean;
  captain: { name: string; phone: string; rating: number; trips: number; vehicle: string | null; plate: string | null } | null;
  customer: { name: string; phone: string; rating: number; trips: number } | null;
}

const STATUS_STEPS = [
  { key: "accepted", label: "الكابتن في الطريق إليك" },
  { key: "arrived", label: "الكابتن وصل نقطة الالتقاء" },
  { key: "in_progress", label: "الرحلة جارية" },
  { key: "completed", label: "انتهت الرحلة" },
];

export default function ActiveTrip({ onDone }: { onDone: () => void }) {
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_active_trip");
    setTrip(data as ActiveTrip | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!trip?.id) { setStops([]); return; }
    supabase.from("trips").select("stops").eq("id", trip.id).single()
      .then(({ data }) => {
        if (data && Array.isArray(data.stops)) setStops(data.stops as TripStop[]);
        else setStops([]);
      });
  }, [trip?.id]);

  useEffect(() => {
    void load();
    const ch = supabase.channel("active-trip")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => { void load(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });

    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(refresh, 8_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      void supabase.removeChannel(ch);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const act = async (fn: string) => {
    if (!trip) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc(fn, { p_trip_id: trip.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    void load();
  };

  const cancel = async () => {
    if (!trip) return;
    if (!window.confirm("هل أنت متأكد من إلغاء الرحلة؟")) return;
    setBusy(true);
    await supabase.rpc("cancel_trip", { p_trip_id: trip.id, p_reason: null });
    setBusy(false);
    onDone();
  };

  const rate = async () => {
    if (!trip) return;
    if (stars < 1) { setErr("اختر تقييمًا من 1 إلى 5"); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("submit_rating", {
      p_trip_id: trip.id, p_stars: stars, p_comment: comment.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  };

  if (loading) return <div className="fullCenter"><div className="spinner" /></div>;
  if (!trip) return null;

  const other = trip.is_customer ? trip.captain : trip.customer;
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === trip.status);

  return (
    <section className="panel tripPanel">
      <div className="tripStatus">
        <span className="tripStatusLabel">{STATUS_STEPS[stepIndex]?.label || "رحلتك"}</span>
        <div className="tripSteps">
          {STATUS_STEPS.map((s, i) => (
            <span key={s.key} className={`tripStep ${i <= stepIndex ? "on" : ""}`} />
          ))}
        </div>
      </div>

      {trip.status !== "completed" && (
        <TripMap tripId={trip.id} status={trip.status} />
      )}

      {other && (
        <div className="tripParty">
          <div className="tripAvatar">{(other.name || "؟").charAt(0)}</div>
          <div className="tripPartyInfo">
            <b>{other.name || (trip.is_customer ? "الكابتن" : "العميل")}</b>
            <span>★ {Number(other.rating).toFixed(1)} · {other.trips} رحلة</span>
            {trip.is_customer && trip.captain?.vehicle && (
              <span className="tripVehicle">{trip.captain.vehicle} · {trip.captain.plate}</span>
            )}
          </div>
          {other.phone && (
            <a className="tripCall" href={`tel:${other.phone}`} aria-label="اتصال">📞</a>
          )}
        </div>
      )}

      <div className="tripRoute">
        <div className="rSeg"><i className="dotFrom" /><span>{trip.pickup_address}</span></div>
        {stops.map((s, i) => (
          <div className="rSeg" key={i}>
            <i className="dotStop" /><span>{s.address || `نقطة توقف ${i + 1}`}</span>
          </div>
        ))}
        <div className="rSeg"><i className="dotTo" /><span>{trip.dropoff_address}</span></div>
      </div>
      <div className="fareBox">
        <div><span>المسافة{stops.length > 0 ? " (شاملة التوقفات)" : ""}</span><b className="distVal">{trip.distance_km} كم</b></div>
        <div style={{ textAlign: "left" }}><span>الأجرة (نقدًا)</span><b>{Number(trip.price).toFixed(0)} ج.م</b></div>
      </div>

      {err && <p className="authError">{err}</p>}

      {trip.status === "completed" ? (
        <div className="ratingArea">
          <h3>{trip.is_customer ? "قيّم الكابتن" : "قيّم العميل"}</h3>
          <StarRating value={stars} onChange={setStars} />
          <textarea className="ratingComment" placeholder="تعليق (اختياري)" value={comment}
            onChange={(e) => setComment(e.target.value)} rows={2} />
          <button className="cta" onClick={rate} disabled={busy}>{busy ? "..." : "إرسال التقييم"}</button>
        </div>
      ) : trip.is_customer ? (
        <div className="tripActions">
          {(trip.status === "accepted" || trip.status === "arrived") && (
            <button className="cancelTrip" onClick={cancel} disabled={busy}>إلغاء الرحلة</button>
          )}
        </div>
      ) : (
        <div className="tripActions">
          {trip.status === "accepted" && (
            <button className="cta" onClick={() => act("captain_arrived")} disabled={busy}>وصلت لنقطة العميل</button>
          )}
          {trip.status === "arrived" && (
            <button className="cta" onClick={() => act("captain_start_trip")} disabled={busy}>بدء الرحلة</button>
          )}
          {trip.status === "in_progress" && (
            <button className="cta" onClick={() => act("captain_complete_trip")} disabled={busy}>إنهاء الرحلة</button>
          )}
          {(trip.status === "accepted" || trip.status === "arrived") && (
            <button className="cancelTrip" onClick={cancel} disabled={busy}>إلغاء</button>
          )}
        </div>
      )}
    </section>
  );
}
