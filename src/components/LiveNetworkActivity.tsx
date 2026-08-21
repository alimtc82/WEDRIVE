import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./liveNetworkActivity.css";

type FeedTrip = {
  seq: number;
  captain_name: string;
  customer_name: string;
  pickup_name: string;
  dropoff_name: string;
  distance_km: number;
  price: number;
  progress: number;
  minutes_left: number;
};

type Feed = { active: boolean; active_count: number; trips: FeedTrip[] };

export default function LiveNetworkActivity() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("live_network_feed");
    if (!error && data) setFeed(data as Feed);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    const timer = window.setInterval(refresh, 5_000);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  if (!feed?.active || feed.active_count <= 0) return null;

  return (
    <aside className={`liveNet ${open ? "open" : ""}`} dir="rtl" aria-live="polite">
      <button className="liveNetHead" type="button" onClick={() => setOpen((v) => !v)}>
        <span><i /> الحركة الآن</span>
        <b>{feed.active_count} رحلة جارية</b>
        <em>{open ? "×" : "⌃"}</em>
      </button>
      {open && (
        <div className="liveNetBody">
          {feed.trips.map((t) => (
            <article className="liveNetTrip" key={t.seq}>
              <div className="liveNetNames">
                <b>{t.captain_name}</b>
                <span>مع {t.customer_name}</span>
                <strong>{Number(t.price).toFixed(0)} ج.م</strong>
              </div>
              <div className="liveNetRoute">
                <span className="fromDot" />
                <p>{t.pickup_name}</p>
                <span className="routeArrow">←</span>
                <span className="toDot" />
                <p>{t.dropoff_name}</p>
              </div>
              <div className="liveNetProgress"><i style={{ width: `${t.progress}%` }} /></div>
              <small>{Number(t.distance_km).toFixed(1)} كم · متبقي حوالي {t.minutes_left} دقيقة</small>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
