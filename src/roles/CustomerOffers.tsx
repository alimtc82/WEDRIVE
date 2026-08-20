import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

interface Offer {
  offer_id: string; captain_id: string; price: number; expires_at: string;
  captain_name: string; captain_rating: number; captain_trips: number;
  vehicle_type: string | null; vehicle_plate: string | null;
}

export default function CustomerOffers({ tripId, onAccepted, onCancel }: {
  tripId: string; onAccepted: () => void; onCancel: () => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("offers_for_my_trip", { p_trip_id: tripId });
    setOffers((data as Offer[]) || []);
  }, [tripId]);

  useEffect(() => {
    load();
    const ch = supabase.channel("cust-offers")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trip_offers", filter: `trip_id=eq.${tripId}`,
      }, () => load())
      .subscribe();
    const iv = setInterval(load, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [load]);

  const accept = async (offerId: string) => {
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("accept_offer", { p_offer_id: offerId });
    setBusy(false);
    if (error) { setMsg(error.message || "تعذّر قبول العرض"); load(); return; }
    onAccepted();
  };

  const cancel = async () => {
    if (!window.confirm("إلغاء طلب الرحلة؟")) return;
    await supabase.rpc("cancel_trip", { p_trip_id: tripId, p_reason: null });
    onCancel();
  };

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>عروض الكباتن</h2>
        <p>{offers.length > 0 ? "اختر العرض المناسب لك" : "جارٍ استقبال عروض الكباتن القريبين..."}</p>
      </div>

      {offers.length === 0 && (
        <div className="waitOffers">
          <div className="spinner" />
          <p>في انتظار عروض الكباتن — قد يستغرق لحظات</p>
        </div>
      )}

      {msg && <p className="authError">{msg}</p>}

      <div className="offersList">
        {offers.map((o) => (
          <div className="offerCard" key={o.offer_id}>
            <div className="offerCapInfo">
              <div className="tripAvatar">{(o.captain_name || "؟").charAt(0)}</div>
              <div>
                <b>{o.captain_name}</b>
                <span className="offerCapMeta">★ {Number(o.captain_rating).toFixed(1)} · {o.captain_trips} رحلة</span>
                {o.vehicle_type && <span className="offerCapVeh">{o.vehicle_type} · {o.vehicle_plate}</span>}
              </div>
            </div>
            <div className="offerCardPrice">
              <b>{Number(o.price).toFixed(0)}</b><span>ج.م</span>
            </div>
            <button className="offerAccept" onClick={() => accept(o.offer_id)} disabled={busy}>اختيار</button>
          </div>
        ))}
      </div>

      <button className="cancelTrip" onClick={cancel} disabled={busy}>إلغاء الطلب</button>
    </section>
  );
}
