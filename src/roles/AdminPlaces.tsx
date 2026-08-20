import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* ===== Ø§Ù„Ø£Ù†ÙˆØ§Ø¹ ===== */
interface City { id: string; name: string; }
interface District { id: string; name: string; city_id: string; cities?: { name: string } | null; }
interface Place {
  id: string; name: string; lat: number; lng: number; district_id: string | null;
  parent_place_id: string | null;
  districts?: { name: string; cities?: { name: string } | null } | null;
  parent?: { name: string } | null;
}
interface RouteRow {
  id: string; name: string | null; price: number; reverse_price: number | null; notes: string | null;
  from_place_id: string; to_place_id: string;
  from_place?: { name: string } | null; to_place?: { name: string } | null;
}

type Relation<T> = T | T[] | null;
type RawDistrict = Omit<District, "cities"> & { cities?: Relation<{ name: string }> };
type RawPlace = Omit<Place, "districts" | "parent"> & {
  districts?: Relation<{ name: string; cities?: Relation<{ name: string }> }>;
  parent?: Relation<{ name: string }>;
};
type RawRoute = Omit<RouteRow, "from_place" | "to_place"> & {
  from_place?: Relation<{ name: string }>;
  to_place?: Relation<{ name: string }>;
};

function one<T>(relation: Relation<T> | undefined): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function normalizePlace(place: RawPlace): Place {
  const district = one(place.districts);
  return {
    ...place,
    districts: district ? { ...district, cities: one(district.cities) } : null,
    parent: one(place.parent),
  };
}

type Sub = "cities" | "districts" | "places" | "routes";
type View = "list" | "form";

const PER_PAGE = 20;

/* ===== Ø£Ø¯ÙˆØ§Øª CSV ===== */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  const clean = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = "";
    } else field += c;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = "\uFEFF" + rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

// ÙŠÙ‚Ø¨Ù„ Ø¥Ø­Ø¯Ø§Ø«ÙŠØ§Øª Ù…Ù„ØµÙˆÙ‚Ø© Ù…Ù† Ø®Ø±Ø§Ø¦Ø· Ø¬ÙˆØ¬Ù„ Ø¨Ø£ÙŠ ØµÙŠØºØ©:
// "30.4706813, 31.1844191" Ø£Ùˆ "(30.4706813, 31.1844191)" Ø£Ùˆ "@30.4706813,31.1844191"
function parseCoordsInput(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d+)\s*[,ØŒ]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* ØªÙ„ÙˆÙŠÙ† Ø§Ù„Ø¬Ø²Ø¡ Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚ Ù…Ù† Ø§Ù„Ù†Øµ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ø°ÙƒÙŠ */
function Hi({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.indexOf(q);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/* Ø´Ø±ÙŠØ· ØªØ±Ù‚ÙŠÙ… Ø§Ù„ØµÙØ­Ø§Øª */
function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (n: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="apPager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>Ø§Ù„Ø³Ø§Ø¨Ù‚</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button key={n} className={n === page ? "on" : ""} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Ø§Ù„ØªØ§Ù„ÙŠ</button>
    </div>
  );
}

/* ===== Ø­Ù‚Ù„ Ø¨Ø­Ø« Ø°ÙƒÙŠ Ø¨Ù…ÙƒØ§Ù† Ù…Ø­ÙÙˆØ¸ (Ù„Ù„Ù…Ø´Ø§ÙˆÙŠØ±) ===== */
function PlaceSearch({ label, value, onPick, excludeId }: {
  label: string;
  value: Place | null;
  onPick: (p: Place | null) => void;
  excludeId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const s = q.trim();
    if (value) { setOpts([]); return; }
    const t = setTimeout(async () => {
      let query = supabase.from("places").select("id,name,lat,lng,district_id,parent_place_id,districts(name,cities(name)),parent:places!parent_place_id(name)").order("name").limit(8);
      if (s) query = query.ilike("name", `%${s}%`);
      const { data } = await query;
      setOpts(((data as unknown as RawPlace[]) || []).map(normalizePlace).filter((p) => p.id !== excludeId));
    }, 200);
    return () => clearTimeout(t);
  }, [q, value, excludeId]);

  return (
    <div className="psField">
      <label>{label}</label>
      {value ? (
        <div className="psPicked">
          <span className="knownBadge">Ù…Ø­ÙÙˆØ¸</span>
          <b>{value.name}</b>
          <small>{value.parent?.name ? `${value.parent.name} â€” ` : ""}{value.districts?.name ? `${value.districts.name} â€” ` : ""}{value.districts?.cities?.name || ""}</small>
          <button type="button" className="psClear" onClick={() => { onPick(null); setQ(""); }}>âœ•</button>
        </div>
      ) : (
        <>
          <input
            value={q}
            placeholder="Ø§ÙƒØªØ¨ Ø§Ø³Ù… Ø§Ù„Ù…ÙƒØ§Ù† Ù„Ù„Ø¨Ø­Ø«..."
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          />
          {open && opts.length > 0 && (
            <ul className="psList">
              {opts.map((p) => (
                <li key={p.id} onClick={() => { onPick(p); setOpen(false); }}>
                  <Hi text={p.name} q={q.trim()} />
                  <small>{p.parent?.name ? ` â€” ${p.parent.name}` : ""}{p.districts?.name ? ` â€” ${p.districts.name}` : ""}{p.districts?.cities?.name ? ` â€” ${p.districts.cities.name}` : ""}</small>
                </li>
              ))}
            </ul>
          )}
          {open && q.trim() && opts.length === 0 && <p className="psEmpty">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£Ù…Ø§ÙƒÙ† Ù…Ø­ÙÙˆØ¸Ø© Ù…Ø·Ø§Ø¨Ù‚Ø© â€” Ø£Ø¶ÙÙÙ‡Ø§ Ù…Ù† ØªØ¨ÙˆÙŠØ¨ Â«Ø§Ù„Ø´ÙˆØ§Ø±Ø¹ ÙˆØ§Ù„Ø¹Ù„Ø§Ù…Ø§ØªÂ»</p>}
        </>
      )}
    </div>
  );
}

