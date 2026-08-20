import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* ===== الأنواع ===== */
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

type Sub = "cities" | "districts" | "places" | "routes";
type RoutesView = "list" | "form";

const ROUTES_PER_PAGE = 20;

/* ===== أدوات CSV ===== */
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

// يقبل إحداثيات ملصوقة من خرائط جوجل بأي صيغة:
// "30.4706813, 31.1844191" أو "(30.4706813, 31.1844191)" أو "@30.4706813,31.1844191"
function parseCoordsInput(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d+)\s*[,،]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* تلوين الجزء المطابق من النص أثناء البحث الذكي */
function Hi({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.indexOf(q);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/* ===== حقل بحث ذكي بمكان محفوظ (للمشاوير) ===== */
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
      setOpts(((data as Place[]) || []).filter((p) => p.id !== excludeId));
    }, 200);
    return () => clearTimeout(t);
  }, [q, value, excludeId]);

  return (
    <div className="psField">
      <label>{label}</label>
      {value ? (
        <div className="psPicked">
          <span className="knownBadge">محفوظ</span>
          <b>{value.name}</b>
          <small>{value.parent?.name ? `${value.parent.name} — ` : ""}{value.districts?.name ? `${value.districts.name} — ` : ""}{value.districts?.cities?.name || ""}</small>
          <button type="button" className="psClear" onClick={() => { onPick(null); setQ(""); }}>✕</button>
        </div>
      ) : (
        <>
          <input
            value={q}
            placeholder="اكتب اسم المكان للبحث..."
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          />
          {open && opts.length > 0 && (
            <ul className="psList">
              {opts.map((p) => (
                <li key={p.id} onClick={() => { onPick(p); setOpen(false); }}>
                  <Hi text={p.name} q={q.trim()} />
                  <small>{p.parent?.name ? ` — ${p.parent.name}` : ""}{p.districts?.name ? ` — ${p.districts.name}` : ""}{p.districts?.cities?.name ? ` — ${p.districts.cities.name}` : ""}</small>
                </li>
              ))}
            </ul>
          )}
          {open && q.trim() && opts.length === 0 && <p className="psEmpty">لا توجد أماكن محفوظة مطابقة — أضِفها من تبويب «الشوارع والعلامات»</p>}
        </>
      )}
    </div>
  );
}

