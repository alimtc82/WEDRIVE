import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

interface ActiveOffer {
  offer_id: string; trip_id: string; price: number;
  expires_at: string; status: string;
  pickup: string; dropoff: string; distance: number; trip_status: string;
}

export default function CaptainOffer({ onCleared }: { onCleared: () => void }) {
  const [offer, setOffer] = useState<ActiveOffer | null>(null);
  const [remain, setRemain] = useState(0);
  const [total, setTotal] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalRef = useRef(60);
  const prevOfferIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_active_offer");
    setOffer(data as ActiveOffer | null);
    if (!data) onCleared();
  }, [onCleared]);

  useEffect(() => {
    void load();
    const ch = supabase.channel("cap-offer")
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_offers" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => { void load(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });

    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const poll = window.setInterval(refresh, 8_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      void supabase.removeChannel(ch);
      window.clearInterval(poll);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => {
    if (!offer) return;
    const exp = new Date(offer.expires_at).getTime();

    if (prevOfferIdRef.current !== offer.offer_id) {
      prevOfferIdRef.current = offer.offer_id;
      const ttl = Math.max(1, Math.round((exp - Date.now()) / 1000));
      totalRef.current = ttl;
      setTotal(ttl);
    }

    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((exp - Date.now()) / 1000));
      setRemain(left);
      if (left <= 0) void load();
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [offer, load]);

  if (!offer) return null;

  const pct = Math.max(0, Math.min(100, (remain / total) * 100));

  return (
    <section className="panel offerWaitPanel">
      <div className="offerWaitHead">
        <h2>عرضك قيد الانتظار</h2>
        <span className="offerPrice">{Number(offer.price).toFixed(0)} ج.م</span>
      </div>
      <p className="offerWaitSub">في انتظار رد العميل على عرضك...</p>

      <div className="splashBar"><div className="splashFill" style={{ width: `${pct}%` }} /></div>
      <p className="splashTime">{remain} ثانية متبقية</p>

      <div className="tripRoute">
        <div className="rSeg"><i className="dotFrom" /><span>{offer.pickup}</span></div>
        <div className="rSeg"><i className="dotTo" /><span>{offer.dropoff}</span></div>
      </div>
      <div className="offerWaitNote">المسافة {offer.distance} كم · لو انتهى الوقت دون قبول، يمكنك تقديم عرض جديد</div>
    </section>
  );
}