/* ===== Ø§Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© ===== */
export default function AdminPlaces() {
  const [sub, setSub] = useState<Sub>("cities");
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Ù…ÙØªØ§Ø­ Ø¥Ø¸Ù‡Ø§Ø± Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø´Ø§ÙˆÙŠØ± Ø§Ù„Ø«Ø§Ø¨ØªØ© Ù„Ù„Ø¹Ù…ÙŠÙ„
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [showFixedRoutes, setShowFixedRoutes] = useState(true);

  // Ù†Ù…Ø§Ø°Ø¬ Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„ â€” Ø§Ù„Ù…Ø¯Ù† ÙˆØ§Ù„Ø£Ø­ÙŠØ§Ø¡
  const [cityName, setCityName] = useState("");
  const [editCity, setEditCity] = useState<City | null>(null);
  const [distName, setDistName] = useState("");
  const [distCity, setDistCity] = useState("");
  const [editDist, setEditDist] = useState<District | null>(null);

  // Ø§Ù„Ø´ÙˆØ§Ø±Ø¹ ÙˆØ§Ù„Ø¹Ù„Ø§Ù…Ø§Øª: Ù‚Ø§Ø¦Ù…Ø©/Ù†Ù…ÙˆØ°Ø¬ + ÙÙ„Ø§ØªØ± ÙˆØªØ±Ù‚ÙŠÙ…
  const [placesView, setPlacesView] = useState<View>("list");
  const [placePage, setPlacePage] = useState(1);
  const [pCity, setPCity] = useState("");
  const [pDist, setPDist] = useState("");
  const [pParent, setPParent] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeDist, setPlaceDist] = useState("");
  const [placeParent, setPlaceParent] = useState("");
  const [placeCoords, setPlaceCoords] = useState("");
  const [editPlace, setEditPlace] = useState<Place | null>(null);

  // Ø§Ù„Ù…Ø´Ø§ÙˆÙŠØ±: Ù‚Ø§Ø¦Ù…Ø©/Ù†Ù…ÙˆØ°Ø¬ + ÙÙ„Ø§ØªØ± ÙˆØªØ±Ù‚ÙŠÙ…
  const [routesView, setRoutesView] = useState<View>("list");
  const [routePage, setRoutePage] = useState(1);
  const [fCity, setFCity] = useState("");
  const [fDist, setFDist] = useState("");
  const [fPlace, setFPlace] = useState("");
  const [routeName, setRouteName] = useState("");
  const [routeFrom, setRouteFrom] = useState<Place | null>(null);
  const [routeTo, setRouteTo] = useState<Place | null>(null);
  const [routePrice, setRoutePrice] = useState("");
  const [routeRev, setRouteRev] = useState("");
  const [routeNotes, setRouteNotes] = useState("");
  const [editRoute, setEditRoute] = useState<RouteRow | null>(null);

  const placesFileRef = useRef<HTMLInputElement>(null);
  const routesFileRef = useRef<HTMLInputElement>(null);

  const loadCities = useCallback(async () => {
    const { data } = await supabase.from("cities").select("*").order("name");
    setCities((data as City[]) || []);
  }, []);
  const loadDistricts = useCallback(async () => {
    const { data } = await supabase.from("districts").select("id,name,city_id,cities(name)").order("name");
    setDistricts(((data as unknown as RawDistrict[]) || []).map((district) => ({
      ...district,
      cities: one(district.cities),
    })));
  }, []);
  const loadPlaces = useCallback(async () => {
    const { data } = await supabase.from("places").select("id,name,lat,lng,district_id,parent_place_id,districts(name,cities(name)),parent:places!parent_place_id(name)").order("name");
    setPlaces(((data as unknown as RawPlace[]) || []).map(normalizePlace));
  }, []);
  const loadRoutes = useCallback(async () => {
    const { data } = await supabase.from("route_prices")
      .select("id,name,price,reverse_price,notes,from_place_id,to_place_id,from_place:places!from_place_id(name),to_place:places!to_place_id(name)")
      .order("created_at", { ascending: false });
    setRoutes(((data as unknown as RawRoute[]) || []).map((route) => ({
      ...route,
      from_place: one(route.from_place),
      to_place: one(route.to_place),
    })));
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadCities(), loadDistricts(), loadPlaces(), loadRoutes()]);
    const { data: s } = await supabase.from("settings").select("id,show_fixed_routes").single();
    if (s) { setSettingsId(s.id); setShowFixedRoutes(s.show_fixed_routes !== false); }
  }, [loadCities, loadDistricts, loadPlaces, loadRoutes]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const flash = (m: string) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 4000); };
  const fail = (m: string) => { setErr(m); setMsg(""); };

  // Ù…ÙØªØ§Ø­ Ø¥Ø¸Ù‡Ø§Ø±/Ø¥Ø®ÙØ§Ø¡ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø´Ø§ÙˆÙŠØ± Ø§Ù„Ø«Ø§Ø¨ØªØ© Ø¹Ù†Ø¯ Ø§Ù„Ø¹Ù…ÙŠÙ„
  const toggleFixedRoutes = async (on: boolean) => {
    setShowFixedRoutes(on);
    if (!settingsId) return;
    const { error } = await supabase.from("settings").update({ show_fixed_routes: on }).eq("id", settingsId);
    if (error) { fail("ØªØ¹Ø°Ù‘Ø± Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯: " + error.message); setShowFixedRoutes(!on); return; }
    flash(on ? "Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø´Ø§ÙˆÙŠØ± Ø§Ù„Ø«Ø§Ø¨ØªØ© Ø¸Ø§Ù‡Ø±Ø© Ø§Ù„Ø¢Ù† Ù„Ù„Ø¹Ù…ÙŠÙ„ âœ“" : "ØªÙ… Ø¥Ø®ÙØ§Ø¡ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø´Ø§ÙˆÙŠØ± Ø§Ù„Ø«Ø§Ø¨ØªØ© Ø¹Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„ âœ“");
  };

  /* ===== Ø§Ù„Ù…Ø¯Ù† ===== */
  const saveCity = async () => {
    const name = cityName.trim(); if (!name) return;
    setBusy(true);
    const { error } = editCity
      ? await supabase.from("cities").update({ name }).eq("id", editCity.id)
      : await supabase.from("cities").insert({ name });
    setBusy(false);
    if (error) { fail("ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø­ÙØ¸: " + error.message); return; }
    flash(editCity ? "ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ù…Ø¯ÙŠÙ†Ø© âœ“" : "ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ø¯ÙŠÙ†Ø© âœ“");
    setCityName(""); setEditCity(null); loadCities();
  };
  const delCity = async (c: City) => {
    if (!window.confirm(`Ø­Ø°Ù Ù…Ø¯ÙŠÙ†Ø© Â«${c.name}Â» Ø³ÙŠØ­Ø°Ù ÙƒÙ„ Ø£Ø­ÙŠØ§Ø¦Ù‡Ø§. Ù…ØªØ§Ø¨Ø¹Ø©ØŸ`)) return;
    const { error } = await supabase.from("cities").delete().eq("id", c.id);
    if (error) { fail("ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø­Ø°Ù: " + error.message); return; }
    flash("ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…Ø¯ÙŠÙ†Ø© âœ“"); loadAll();
  };

  /* ===== Ø§Ù„Ø£Ø­ÙŠØ§Ø¡ ===== */
  const saveDistrict = async () => {
    const name = distName.trim(); if (!name || !distCity) { fail("Ø§Ø®ØªØ± Ø§Ù„Ù…Ø¯ÙŠÙ†Ø© ÙˆØ§ÙƒØªØ¨ Ø§Ø³Ù… Ø§Ù„Ø­ÙŠ"); return; }
    setBusy(true);
    const { error } = editDist
      ? await supabase.from("districts").update({ name, city_id: distCity }).eq("id", editDist.id)
      : await supabase.from("districts").insert({ name, city_id: distCity });
    setBusy(false);
    if (error) { fail("ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø­ÙØ¸: " + error.message); return; }
    flash(editDist ? "ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø­ÙŠ âœ“" : "ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø­ÙŠ âœ“");
    setDistName(""); setEditDist(null); loadDistricts();
  };
  const delDistrict = async (d: District) => {
    if (!window.confirm(`Ø­Ø°Ù Ø­ÙŠ Â«${d.name}Â»ØŸ Ø§Ù„Ø´ÙˆØ§Ø±Ø¹ Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ù‡ Ø³ØªØ¨Ù‚Ù‰ Ø¨Ø¯ÙˆÙ† Ø­ÙŠ.`)) return;
    const { error } = await supabase.from("districts").delete().eq("id", d.id);
    if (error) { fail("ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø­Ø°Ù: " + error.message); return; }
    flash("ØªÙ… Ø­Ø°Ù Ø§Ù„Ø­ÙŠ âœ“"); loadDistricts(); loadPlaces();
  };

  /* ===== Ø§Ù„Ø´ÙˆØ§Ø±Ø¹ ÙˆØ§Ù„Ø¹Ù„Ø§Ù…Ø§Øª ===== */
  const resetPlaceForm = () => {
    setPlaceName(""); setPlaceCoords(""); setPlaceParent(""); setEditPlace(null);
  };
  const openNewPlace = () => { resetPlaceForm(); setPlacesView("form"); };
  const openEditPlace = (p: Place) => {
    setEditPlace(p); setPlaceName(p.name); setPlaceCoords(`${p.lat}, ${p.lng}`);
    setPlaceDist(p.district_id || ""); setPlaceParent(p.parent_place_id || "");
    setPlacesView("form");
  };
  const savePlace = async () => {
    const name = placeName.trim();
    const coords = parseCoordsInput(placeCoords);
    if (!name || !placeDist) { fail("Ø§ÙƒØªØ¨ Ø§Ù„Ø§Ø³Ù… ÙˆØ§Ø®ØªØ± Ø§Ù„Ø­ÙŠ"); return; }
    if (!coords) { fail("Ø£Ø¯Ø®Ù„ Ø§Ù„Ø¥Ø­Ø¯Ø§Ø«ÙŠØ§Øª Ø¨ØµÙŠØºØ© Ø®Ø±Ø§Ø¦Ø· Ø¬ÙˆØ¬Ù„ â€” Ù…Ø«Ø§Ù„: 30.4706813ß}y¶‰žËkºwµçb„ð½‰ÕÑÑ½¸ùô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á1¥ÍÐˆø4(€€€€€€€€€€€í¥Ñ¥•Ì¹µ…À ¡Œ¤€ôø€ 4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Üˆ­•äõíŒ¹¥‘ôø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Ý5…¥¸ˆø4(€€€€€€€€€€€€€€€€€€ñˆùíŒ¹¹…µ•ôð½ˆø4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰…Á5•Ñ„ˆùí‘¥ÍÑÉ¥ÑÌ¹™¥±Ñ•È ¡¤€ôø¹¥Ñå}¥€ôôôŒ¹¥¤¹±•¹Ñ¡ôƒb·f(ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½ÝÑ¥½¹Ìˆø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøìÍ•Ñ‘¥Ñ¥Ñä¡Œ¤ìÍ•Ñ¥Ñå9…µ”¡Œ¹¹…µ”¤ìõôûb«bçb¿f+fð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…Á•°ˆ½¹±¥¬õì ¤€ôø‘•±¥Ñä¡Œ¥ôûb·bÃfð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€í¥Ñ¥•Ì¹±•¹Ñ €ôôô€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰•µÁÑåMÑ…Ñ”ˆûfbœƒb«f#b³b¼ƒfb¿fƒb£bçb¼ð½Àùô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð¼ø4(€€€€€€¥ô4(4(€€€€€ì¼¨€ôôôôôƒbŸfbb·f+bŸb„€ôôôôô€¨½ô4(€€€€€íÍÕˆ€ôôô€‰‘¥ÍÑÉ¥ÑÌˆ€˜˜€ 4(€€€€€€€€ðø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á½É´ˆø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õí‘¥ÍÑ¥Ñåô½¹¡…¹”õì¡”¤€ôøÍ•Ñ¥ÍÑ¥Ñä¡”¹Ñ…É•Ð¹Ù…±Õ”¥ôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûbŸb»b«bÄƒbŸffb¿f+fb¤¸¸¸ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€í¥Ñ¥•Ì¹µ…À ¡Œ¤€ôø€ñ½ÁÑ¥½¸­•äõíŒ¹¥‘ôÙ…±Õ”õíŒ¹¥‘ôùíŒ¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õí‘¥ÍÑ9…µ•ôÁ±…•¡½±‘•Èô‹bŸbÏfƒbŸfb·f(ƒŠPƒfb¯bŸfèƒffbÄƒbŸfb³bËbŸbÄˆ½¹¡…¹”õì¡”¤€ôøÍ•Ñ¥ÍÑ9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…ÕÑ¡MÕ‰µ¥Ðˆ½¹±¥¬õíÍ…Ù•¥ÍÑÉ¥Ñô‘¥Í…‰±•õí‰ÕÍåôùí•‘¥Ñ¥ÍÐ€ü€‹b·fbàƒbŸfb«bçb¿f+fˆ€è€‹b—bÛbŸfb¤‰ôð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€í•‘¥Ñ¥ÍÐ€˜˜€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Ý¥é	…¬ˆ½¹±¥¬õì ¤€ôøìÍ•Ñ‘¥Ñ¥ÍÐ¡¹Õ±°¤ìÍ•Ñ¥ÍÑ9…µ” ˆˆ¤ìõôûb—fbëbŸb„ð½‰ÕÑÑ½¸ùô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á1¥ÍÐˆø4(€€€€€€€€€€€í‘¥ÍÑÉ¥ÑÌ¹µ…À ¡¤€ôø€ 4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Üˆ­•äõí¹¥‘ôø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Ý5…¥¸ˆø4(€€€€€€€€€€€€€€€€€€ñˆùí¹¹…µ•ôð½ˆø4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰…Á5•Ñ„ˆùí¹¥Ñ¥•Ìü¹¹…µ”ñð€ˆ‰ôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½ÝÑ¥½¹Ìˆø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøìÍ•Ñ‘¥Ñ¥ÍÐ¡¤ìÍ•Ñ¥ÍÑ9…µ”¡¹¹…µ”¤ìÍ•Ñ¥ÍÑ¥Ñä¡¹¥Ñå}¥¤ìõôûb«bçb¿f+fð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…Á•°ˆ½¹±¥¬õì ¤€ôø‘•±¥ÍÑÉ¥Ð¡¥ôûb·bÃfð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€í‘¥ÍÑÉ¥ÑÌ¹±•¹Ñ €ôôô€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰•µÁÑåMÑ…Ñ”ˆûfbœƒb«f#b³b¼ƒbb·f+bŸb„ƒb£bçb¼ƒŠPƒbbÛfCfƒfb¿f+fb¤ƒbf#ff/bœð½Àùô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð¼ø4(€€€€€€¥ô4(4(€€€€€ì¼¨€ôôôôôƒbŸfbÓf#bŸbÇbäƒf#bŸfbçfbŸfbŸb¨ƒŠPƒbÓbŸbÓb¤ƒbŸfb—b¿b»bŸf€ôôôôô€¨½ô4(€€€€€íÍÕˆ€ôôô€‰Á±…•Ìˆ€˜˜Á±…•ÍY¥•Ü€ôôô€‰™½É´ˆ€˜˜€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á½ÉµI½ÕÑ•Ìˆø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á½Éµ!•…ˆø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Ý¥é	…¬ˆ½¹±¥¬õì ¤€ôøìÉ•Í•ÑA±…•½É´ ¤ìÍ•ÑA±…•ÍY¥•Ü ‰±¥ÍÐˆ¤ìõôûŠHƒbÇb³f#bäƒffbŸb›fb¤ƒbŸfbfbŸffð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ Ìùí•‘¥ÑA±…”€ü€‹b«bçb¿f+fƒffbŸfˆ€è€‹b—bÛbŸfb¤ƒffbŸfƒb³b¿f+b¼‰ôð½ Ìø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€ñ±…‰•°ûbŸfb·f(ð½±…‰•°ø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õíÁ±…•¥ÍÑô½¹¡…¹”õì¡”¤€ôøÍ•ÑA±…•¥ÍÐ¡”¹Ñ…É•Ð¹Ù…±Õ”¥ôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûbŸb»b«bÄƒbŸfb·f(¸¸¸ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€í‘¥ÍÑÉ¥ÑÌ¹µ…À ¡¤€ôø€ñ½ÁÑ¥½¸­•äõí¹¥‘ôÙ…±Õ”õí¹¥‘ôùí¹¹…µ•ôƒŠPí¹¥Ñ¥•Ìü¹¹…µ”ñð€ˆ‰ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€ñ±…‰•°ûbŸbÏfƒbŸfbÓbŸbÇbäƒbf ƒbŸfbçfbŸfb¤ƒbf ƒbŸffb·fð½±…‰•°ø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õíÁ±…•9…µ•ôÁ±…•¡½±‘•Èô‹fb¯bŸfèƒfbÏb³b¼ƒbŸfff#bÄˆ½¹¡…¹”õì¡”¤€ôøÍ•ÑA±…•9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€ñ±…‰•°ûb«bŸb£bäƒfffbŸfb|€£bŸb»b«f+bŸbÇf(ƒŠPƒfb¯bŸfèƒbÓbŸbÇbä¤ð½±…‰•°ø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õíÁ±…•A…É•¹Ñô½¹¡…¹”õì¡”¤€ôøÍ•ÑA±…•A…É•¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¥ôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûb£b¿f#fƒŠPƒffbŸfƒbÇb›f+bÏf(ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€íÁ±…•Ì¹™¥±Ñ•È ¡À¤€ôøÀ¹¥€„ôô•‘¥ÑA±…”ü¹¥¤¹µ…À ¡À¤€ôø€ 4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸­•äõíÀ¹¥‘ôÙ…±Õ”õíÀ¹¥‘ôùíÀ¹¹…µ•õíÀ¹‘¥ÍÑÉ¥ÑÌü¹¹…µ”€ü€ƒŠP€‘íÀ¹‘¥ÍÑÉ¥ÑÌ¹¹…µ•õ€€è€ˆ‰ôð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€ñ±…‰•°ûbŸfb—b·b¿bŸb¯f+bŸb¨€£bŸfb×fƒffƒb»bÇbŸb›bÜƒb³f#b³f¤ð½±…‰•°ø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õíÁ±…•½½É‘ÍôÁ±…•¡½±‘•ÈôˆÌÀ¸ÐÜÀØàÄÌ°€ÌÄ¸ÄàÐÐÄäÄˆ4(€€€€€€€€€€€€€ÍÑå±”õíì‘¥É•Ñ¥½¸è€‰±ÑÈˆ°Ñ•áÑ±¥¸è€‰±•™Ðˆõô4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÍ•ÑA±…•½½É‘Ì¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…ÕÑ¡MÕ‰µ¥Ðˆ½¹±¥¬õíÍ…Ù•A±…•ô‘¥Í…‰±•õí‰ÕÍåôùí•‘¥ÑA±…”€ü€‹b·fbàƒbŸfb«bçb¿f+fˆ€è€‹b·fbàƒbŸfffbŸf‰ôð½‰ÕÑÑ½¸ø4(€€€€€€€€ð½‘¥Øø4(€€€€€€¥ô4(4(€€€€€ì¼¨€ôôôôôƒbŸfbÓf#bŸbÇbäƒf#bŸfbçfbŸfbŸb¨ƒŠPƒbÓbŸbÓb¤ƒbŸffbŸb›fb¤€ôôôôô€¨½ô4(€€€€€íÍÕˆ€ôôô€‰Á±…•Ìˆ€˜˜Á±…•ÍY¥•Ü€ôôô€‰±¥ÍÐˆ€˜˜€ 4(€€€€€€€€ðø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁQ½½±Ìˆø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…ÕÑ¡MÕ‰µ¥Ðˆ½¹±¥¬õí½Á•¹9•ÝA±…•ôû¾ò,ƒb—bÛbŸfb¤ƒffbŸfƒb³b¿f+b¼ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰½™™•ÉA±ÕÌˆ½¹±¥¬õì ¤€ôø‘½Ý¹±½…‘ÍØ ‹fbŸfb ·bŸfbŸfbŸff¹ÍØˆ°l4(€€€€€€€€€€€€€l‹bŸffb¿f+fb¤ˆ°€‹bŸfb·f(ˆ°€‹bŸbÏfƒbŸfffbŸfˆ°€‹b»bÜƒbŸfbçbÇbØ±…Ðˆ°€‹b»bÜƒbŸfbßf#f±¹œˆ°€‹b«bŸb£bäƒfffbŸf€£bŸb»b«f+bŸbÇf(¤‰t°4(€€€€€€€€€€€€€l‹b£ffbœˆ°€‹bŸffffˆ°€‹bŸffffƒbÓbŸbÇbä€Ôˆ°€ˆÌÀ¸ÐÔäÜˆ°€ˆÌÄ¸ÄààØˆ°€ˆ‰t°4(€€€€€€€€€€€€€l‹b£ffbœˆ°€‹bŸffffˆ°€‹fbÏb³b¼ƒbŸfff#bÄˆ°€ˆÌÀ¸ÐØÀÀˆ°€ˆÌÄ¸ÄàäÀˆ°€‹bŸffffƒbÓbŸbÇbä€Ô‰t°4(€€€€€€€€€€€€€l‹b£ffbœˆ°€‹bŸffffˆ°€‹b×f+b¿ff+b¤ƒbŸfbÓfbŸb„ˆ°€ˆÌÀ¸ÐØÀÈˆ°€ˆÌÄ¸ÄàäÈˆ°€‹bŸffffƒbÓbŸbÇbä€Ô‰t°4(€€€€€€€€€€€t¥ôûŠ²ƒb«b·ff+fƒfbŸfb MXð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰½™™•É5…¥¸ˆ½¹±¥¬õì ¤€ôøÁ±…•Í¥±•I•˜¹ÕÉÉ•¹Ðü¹±¥¬ ¥ô‘¥Í…‰±•õí‰ÕÍåôø4(€€€€€€€€€€€€€í‰ÕÍä€ü€‹b³bŸbÇf4ƒbŸfbŸbÏb«f+bÇbŸb¼¸¸¸ˆ€è€‹Š²ƒbŸbÏb«f+bÇbŸb¼ƒbŸfbfbŸffƒffMX‰ô4(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÉ•˜õíÁ±…•Í¥±•I•™ôÑåÁ”ô‰™¥±”ˆ…•ÁÐôˆ¹ÍØˆ¡¥‘‘•¸4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøì½¹ÍÐ˜€ô”¹Ñ…É•Ð¹™¥±•Ìü¹lÁtì¥˜€¡˜¤¥µÁ½ÉÑA±…•ÍÍØ¡˜¤ì”¹Ñ…É•Ð¹Ù…±Õ”€ô€ˆˆìõô€¼ø4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€ì¼¨ƒffbŸb«bÄƒbŸfb«b×ff+b¤€¨½ô4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á¥±Ñ•ÉÌˆø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õíÁ¥Ñåô½¹¡…¹”õì¡”¤€ôøìÍ•ÑA¥Ñä¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÍ•ÑA¥ÍÐ ˆˆ¤ìÍ•ÑAA…É•¹Ð ˆˆ¤ìÍ•ÑA±…•A…” Ä¤ìõôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûffƒbŸffb¿fð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€í¥Ñ¥•Ì¹µ…À ¡Œ¤€ôø€ñ½ÁÑ¥½¸­•äõíŒ¹¥‘ôÙ…±Õ”õíŒ¹¥‘ôùíŒ¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õíÁ¥ÍÑô½¹¡…¹”õì¡”¤€ôøìÍ•ÑA¥ÍÐ¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÍ•ÑAA…É•¹Ð ˆˆ¤ìÍ•ÑA±…•A…” Ä¤ìõôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûffƒbŸfbb·f+bŸb„ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€íÁ±…•¥±Ñ•É¥ÍÑÉ¥ÑÌ¹µ…À ¡¤€ôø€ñ½ÁÑ¥½¸­•äõí¹¥‘ôÙ…±Õ”õí¹¥‘ôùí¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õíÁA…É•¹Ñô½¹¡…¹”õì¡”¤€ôøìÍ•ÑAA…É•¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÍ•ÑA±…•A…” Ä¤ìõôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûbŸfb«bŸb£bçb¤ƒfffbŸf¸¸¸ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€íÁ…É•¹Ñ¥±Ñ•ÉA±…•Ì¹µ…À ¡À¤€ôø€ñ½ÁÑ¥½¸­•äõíÀ¹¥‘ôÙ…±Õ”õíÀ¹¥‘ôùíÀ¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€ì¡Á¥ÑäñðÁ¥ÍÐñðÁA…É•¹Ð¤€˜˜€ 4(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Ý¥é	…¬ˆ½¹±¥¬õì ¤€ôøìÍ•ÑA¥Ñä ˆˆ¤ìÍ•ÑA¥ÍÐ ˆˆ¤ìÍ•ÑAA…É•¹Ð ˆˆ¤ìÍ•ÑA±…•A…” Ä¤ìõôûfbÏb´ƒbŸfffbŸb«bÄð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€¥ô4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á1¥ÍÐˆø4(€€€€€€€€€€€íÁ…•‘A±…•Ì¹µ…À ¡À¤€ôø€ 4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Üˆ­•äõíÀ¹¥‘ôø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Ý5…¥¸ˆø4(€€€€€€€€€€€€€€€€€€ñˆùíÀ¹¹…µ•ôð½ˆø4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰…Á5•Ñ„ˆø4(€€€€€€€€€€€€€€€€€€€íÀ¹Á…É•¹Ðü¹¹…µ”€üƒb«bŸb£bäƒff €‘íÀ¹Á…É•¹Ð¹¹…µ•ôƒŠP€€è€ˆ‰ô4(€€€€€€€€€€€€€€€€€€€íÀ¹‘¥ÍÑÉ¥ÑÌü¹¹…µ”€ü€‘íÀ¹‘¥ÍÑÉ¥ÑÌ¹¹…µ•ôƒŠP€€è€ˆ‰õíÀ¹‘¥ÍÑÉ¥ÑÌü¹¥Ñ¥•Ìü¹¹…µ”ñð€‹b£b¿f#fƒb·f(‰ô4(€€€€€€€€€€€€€€€€€€€íÁ±…•Ì¹™¥±Ñ•È ¡Ì¤€ôøÌ¹Á…É•¹Ñ}Á±…•}¥€ôôôÀ¹¥¤¹±•¹Ñ €ø€À€˜˜€ƒ
Ü€‘íÁ±…•Ì¹™¥±Ñ•È ¡Ì¤€ôøÌ¹Á…É•¹Ñ}Á±…•}¥€ôôôÀ¹¥¤¹±•¹Ñ¡ôƒffbŸfƒb«bŸb£båô4(€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½ÝÑ¥½¹Ìˆø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôø½Á•¹‘¥ÑA±…”¡À¥ôûb«bçb¿f+fð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…Á•°ˆ½¹±¥¬õì ¤€ôø‘•±A±…”¡À¥ôûb·bÃfð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€íÁ…•‘A±…•Ì¹±•¹Ñ €ôôô€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰•µÁÑåMÑ…Ñ”ˆûfbœƒb«f#b³b¼ƒbfbŸffƒfbßbŸb£fb¤ƒŠPƒbbÛfCfƒffbŸff/bœƒb³b¿f+b¿f/bœð½Àùô4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€ñA…•ÈÁ…”õíÁ±…•AôÑ½Ñ…±A…•ÌõíÁ±…•ÍA…•Íô½¹A…”õíÍ•ÑA±…•A…•ô€¼ø4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰…Á½Õ¹Ðˆûb—b³fbŸff(ƒbŸfbfbŸffèí™¥±Ñ•É•‘A±…•Ì¹±•¹Ñ¡õí™¥±Ñ•É•‘A±…•Ì¹±•¹Ñ €„ôôÁ±…•Ì¹±•¹Ñ €ü€€£ffƒbb×f€‘íÁ±…•Ì¹±•¹Ñ¡ô¥€€è€ˆ‰ôð½Àø4(€€€€€€€€ð¼ø4(€€€€€€¥ô4(4(€€€€€ì¼¨€ôôôôôƒbŸffbÓbŸf#f+bÄƒŠPƒbÓbŸbÓb¤ƒbŸfb—b¿b»bŸf€ôôôôô€¨½ô4(€€€€€íÍÕˆ€ôôô€‰É½ÕÑ•Ìˆ€˜˜É½ÕÑ•ÍY¥•Ü€ôôô€‰™½É´ˆ€˜˜€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á½ÉµI½ÕÑ•Ìˆø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á½Éµ!•…ˆø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Ý¥é	…¬ˆ½¹±¥¬õì ¤€ôøìÉ•Í•ÑI½ÕÑ•½É´ ¤ìÍ•ÑI½ÕÑ•ÍY¥•Ü ‰±¥ÍÐˆ¤ìõôûŠHƒbÇb³f#bäƒffbŸb›fb¤ƒbŸffbÓbŸf#f+bÄð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ Ìùí•‘¥ÑI½ÕÑ”€ü€‹b«bçb¿f+fƒfbÓf#bŸbÄˆ€è€‹b—bÛbŸfb¤ƒfbÓf#bŸbÄƒb³b¿f+b¼‰ôð½ Ìø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€ñ±…‰•°ûbŸbÏfƒbŸffbÓf#bŸbÄ€£bŸb»b«f+bŸbÇf(¤ð½±…‰•°ø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õíÉ½ÕÑ•9…µ•ôÁ±…•¡½±‘•Èô‹fb¯bŸfèƒfbÓf#bŸbÄƒbŸfb³bŸfbçb¤ˆ½¹¡…¹”õì¡”¤€ôøÍ•ÑI½ÕÑ•9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñA±…•M•…É ±…‰•°ô‹ffˆÙ…±Õ”õíÉ½ÕÑ•É½µô½¹A¥¬õíÍ•ÑI½ÕÑ•É½µô•á±Õ‘•%õíÉ½ÕÑ•Q¼ü¹¥‘ô€¼ø4(€€€€€€€€€€ñA±…•M•…É ±…‰•°ô‹b—ff$ˆÙ…±Õ”õíÉ½ÕÑ•Q½ô½¹A¥¬õíÍ•ÑI½ÕÑ•Q½ô•á±Õ‘•%õíÉ½ÕÑ•É½´ü¹¥‘ô€¼ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½ÜÈˆø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€€€ñ±…‰•°ûbŸfbÏbçbÄ€£b°»f¤ð½±…‰•°ø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õíÉ½ÕÑ•AÉ¥•ô¥¹ÁÕÑ5½‘”ô‰‘•¥µ…°ˆÁ±…•¡½±‘•Èô‹fb¯bŸfè€ÄÔˆ½¹¡…¹”õì¡”¤€ôøÍ•ÑI½ÕÑ•AÉ¥”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€€€ñ±…‰•°ûbÏbçbÄƒbŸfbçf#b¿b¤€£bŸb»b«f+bŸbÇf(ƒŠPƒfbŸbÇbè€ôƒffbÌƒbŸfbÏbçbÄ¤ð½±…‰•°ø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õíÉ½ÕÑ•I•Ùô¥¹ÁÕÑ5½‘”ô‰‘•¥µ…°ˆÁ±…•¡½±‘•Èô‹fb¯bŸfè€ÈÀˆ½¹¡…¹”õì¡”¤€ôøÍ•ÑI½ÕÑ•I•Ø¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±ˆø4(€€€€€€€€€€€€ñ±…‰•°ûffbŸb·bãbŸb¨€£bŸb»b«f+bŸbÇf(¤ð½±…‰•°ø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õíÉ½ÕÑ•9½Ñ•ÍôÁ±…•¡½±‘•Èô‹bf(ƒffbŸb·bãbŸb¨ƒbçfƒfbÃbœƒbŸffbÓf#bŸbÄˆ½¹¡…¹”õì¡”¤€ôøÍ•ÑI½ÕÑ•9½Ñ•Ì¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…ÕÑ¡MÕ‰µ¥Ðˆ½¹±¥¬õíÍ…Ù•I½ÕÑ•ô‘¥Í…‰±•õí‰ÕÍåôùí•‘¥ÑI½ÕÑ”€ü€‹b·fbàƒbŸfb«bçb¿f+fˆ€è€‹b·fbàƒbŸffbÓf#bŸbÄ‰ôð½‰ÕÑÑ½¸ø4(€€€€€€€€ð½‘¥Øø4(€€€€€€¥ô4(4(€€€€€ì¼¨€ôôôôôƒbŸffbÓbŸf#f+bÄƒŠPƒbÓbŸbÓb¤ƒbŸffbŸb›fb¤€ôôôôô€¨½ô4(€€€€€íÍÕˆ€ôôô€‰É½ÕÑ•Ìˆ€˜˜É½ÕÑ•ÍY¥•Ü€ôôô€‰±¥ÍÐˆ€˜˜€ 4(€€€€€€€€ðø4(€€€€€€€€€ì¼¨ƒffb«bŸb´ƒb—bãfbŸbÄ¿b—b»fbŸb„ƒbŸffbŸb›fb¤ƒbçfb¼ƒbŸfbçff+f€¨½ô4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁQ½±”ˆø4(€€€€€€€€€€€€ñ‘¥Øø4(€€€€€€€€€€€€€€ñˆûb—bãfbŸbÄƒfbŸb›fb¤ƒ
¯fbÓbŸf#f+bÄƒb£bbÏbçbŸbÄƒb¯bŸb£b«b§
ìƒff(ƒbÓbŸbÓb¤ƒbŸfbçff+fð½ˆø4(€€€€€€€€€€€€€€ñÍµ…±°ûbçfb¼ƒbŸfb—b»fbŸb„ƒf+b£ff$ƒbŸfbÏbçbÄƒbŸfb¯bŸb£b¨ƒfbßb£ff/bœƒb«ffbŸb›f+f/bŸb0ƒfffƒbŸffbŸb›fb¤ƒbŸfb³bŸfbËb¤ƒfbœƒb«bãfbÄð½Íµ…±°ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰ÍÝ¥Ñ ˆø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ¡•­•õíÍ¡½Ý¥á•‘I½ÕÑ•Íô½¹¡…¹”õì¡”¤€ôøÑ½±•¥á•‘I½ÕÑ•Ì¡”¹Ñ…É•Ð¹¡•­•¥ô€¼ø4(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰ÑÉ…¬ˆ€¼ø4(€€€€€€€€€€€€ð½±…‰•°ø4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁQ½½±Ìˆø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…ÕÑ¡MÕ‰µ¥Ðˆ½¹±¥¬õí½Á•¹9•ÝI½ÕÑ•ôû¾ò,ƒb—bÛbŸfb¤ƒfbÓf#bŸbÄƒb³b¿f+b¼ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰½™™•ÉA±ÕÌˆ½¹±¥¬õì ¤€ôø‘½Ý¹±½…‘ÍØ ‹fbŸfb ·bŸffbÓbŸf#f+bÄ¹ÍØˆ°l4(€€€€€€€€€€€€€l‹ffˆ°€‹b—ff$ˆ°€‹bŸfbÏbçbÄˆ°€‹bÏbçbÄƒbŸfbçf#b¿b¤€£bŸb»b«f+bŸbÇf(¤ˆ°€‹ffbŸb·bãbŸb¨‰t°4(€€€€€€€€€€€€€l‹fb·bßb¤ƒfbßbŸbÄƒb£ffbœˆ°€‹b³bŸfbçb¤ƒb£ffbœˆ°€ˆÄÔˆ°€ˆˆ°€‹bbÏbçbŸbÄƒb¯bŸb£b«b¤‰t°4(€€€€€€€€€€€t¥ôûŠ²ƒb«b·ff+fƒfbŸfb MXð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰½™™•É5…¥¸ˆ½¹±¥¬õì ¤€ôøÉ½ÕÑ•Í¥±•I•˜¹ÕÉÉ•¹Ðü¹±¥¬ ¥ô‘¥Í…‰±•õí‰ÕÍåôø4(€€€€€€€€€€€€€í‰ÕÍä€ü€‹b³bŸbÇf4ƒbŸfbŸbÏb«f+bÇbŸb¼¸¸¸ˆ€è€‹Š²ƒbŸbÏb«f+bÇbŸb¼ƒbŸffbÓbŸf#f+bÄƒffMX‰ô4(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÉ•˜õíÉ½ÕÑ•Í¥±•I•™ôÑåÁ”ô‰™¥±”ˆ…•ÁÐôˆ¹ÍØˆ¡¥‘‘•¸4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøì½¹ÍÐ˜€ô”¹Ñ…É•Ð¹™¥±•Ìü¹lÁtì¥˜€¡˜¤¥µÁ½ÉÑI½ÕÑ•ÍÍØ¡˜¤ì”¹Ñ…É•Ð¹Ù…±Õ”€ô€ˆˆìõô€¼ø4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€ì¼¨ƒffbŸb«bÄƒbŸfb«b×ff+b¤€¨½ô4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á¥±Ñ•ÉÌˆø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õí™¥Ñåô½¹¡…¹”õì¡”¤€ôøìÍ•Ñ¥Ñä¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÍ•Ñ¥ÍÐ ˆˆ¤ìÍ•ÑA±…” ˆˆ¤ìÍ•ÑI½ÕÑ•A…” Ä¤ìõôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûffƒbŸffb¿fð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€í¥Ñ¥•Ì¹µ…À ¡Œ¤€ôø€ñ½ÁÑ¥½¸­•äõíŒ¹¥‘ôÙ…±Õ”õíŒ¹¥‘ôùíŒ¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õí™¥ÍÑô½¹¡…¹”õì¡”¤€ôøìÍ•Ñ¥ÍÐ¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÍ•ÑA±…” ˆˆ¤ìÍ•ÑI½ÕÑ•A…” Ä¤ìõôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûffƒbŸfbb·f+bŸb„ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€í™¥±Ñ•É¥ÍÑÉ¥ÑÌ¹µ…À ¡¤€ôø€ñ½ÁÑ¥½¸­•äõí¹¥‘ôÙ…±Õ”õí¹¥‘ôùí¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õí™A±…•ô½¹¡…¹”õì¡”¤€ôøìÍ•ÑA±…”¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÍ•ÑI½ÕÑ•A…” Ä¤ìõôø4(€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆˆûffƒbŸfbçfbŸfbŸb¨ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€í™¥±Ñ•ÉA±…•Ì¹µ…À ¡À¤€ôø€ñ½ÁÑ¥½¸­•äõíÀ¹¥‘ôÙ…±Õ”õíÀ¹¥‘ôùíÀ¹¹…µ•ôð½½ÁÑ¥½¸ø¥ô4(€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€ì¡™¥Ñäñð™¥ÍÐñð™A±…”¤€˜˜€ 4(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Ý¥é	…¬ˆ½¹±¥¬õì ¤€ôøìÍ•Ñ¥Ñä ˆˆ¤ìÍ•Ñ¥ÍÐ ˆˆ¤ìÍ•ÑA±…” ˆˆ¤ìÍ•ÑI½ÕÑ•A…” Ä¤ìõôûfbÏb´ƒbŸfffbŸb«bÄð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€¥ô4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…Á1¥ÍÐˆø4(€€€€€€€€€€€íÁ…•‘I½ÕÑ•Ì¹µ…À ¡È¤€ôø€ 4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Üˆ­•äõíÈ¹¥‘ôø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½Ý5…¥¸ˆø4(€€€€€€€€€€€€€€€€€€ñˆùíÈ¹¹…µ”ñð€‘íÈ¹™É½µ}Á±…”ü¹¹…µ”ñð€‹b|‰ôƒŠ@€‘íÈ¹Ñ½}Á±…”ü¹¹…µ”ñð€‹b|‰õôð½ˆø4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰…Á5•Ñ„ˆø4(€€€€€€€€€€€€€€€€€€€íÈ¹™É½µ}Á±…”ü¹¹…µ•ôƒŠ@íÈ¹Ñ½}Á±…”ü¹¹…µ•ôƒ
Üí9Õµ‰•È¡È¹ÁÉ¥”¤¹Ñ½¥á• À¥ôƒb°4(€€€€€€€€€€€€€€€€€€€íÈ¹É•Ù•ÉÍ•}ÁÉ¥”€ü€€£bçf#b¿b¤€‘í9Õµ‰•È¡È¹É•Ù•ÉÍ•}ÁÉ¥”¤¹Ñ½¥á• À¥ôƒb°¥€€è€ˆ‰ô4(€€€€€€€€€€€€€€€€€€€íÈ¹¹½Ñ•Ì€ü€ƒŠP€‘íÈ¹¹½Ñ•Íõ€€è€ˆ‰ô4(€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁI½ÝÑ¥½¹Ìˆø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôø½Á•¹‘¥ÑI½ÕÑ”¡È¥ôûb«bçb¿f+fð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…Á•°ˆ½¹±¥¬õì ¤€ôø‘•±I½ÕÑ”¡È¥ôûb·bÃfð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€íÁ…•‘I½ÕÑ•Ì¹±•¹Ñ €ôôô€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰•µÁÑåMÑ…Ñ”ˆûfbœƒb«f#b³b¼ƒfbÓbŸf#f+bÄƒfbßbŸb£fb¤ƒŠPƒbbÛfCfƒfbÓf#bŸbÇf/bœƒb³b¿f+b¿f/bœð½Àùô4(€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€ñA…•ÈÁ…”õíÉ½ÕÑ•AôÑ½Ñ…±A…•ÌõíÉ½ÕÑ•ÍA…•Íô½¹A…”õíÍ•ÑI½ÕÑ•A…•ô€¼ø4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰…Á½Õ¹Ðˆûb—b³fbŸff(ƒbŸffbÓbŸf#f+bÄèí™¥±Ñ•É•‘I½ÕÑ•Ì¹±•¹Ñ¡õí™¥±Ñ•É•‘I½ÕÑ•Ì¹±•¹Ñ €„ôôÉ½ÕÑ•Ì¹±•¹Ñ €ü€€£ffƒbb×f€‘íÉ½ÕÑ•Ì¹±•¹Ñ¡ô¥€€è€ˆ‰ôð½Àø4(€€€€€€€€ð¼ø4(€€€€€€¥ô4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4(