/* ===== الشاشة الرئيسية ===== */
export default function AdminPlaces() {
  const [sub, setSub] = useState<Sub>("cities");
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // نماذج الإدخال
  const [cityName, setCityName] = useState("");
  const [editCity, setEditCity] = useState<City | null>(null);
  const [distName, setDistName] = useState("");
  const [distCity, setDistCity] = useState("");
  const [editDist, setEditDist] = useState<District | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [placeDist, setPlaceDist] = useState("");
  const [placeParent, setPlaceParent] = useState("");
  const [placeCoords, setPlaceCoords] = useState("");
  const [editPlace, setEditPlace] = useState<Place | null>(null);

  // المشاوير: عرض القائمة أو شاشة الإدخال + الفلاتر والترقيم
  const [routesView, setRoutesView] = useState<RoutesView>("list");
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
    setDistricts((data as District[]) || []);
  }, []);
  const loadPlaces = useCallback(async () => {
    const { data } = await supabase.from("places").select("id,name,lat,lng,district_id,parent_place_id,districts(name,cities(name)),parent:places!parent_place_id(name)").order("name");
    setPlaces((data as Place[]) || []);
  }, []);
  const loadRoutes = useCallback(async () => {
    const { data } = await supabase.from("route_prices")
      .select("id,name,price,reverse_price,notes,from_place_id,to_place_id,from_place:places!from_place_id(name),to_place:places!to_place_id(name)")
      .order("created_at", { ascending: false });
    setRoutes((data as RouteRow[]) || []);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadCities(), loadDistricts(), loadPlaces(), loadRoutes()]);
  }, [loadCities, loadDistricts, loadPlaces, loadRoutes]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const flash = (m: string) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 4000); };
  const fail = (m: string) => { setErr(m); setMsg(""); };

  /* ===== المدن ===== */
  const saveCity = async () => {
    const name = cityName.trim(); if (!name) return;
    setBusy(true);
    const { error } = editCity
      ? await supabase.from("cities").update({ name }).eq("id", editCity.id)
      : await supabase.from("cities").insert({ name });
    setBusy(false);
    if (error) { fail("تعذّر الحفظ: " + error.message); return; }
    flash(editCity ? "تم تعديل المدينة ✓" : "تمت إضافة المدينة ✓");
    setCityName(""); setEditCity(null); loadCities();
  };
  const delCity = async (c: City) => {
    if (!window.confirm(`حذف مدينة «${c.name}» سيحذف كل أحيائها. متابعة؟`)) return;
    const { error } = await supabase.from("cities").delete().eq("id", c.id);
    if (error) { fail("تعذّر الحذف: " + error.message); return; }
    flash("تم حذف المدينة ✓"); loadAll();
  };

  /* ===== الأحياء ===== */
  const saveDistrict = async () => {
    const name = distName.trim(); if (!name || !distCity) { fail("اختر المدينة واكتب اسم الحي"); return; }
    setBusy(true);
    const { error } = editDist
      ? await supabase.from("districts").update({ name, city_id: distCity }).eq("id", editDist.id)
      : await supabase.from("districts").insert({ name, city_id: distCity });
    setBusy(false);
    if (error) { fail("تعذّر الحفظ: " + error.message); return; }
    flash(editDist ? "تم تعديل الحي ✓" : "تمت إضافة الحي ✓");
    setDistName(""); setEditDist(null); loadDistricts();
  };
  const delDistrict = async (d: District) => {
    if (!window.confirm(`حذف حي «${d.name}»؟ الشوارع المرتبطة به ستبقى بدون حي.`)) return;
    const { error } = await supabase.from("districts").delete().eq("id", d.id);
    if (error) { fail("تعذّر الحذف: " + error.message); return; }
    flash("تم حذف الحي ✓"); loadDistricts(); loadPlaces();
  };

  /* ===== الشوارع والعلامات ===== */
  const savePlace = async () => {
    const name = placeName.trim();
    const coords = parseCoordsInput(placeCoords);
    if (!name || !placeDist) { fail("اكتب الاسم واختر الحي"); return; }
    if (!coords) { fail("أدخل الإحداثيات بصيغة خرائط جوجل — مثال: 30.4706813, 31.1844191"); return; }
    setBusy(true);
    const payload = { name, lat: coords.lat, lng: coords.lng, district_id: placeDist, parent_place_id: placeParent || null };
    const { error } = editPlace
      ? await supabase.from("places").update(payload).eq("id", editPlace.id)
      : await supabase.from("places").insert(payload);
    setBusy(false);
    if (error) { fail("تعذّر الحفظ: " + error.message); return; }
    flash(editPlace ? "تم تعديل المكان ✓" : "تمت إضافة المكان ✓");
    setPlaceName(""); setPlaceCoords(""); setPlaceParent(""); setEditPlace(null); loadPlaces();
  };
  const delPlace = async (p: Place) => {
    if (!window.confirm(`حذف «${p.name}»؟ المشاوير المرتبطة به ستُحذف والأماكن التابعة له ستفقد ارتباطها.`)) return;
    const { error } = await supabase.from("places").delete().eq("id", p.id);
    if (error) { fail("تعذّر الحذف: " + error.message); return; }
    flash("تم حذف المكان ✓"); loadPlaces(); loadRoutes();
  };

  /* ===== المشاوير ===== */
  const resetRouteForm = () => {
    setRouteName(""); setRouteFrom(null); setRouteTo(null);
    setRoutePrice(""); setRouteRev(""); setRouteNotes(""); setEditRoute(null);
  };
  const openNewRoute = () => { resetRouteForm(); setRoutesView("form"); };
  const openEditRoute = (r: RouteRow) => {
    setEditRoute(r); setRouteName(r.name || ""); setRoutePrice(String(r.price));
    setRouteRev(r.reverse_price ? String(r.reverse_price) : ""); setRouteNotes(r.notes || "");
    setRouteFrom(places.find((p) => p.id === r.from_place_id) || null);
    setRouteTo(places.find((p) => p.id === r.to_place_id) || null);
    setRoutesView("form");
  };
  const saveRoute = async () => {
    if (!routeFrom || !routeTo) { fail("اختر نقطتي «من» و«إلى» من الأماكن المحفوظة"); return; }
    const price = parseFloat(routePrice);
    if (Number.isNaN(price) || price <= 0) { fail("أدخل سعرًا صحيحًا"); return; }
    const rev = routeRev.trim() ? parseFloat(routeRev) : null;
    if (routeRev.trim() && (Number.isNaN(rev!) || rev! <= 0)) { fail("سعر العودة غير صالح"); return; }
    setBusy(true);
    const payload = {
      name: routeName.trim() || null,
      from_place_id: routeFrom.id, to_place_id: routeTo.id,
      price, reverse_price: rev, notes: routeNotes.trim() || null,
    };
    const { error } = editRoute
      ? await supabase.from("route_prices").update(payload).eq("id", editRoute.id)
      : await supabase.from("route_prices").upsert(payload, { onConflict: "from_place_id,to_place_id" });
    setBusy(false);
    if (error) { fail("تعذّر الحفظ: " + error.message); return; }
    flash(editRoute ? "تم تعديل المشوار ✓" : "تمت إضافة المشوار ✓");
    resetRouteForm();
    setRoutesView("list");
    loadRoutes();
  };
  const delRoute = async (r: RouteRow) => {
    if (!window.confirm("حذف هذا المشوار؟")) return;
    const { error } = await supabase.from("route_prices").delete().eq("id", r.id);
    if (error) { fail("تعذّر الحذف: " + error.message); return; }
    flash("تم حذف المشوار ✓"); loadRoutes();
  };

  // فلترة المشاوير بالمدينة / الحي / العلامة
  const placeById = (id: string) => places.find((p) => p.id === id);
  const filteredRoutes = routes.filter((r) => {
    if (fPlace && r.from_place_id !== fPlace && r.to_place_id !== fPlace) return false;
    if (fDist || fCity) {
      const fp = placeById(r.from_place_id);
      const tp = placeById(r.to_place_id);
      const matchDist = (p?: Place) => p && p.district_id === fDist;
      const matchCity = (p?: Place) => {
        if (!p || !p.district_id) return false;
        const d = districts.find((x) => x.id === p.district_id);
        return d?.city_id === fCity;
      };
      if (fDist && !matchDist(fp) && !matchDist(tp)) return false;
      if (fCity && !fDist && !matchCity(fp) && !matchCity(tp)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / ROUTES_PER_PAGE));
  const page = Math.min(routePage, totalPages);
  const pagedRoutes = filteredRoutes.slice((page - 1) * ROUTES_PER_PAGE, page * ROUTES_PER_PAGE);
  const filterDistricts = fCity ? districts.filter((d) => d.city_id === fCity) : districts;
  const filterPlaces = fDist ? places.filter((p) => p.district_id === fDist) : places;

  /* ===== استيراد CSV ===== */
  const importPlacesCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (!rows.length) { fail("الملف فارغ"); return; }
    // تخطّي صف العناوين إن وُجد
    const data = isNaN(parseFloat(rows[0][3])) ? rows.slice(1) : rows;
    setBusy(true);
    let ok = 0, bad = 0;
    for (const r of data) {
      const [cityName, distName, placeName, latS, lngS, parentName] = r.map((x) => (x || "").trim());
      const lat = parseFloat(latS), lng = parseFloat(lngS);
      if (!cityName || !distName || !placeName || Number.isNaN(lat) || Number.isNaN(lng)) { bad++; continue; }
      const { data: city } = await supabase.from("cities").upsert({ name: cityName }, { onConflict: "name" }).select().single();
      if (!city) { bad++; continue; }
      const { data: dist } = await supabase.from("districts").upsert({ name: distName, city_id: city.id }, { onConflict: "city_id,name" }).select().single();
      if (!dist) { bad++; continue; }
      let parentId: string | null = null;
      if (parentName) {
        const { data: pp } = await supabase.from("places").select("id").eq("name", parentName).maybeSingle();
        parentId = pp?.id || null;
      }
      const { error } = await supabase.from("places").upsert(
        { name: placeName, lat, lng, district_id: dist.id, parent_place_id: parentId }, { onConflict: "name" });
      if (error) bad++; else ok++;
    }
    setBusy(false);
    flash(`تم الاستيراد ✓ نجح: ${ok} — فشل: ${bad}`);
    loadAll();
  };

  const importRoutesCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (!rows.length) { fail("الملف فارغ"); return; }
    const data = isNaN(parseFloat(rows[0][2])) ? rows.slice(1) : rows;
    setBusy(true);
    let ok = 0, bad = 0;
    for (const r of data) {
      const [fromName, toName, priceS, revS, notes] = r.map((x) => (x || "").trim());
      const price = parseFloat(priceS);
      const rev = revS ? parseFloat(revS) : null;
      if (!fromName || !toName || Number.isNaN(price) || price <= 0) { bad++; continue; }
      const { data: fp } = await supabase.from("places").select("id").eq("name", fromName).maybeSingle();
      const { data: tp } = await supabase.from("places").select("id").eq("name", toName).maybeSingle();
      if (!fp || !tp) { bad++; continue; }
      const { error } = await supabase.from("route_prices").upsert({
        from_place_id: fp.id, to_place_id: tp.id, price,
        reverse_price: rev, notes: notes || null,
      }, { onConflict: "from_place_id,to_place_id" });
      if (error) bad++; else ok++;
    }
    setBusy(false);
    flash(`تم استيراد المشاوير ✓ نجح: ${ok} — فشل: ${bad} (الفشل غالبًا أسماء أماكن غير موجودة)`);
    loadRoutes();
  };

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>تسهيلات الاستخدام</h2>
        <p>المدن ← الأحياء ← الشوارع والعلامات (ويمكن ربط أي مكان بمكان أب مثل: صيدلية داخل شارع)، ثم المشاوير بأسعارها الثابتة</p>
      </div>

      <div className="adminTabs">
        <button className={sub === "cities" ? "on" : ""} onClick={() => setSub("cities")}>المدن</button>
        <button className={sub === "districts" ? "on" : ""} onClick={() => setSub("districts")}>الأحياء</button>
        <button className={sub === "places" ? "on" : ""} onClick={() => setSub("places")}>الشوارع والعلامات</button>
        <button className={sub === "routes" ? "on" : ""} onClick={() => { setSub("routes"); setRoutesView("list"); }}>المشاوير</button>
      </div>

      {msg && <p className="okMsg">{msg}</p>}
      {err && <p className="authError">{err}</p>}

      {/* ===== المدن ===== */}
      {sub === "cities" && (
        <>
          <div className="apForm">
            <input value={cityName} placeholder="اسم المدينة — مثال: بنها" onChange={(e) => setCityName(e.target.value)} />
            <button className="authSubmit" onClick={saveCity} disabled={busy}>{editCity ? "حفظ التعديل" : "إضافة"}</button>
            {editCity && <button className="wizBack" onClick={() => { setEditCity(null); setCityName(""); }}>إلغاء</button>}
          </div>
          <div className="apList">
            {cities.map((c) => (
              <div className="apRow" key={c.id}>
                <div className="apRowMain">
                  <b>{c.name}</b>
                  <span className="apMeta">{districts.filter((d) => d.city_id === c.id).length} حي</span>
                </div>
                <div className="apRowActions">
                  <button onClick={() => { setEditCity(c); setCityName(c.name); }}>تعديل</button>
                  <button className="apDel" onClick={() => delCity(c)}>حذف</button>
                </div>
              </div>
            ))}
            {cities.length === 0 && <p className="emptyState">لا توجد مدن بعد</p>}
          </div>
        </>
      )}

      {/* ===== الأحياء ===== */}
      {sub === "districts" && (
        <>
          <div className="apForm">
            <select value={distCity} onChange={(e) => setDistCity(e.target.value)}>
              <option value="">اختر المدينة...</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={distName} placeholder="اسم الحي — مثال: كفر الجزار" onChange={(e) => setDistName(e.target.value)} />
            <button className="authSubmit" onClick={saveDistrict} disabled={busy}>{editDist ? "حفظ التعديل" : "إضافة"}</button>
            {editDist && <button className="wizBack" onClick={() => { setEditDist(null); setDistName(""); }}>إلغاء</button>}
          </div>
          <div className="apList">
            {districts.map((d) => (
              <div className="apRow" key={d.id}>
                <div className="apRowMain">
                  <b>{d.name}</b>
                  <span className="apMeta">{d.cities?.name || ""}</span>
                </div>
                <div className="apRowActions">
                  <button onClick={() => { setEditDist(d); setDistName(d.name); setDistCity(d.city_id); }}>تعديل</button>
                  <button className="apDel" onClick={() => delDistrict(d)}>حذف</button>
                </div>
              </div>
            ))}
            {districts.length === 0 && <p className="emptyState">لا توجد أحياء بعد — أضِف مدينة أولًا</p>}
          </div>
        </>
      )}

      {/* ===== الشوارع والعلامات ===== */}
      {sub === "places" && (
        <>
          <div className="apTools">
            <button className="offerPlus" onClick={() => downloadCsv("قالب-الاماكن.csv", [
              ["المدينة", "الحي", "اسم المكان", "خط العرض lat", "خط الطول lng", "تابع لمكان (اختياري)"],
              ["بنها", "الفلل", "الفلل شارع 5", "30.4597", "31.1886", ""],
              ["بنها", "الفلل", "مسجد النور", "30.4600", "31.1890", "الفلل شارع 5"],
              ["بنها", "الفلل", "صيدلية الشفاء", "30.4602", "31.1892", "الفلل شارع 5"],
            ])}>⬇ تحميل قالب CSV</button>
            <button className="offerMain" onClick={() => placesFileRef.current?.click()} disabled={busy}>
              {busy ? "جارٍ الاستيراد..." : "⬆ استيراد الأماكن من CSV"}
            </button>
            <input ref={placesFileRef} type="file" accept=".csv" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importPlacesCsv(f); e.target.value = ""; }} />
          </div>
          <div className="apForm apFormGrid">
            <select value={placeDist} onChange={(e) => setPlaceDist(e.target.value)}>
              <option value="">اختر الحي...</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.cities?.name || ""}</option>)}
            </select>
            <input value={placeName} placeholder="اسم الشارع أو العلامة أو المحل — مثال: مسجد النور" onChange={(e) => setPlaceName(e.target.value)} />
            <select value={placeParent} onChange={(e) => setPlaceParent(e.target.value)}>
              <option value="">تابع لمكان؟ (اختياري — مثال: شارع)</option>
              {places.filter((p) => p.id !== editPlace?.id).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.districts?.name ? ` — ${p.districts.name}` : ""}</option>
              ))}
            </select>
            <input value={placeCoords} placeholder="الإحداثيات — الصق من خرائط جوجل: 30.4706813, 31.1844191"
              style={{ direction: "ltr", textAlign: "left" }}
              onChange={(e) => setPlaceCoords(e.target.value)} />
            <button className="authSubmit" onClick={savePlace} disabled={busy}>{editPlace ? "حفظ التعديل" : "إضافة"}</button>
            {editPlace && <button className="wizBack" onClick={() => { setEditPlace(null); setPlaceName(""); setPlaceCoords(""); setPlaceParent(""); }}>إلغاء</button>}
          </div>
          <div className="apList">
            {places.map((p) => (
              <div className="apRow" key={p.id}>
                <div className="apRowMain">
                  <b>{p.name}</b>
                  <span className="apMeta">
                    {p.parent?.name ? `تابع لـ ${p.parent.name} — ` : ""}
                    {p.districts?.name ? `${p.districts.name} — ` : ""}{p.districts?.cities?.name || "بدون حي"}
                    {places.filter((s) => s.parent_place_id === p.id).length > 0 && ` · ${places.filter((s) => s.parent_place_id === p.id).length} مكان تابع`}
                  </span>
                </div>
                <div className="apRowActions">
                  <button onClick={() => { setEditPlace(p); setPlaceName(p.name); setPlaceCoords(`${p.lat}, ${p.lng}`); setPlaceDist(p.district_id || ""); setPlaceParent(p.parent_place_id || ""); }}>تعديل</button>
                  <button className="apDel" onClick={() => delPlace(p)}>حذف</button>
                </div>
              </div>
            ))}
            {places.length === 0 && <p className="emptyState">لا توجد أماكن بعد — أضِف حيًّا أولًا أو استورد CSV</p>}
          </div>
        </>
      )}

      {/* ===== المشاوير ===== */}
      {sub === "routes" && routesView === "form" && (
        <div className="apFormRoutes">
          <div className="apFormHead">
            <button className="wizBack" onClick={() => { resetRouteForm(); setRoutesView("list"); }}>→ رجوع لقائمة المشاوير</button>
            <h3>{editRoute ? "تعديل مشوار" : "إضافة مشوار جديد"}</h3>
          </div>
          <div className="field">
            <label>اسم المشوار (اختياري)</label>
            <input value={routeName} placeholder="مثال: مشوار الجامعة" onChange={(e) => setRouteName(e.target.value)} />
          </div>
          <PlaceSearch label="من" value={routeFrom} onPick={setRouteFrom} excludeId={routeTo?.id} />
          <PlaceSearch label="إلى" value={routeTo} onPick={setRouteTo} excludeId={routeFrom?.id} />
          <div className="row2">
            <div className="field">
              <label>السعر (ج.م)</label>
              <input value={routePrice} inputMode="decimal" placeholder="مثال: 15" onChange={(e) => setRoutePrice(e.target.value)} />
            </div>
            <div className="field">
              <label>سعر العودة (اختياري — فارغ = نفس السعر)</label>
              <input value={routeRev} inputMode="decimal" placeholder="مثال: 20" onChange={(e) => setRouteRev(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>ملاحظات (اختياري)</label>
            <input value={routeNotes} placeholder="أي ملاحظات عن هذا المشوار" onChange={(e) => setRouteNotes(e.target.value)} />
          </div>
          <button className="authSubmit" onClick={saveRoute} disabled={busy}>{editRoute ? "حفظ التعديل" : "حفظ المشوار"}</button>
        </div>
      )}

      {sub === "routes" && routesView === "list" && (
        <>
          <div className="apTools">
            <button className="authSubmit" onClick={openNewRoute}>＋ إضافة مشوار جديد</button>
            <button className="offerPlus" onClick={() => downloadCsv("قالب-المشاوير.csv", [
              ["من", "إلى", "السعر", "سعر العودة (اختياري)", "ملاحظات"],
              ["محطة قطار بنها", "جامعة بنها", "15", "", "أسعار ثابتة"],
            ])}>⬇ تحميل قالب CSV</button>
            <button className="offerMain" onClick={() => routesFileRef.current?.click()} disabled={busy}>
              {busy ? "جارٍ الاستيراد..." : "⬆ استيراد المشاوير من CSV"}
            </button>
            <input ref={routesFileRef} type="file" accept=".csv" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importRoutesCsv(f); e.target.value = ""; }} />
          </div>

          {/* فلاتر التصفية */}
          <div className="apFilters">
            <select value={fCity} onChange={(e) => { setFCity(e.target.value); setFDist(""); setFPlace(""); setRoutePage(1); }}>
              <option value="">كل المدن</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={fDist} onChange={(e) => { setFDist(e.target.value); setFPlace(""); setRoutePage(1); }}>
              <option value="">كل الأحياء</option>
              {filterDistricts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={fPlace} onChange={(e) => { setFPlace(e.target.value); setRoutePage(1); }}>
              <option value="">كل العلامات</option>
              {filterPlaces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {(fCity || fDist || fPlace) && (
              <button className="wizBack" onClick={() => { setFCity(""); setFDist(""); setFPlace(""); setRoutePage(1); }}>مسح الفلاتر</button>
            )}
          </div>

          <div className="apList">
            {pagedRoutes.map((r) => (
              <div className="apRow" key={r.id}>
                <div className="apRowMain">
                  <b>{r.name || `${r.from_place?.name || "؟"} ← ${r.to_place?.name || "؟"}`}</b>
                  <span className="apMeta">
                    {r.from_place?.name} ← {r.to_place?.name} · {Number(r.price).toFixed(0)} ج
                    {r.reverse_price ? ` (عودة ${Number(r.reverse_price).toFixed(0)} ج)` : ""}
                    {r.notes ? ` — ${r.notes}` : ""}
                  </span>
                </div>
                <div className="apRowActions">
                  <button onClick={() => openEditRoute(r)}>تعديل</button>
                  <button className="apDel" onClick={() => delRoute(r)}>حذف</button>
                </div>
              </div>
            ))}
            {pagedRoutes.length === 0 && <p className="emptyState">لا توجد مشاوير مطابقة — أضِف مشوارًا جديدًا</p>}
          </div>

          {/* ترقيم الصفحات */}
          {filteredRoutes.length > ROUTES_PER_PAGE && (
            <div className="apPager">
              <button disabled={page <= 1} onClick={() => setRoutePage(page - 1)}>السابق</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={n === page ? "on" : ""} onClick={() => setRoutePage(n)}>{n}</button>
              ))}
              <button disabled={page >= totalPages} onClick={() => setRoutePage(page + 1)}>التالي</button>
            </div>
          )}
          <p className="apCount">إجمالي المشاوير: {filteredRoutes.length}{filteredRoutes.length !== routes.length ? ` (من أصل ${routes.length})` : ""}</p>
        </>
      )}
    </section>
  );
}
