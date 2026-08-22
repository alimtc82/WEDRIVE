import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { normalizeArabic } from "../lib/arabicSearch";
import "../adminPlacesV1178.css";

type City = { id: string; name: string };
type District = { id: string; name: string; city_id: string; cities?: { name: string } | null };
type Place = {
  id: string; name: string; lat: number; lng: number; district_id: string | null; parent_place_id: string | null;
  districts?: { name: string; cities?: { name: string } | null } | null;
  parent?: { name: string } | null;
};
type RouteRow = { id: string; name: string | null; price: number; reverse_price: number | null; notes: string | null; from_place_id: string; to_place_id: string };
type Sub = "cities" | "districts" | "places" | "routes";
type Relation<T> = T | T[] | null;

const norm = (s: string) => normalizeArabic(s.trim()).replace(/\s+/g, " ");
const smartMatch = (name: string, q: string) => !q.trim() || norm(name).includes(norm(q));
const exactSmart = (name: string, q: string) => !!q.trim() && norm(name) === norm(q);

function one<T>(v: Relation<T> | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null); }
function parseCoords(text: string) {
  const m = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function SmartPicker<T extends { id: string; name: string }>({ label, value, items, placeholder, optional, addLabel, onPick, onAdd }:{
  label:string; value:string; items:T[]; placeholder:string; optional?:boolean; addLabel:string; onPick:(id:string)=>void; onAdd:(name:string)=>Promise<void>;
}) {
  const selected = items.find(x => x.id === value) || null;
  const [q,setQ] = useState("");
  const [open,setOpen] = useState(false);
  useEffect(() => { if (selected) setQ(selected.name); else if (!value) setQ(""); }, [value, selected?.id]);
  const matches = useMemo(() => q.trim() ? items.filter(x => smartMatch(x.name,q)).slice(0,8) : items.slice(0,8), [items,q]);
  const hasExact = items.some(x => exactSmart(x.name,q));
  return <div className="spField">
    <label>{label}{optional && <small> — اختياري</small>}</label>
    <input value={q} placeholder={placeholder} onFocus={()=>setOpen(true)} onChange={e=>{setQ(e.target.value);onPick("");setOpen(true);}} />
    {open && <div className="spMenu">
      {matches.map(x => <button type="button" key={x.id} onClick={()=>{onPick(x.id);setQ(x.name);setOpen(false)}}><b>{x.name}</b></button>)}
      {q.trim() && !hasExact && <button type="button" className="spAdd" onClick={async()=>{await onAdd(q.trim());setOpen(false)}}>＋ {addLabel} «{q.trim()}»</button>}
      {!q.trim() && optional && <button type="button" className="spClear" onClick={()=>{onPick("");setQ("");setOpen(false)}}>بدون</button>}
    </div>}
    {selected && <small className="spChosen">تم الاختيار: {selected.name}</small>}
  </div>;
}

export default function AdminPlacesV1178() {
  const [sub,setSub] = useState<Sub>("cities");
  const [cities,setCities] = useState<City[]>([]);
  const [districts,setDistricts] = useState<District[]>([]);
  const [places,setPlaces] = useState<Place[]>([]);
  const [routes,setRoutes] = useState<RouteRow[]>([]);
  const [msg,setMsg] = useState(""); const [err,setErr] = useState(""); const [busy,setBusy] = useState(false);

  const [cityName,setCityName] = useState(""); const [editCity,setEditCity] = useState<City|null>(null);
  const [distName,setDistName] = useState(""); const [distCity,setDistCity] = useState(""); const [editDist,setEditDist] = useState<District|null>(null);

  const [placesView,setPlacesView] = useState<"list"|"form">("list");
  const [placeCity,setPlaceCity] = useState(""); const [placeDist,setPlaceDist] = useState("");
  const [placeName,setPlaceName] = useState(""); const [placeParent,setPlaceParent] = useState(""); const [placeCoords,setPlaceCoords] = useState("");
  const [editPlace,setEditPlace] = useState<Place|null>(null);
  const [filterCity,setFilterCity] = useState(""); const [filterDist,setFilterDist] = useState(""); const [filterText,setFilterText] = useState("");

  const [routeFrom,setRouteFrom] = useState(""); const [routeTo,setRouteTo] = useState(""); const [routeName,setRouteName] = useState("");
  const [routePrice,setRoutePrice] = useState(""); const [routeRev,setRouteRev] = useState(""); const [routeNotes,setRouteNotes] = useState("");
  const [editRoute,setEditRoute] = useState<RouteRow|null>(null); const [showFixedRoutes,setShowFixedRoutes] = useState(true); const [settingsId,setSettingsId] = useState<string|null>(null);

  const flash=(s:string)=>{setMsg(s);setErr("");setTimeout(()=>setMsg(""),3500)}; const fail=(s:string)=>{setErr(s);setMsg("")};
  const load = useCallback(async()=>{
    const [c,d,p,r,s] = await Promise.all([
      supabase.from("cities").select("id,name").order("name"),
      supabase.from("districts").select("id,name,city_id,cities(name)").order("name"),
      supabase.from("places").select("id,name,lat,lng,district_id,parent_place_id,districts(name,cities(name)),parent:places!parent_place_id(name)").order("name"),
      supabase.from("route_prices").select("id,name,price,reverse_price,notes,from_place_id,to_place_id").order("created_at",{ascending:false}),
      supabase.from("settings").select("id,show_fixed_routes").single(),
    ]);
    setCities((c.data as City[])||[]);
    setDistricts(((d.data as any[])||[]).map(x=>({...x,cities:one(x.cities)})));
    setPlaces(((p.data as any[])||[]).map(x=>{const di=one<any>(x.districts);return {...x,districts:di?{...di,cities:one(di.cities)}:null,parent:one(x.parent)}}));
    setRoutes((r.data as RouteRow[])||[]);
    if(s.data){setSettingsId(s.data.id);setShowFixedRoutes(s.data.show_fixed_routes!==false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const addCityFromPlace = async(name:string)=>{
    const existing=cities.find(c=>exactSmart(c.name,name)); if(existing){setPlaceCity(existing.id);return;}
    const {data,error}=await supabase.from("cities").insert({name}).select("id,name").single(); if(error){fail("تعذر إضافة المدينة: "+error.message);return;}
    await load(); setPlaceCity(data.id); setPlaceDist(""); flash(`تمت إضافة مدينة «${name}» ✓`);
  };
  const addDistrictFromPlace = async(name:string)=>{
    if(!placeCity){fail("اختر أو أضف المدينة أولًا، ثم أضف الحي");return;}
    const existing=districts.find(d=>d.city_id===placeCity&&exactSmart(d.name,name)); if(existing){setPlaceDist(existing.id);return;}
    const {data,error}=await supabase.from("districts").insert({name,city_id:placeCity}).select("id").single(); if(error){fail("تعذر إضافة الحي: "+error.message);return;}
    await load(); setPlaceDist(data.id); flash(`تمت إضافة حي «${name}» ✓`);
  };

  const resetPlace=()=>{setPlaceCity("");setPlaceDist("");setPlaceName("");setPlaceParent("");setPlaceCoords("");setEditPlace(null)};
  const openEditPlace=(p:Place)=>{setEditPlace(p);setPlaceName(p.name);setPlaceCoords(`${p.lat}, ${p.lng}`);setPlaceDist(p.district_id||"");setPlaceParent(p.parent_place_id||"");const d=districts.find(x=>x.id===p.district_id);setPlaceCity(d?.city_id||"");setPlacesView("form")};
  const savePlace=async()=>{
    const name=placeName.trim(), coords=parseCoords(placeCoords); if(!name){fail("اسم المكان مطلوب");return;} if(!coords){fail("الإحداثيات مطلوبة بصيغة صحيحة، مثال: 30.4706813, 31.1844191");return;}
    setBusy(true); const payload={name,lat:coords.lat,lng:coords.lng,district_id:placeDist||null,parent_place_id:placeParent||null};
    const {error}=editPlace?await supabase.from("places").update(payload).eq("id",editPlace.id):await supabase.from("places").insert(payload); setBusy(false);
    if(error){
      if(error.code==="23505") fail("هذا المكان محفوظ بالفعل بنفس الاسم والإحداثيات.");
      else fail("تعذر حفظ المكان: "+error.message);
      return;
    }
    flash(editPlace?"تم تعديل المكان ✓":"تمت إضافة المكان ✓");resetPlace();setPlacesView("list");await load();
  };
  const deletePlace=async(p:Place)=>{if(!confirm(`حذف «${p.name}»؟`))return;const {error}=await supabase.from("places").delete().eq("id",p.id);if(error)fail(error.message);else{flash("تم حذف المكان ✓");await load()}};

  const filteredPlaces=useMemo(()=>places.filter(p=>{
    if(filterText&&!smartMatch(p.name,filterText))return false;
    if(filterDist&&p.district_id!==filterDist)return false;
    if(filterCity&&!filterDist){const d=districts.find(x=>x.id===p.district_id);if(d?.city_id!==filterCity)return false;}
    return true;
  }),[places,districts,filterCity,filterDist,filterText]);

  const saveCity=async()=>{const name=cityName.trim();if(!name)return;const dup=cities.find(c=>exactSmart(c.name,name)&&c.id!==editCity?.id);if(dup){fail(`المدينة موجودة بالفعل باسم «${dup.name}»`);return;}setBusy(true);const {error}=editCity?await supabase.from("cities").update({name}).eq("id",editCity.id):await supabase.from("cities").insert({name});setBusy(false);if(error)fail(error.message);else{flash("تم حفظ المدينة ✓");setCityName("");setEditCity(null);await load()}};
  const saveDistrict=async()=>{const name=distName.trim();if(!name||!distCity){fail("اختر المدينة واكتب اسم الحي");return;}const dup=districts.find(d=>d.city_id===distCity&&exactSmart(d.name,name)&&d.id!==editDist?.id);if(dup){fail(`الحي موجود بالفعل باسم «${dup.name}»`);return;}setBusy(true);const {error}=editDist?await supabase.from("districts").update({name,city_id:distCity}).eq("id",editDist.id):await supabase.from("districts").insert({name,city_id:distCity});setBusy(false);if(error)fail(error.message);else{flash("تم حفظ الحي ✓");setDistName("");setDistCity("");setEditDist(null);await load()}};

  const saveRoute=async()=>{if(!routeFrom||!routeTo||routeFrom===routeTo){fail("اختر مكانين مختلفين");return;}const price=Number(routePrice);if(!price||price<=0){fail("أدخل سعرًا صحيحًا");return;}const payload={name:routeName.trim()||null,from_place_id:routeFrom,to_place_id:routeTo,price,reverse_price:routeRev.trim()?Number(routeRev):null,notes:routeNotes.trim()||null};setBusy(true);const {error}=editRoute?await supabase.from("route_prices").update(payload).eq("id",editRoute.id):await supabase.from("route_prices").upsert(payload,{onConflict:"from_place_id,to_place_id"});setBusy(false);if(error)fail(error.message);else{flash("تم حفظ المشوار ✓");setRouteFrom("");setRouteTo("");setRouteName("");setRoutePrice("");setRouteRev("");setRouteNotes("");setEditRoute(null);await load()}};

  const placeDistricts=placeCity?districts.filter(d=>d.city_id===placeCity):districts;
  const filterDistricts=filterCity?districts.filter(d=>d.city_id===filterCity):districts;
  const parentChoices=places.filter(p=>p.id!==editPlace?.id);

  return <section className="panel placesV1178">
    <div className="panelHead"><h2>تسهيلات الاستخدام</h2><p>المدن ← الأحياء ← الأماكن، ثم المشاوير بأسعارها الثابتة. البحث العربي يتعامل مع الهمزات و«ة/ه» كصيغة واحدة.</p></div>
    <div className="adminTabs">
      <button className={sub==="cities"?"on":""} onClick={()=>setSub("cities")}>المدن</button>
      <button className={sub==="districts"?"on":""} onClick={()=>setSub("districts")}>الأحياء</button>
      <button className={sub==="places"?"on":""} onClick={()=>{setSub("places");setPlacesView("list")}}>الأماكن</button>
      <button className={sub==="routes"?"on":""} onClick={()=>setSub("routes")}>المشاوير</button>
    </div>
    {msg&&<p className="okMsg">{msg}</p>}{err&&<p className="authError">{err}</p>}

    {sub==="cities"&&<><div className="apForm"><input value={cityName} placeholder="اسم المدينة" onChange={e=>setCityName(e.target.value)}/><button className="authSubmit" disabled={busy} onClick={saveCity}>{editCity?"حفظ التعديل":"إضافة"}</button></div><div className="apList">{cities.map(c=><div className="apRow" key={c.id}><div className="apRowMain"><b>{c.name}</b><span className="apMeta">{districts.filter(d=>d.city_id===c.id).length} حي</span></div><div className="apRowActions"><button onClick={()=>{setEditCity(c);setCityName(c.name)}}>تعديل</button></div></div>)}</div></>}

    {sub==="districts"&&<><div className="apForm"><select value={distCity} onChange={e=>setDistCity(e.target.value)}><option value="">اختر المدينة</option>{cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input value={distName} placeholder="اسم الحي" onChange={e=>setDistName(e.target.value)}/><button className="authSubmit" disabled={busy} onClick={saveDistrict}>{editDist?"حفظ التعديل":"إضافة"}</button></div><div className="apList">{districts.map(d=><div className="apRow" key={d.id}><div className="apRowMain"><b>{d.name}</b><span className="apMeta">{d.cities?.name||""}</span></div><div className="apRowActions"><button onClick={()=>{setEditDist(d);setDistName(d.name);setDistCity(d.city_id)}}>تعديل</button></div></div>)}</div></>}

    {sub==="places"&&placesView==="list"&&<>
      <div className="apTools"><button className="authSubmit" onClick={()=>{resetPlace();setPlacesView("form")}}>＋ إضافة مكان جديد</button></div>
      <div className="placesSmartFilters"><input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="بحث ذكي في اسم المكان..."/><select value={filterCity} onChange={e=>{setFilterCity(e.target.value);setFilterDist("")}}><option value="">كل المدن</option>{cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={filterDist} onChange={e=>setFilterDist(e.target.value)}><option value="">كل الأحياء</option>{filterDistricts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <div className="apList">{filteredPlaces.map(p=><div className="apRow" key={p.id}><div className="apRowMain"><b>{p.name}</b><span className="apMeta">{p.parent?.name?`تابع لـ ${p.parent.name} — `:""}{p.districts?.name?`${p.districts.name} — `:""}{p.districts?.cities?.name||"بدون تصنيف جغرافي"}</span></div><div className="apRowActions"><button onClick={()=>openEditPlace(p)}>تعديل</button><button className="apDel" onClick={()=>deletePlace(p)}>حذف</button></div></div>)}{!filteredPlaces.length&&<p className="emptyState">لا توجد أماكن مطابقة</p>}</div>
    </>}

    {sub==="places"&&placesView==="form"&&<div className="apFormRoutes">
      <div className="apFormHead"><button className="wizBack" onClick={()=>{resetPlace();setPlacesView("list")}}>→ رجوع لقائمة الأماكن</button><h3>{editPlace?"تعديل مكان":"إضافة مكان جديد"}</h3></div>
      <SmartPicker label="المدينة" optional value={placeCity} items={cities} placeholder="ابحث عن المدينة..." addLabel="إضافة مدينة جديدة" onPick={id=>{setPlaceCity(id);if(id!==placeCity)setPlaceDist("")}} onAdd={addCityFromPlace}/>
      <SmartPicker label="الحي" optional value={placeDist} items={placeDistricts} placeholder="ابحث عن الحي..." addLabel="إضافة حي جديد" onPick={id=>{setPlaceDist(id);const d=districts.find(x=>x.id===id);if(d)setPlaceCity(d.city_id)}} onAdd={addDistrictFromPlace}/>
      <div className="field bridgeDistrictField" style={{display:"none"}}><label>الحي</label><select data-place-district-id value={placeDist} onChange={e=>setPlaceDist(e.target.value)}><option value="">بدون حي</option>{districts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <div className="field requiredField"><label>اسم المكان <b>*</b></label><input value={placeName} placeholder="مثال: مسجد النور، مستشفى الجامعة، شارع فريد ندا" onChange={e=>setPlaceName(e.target.value)}/></div>
      <div className="field"><label>تابع لمكان — اختياري</label><select value={placeParent} onChange={e=>setPlaceParent(e.target.value)}><option value="">بدون — مكان رئيسي</option>{parentChoices.map(p=><option key={p.id} value={p.id}>{p.name}{p.districts?.name?` — ${p.districts.name}`:""}</option>)}</select></div>
      <div className="field requiredField"><label>الإحداثيات <b>*</b></label><input value={placeCoords} placeholder="30.4706813, 31.1844191" style={{direction:"ltr",textAlign:"left"}} onChange={e=>setPlaceCoords(e.target.value)}/><small>الحقلان الإجباريان فقط: اسم المكان + الإحداثيات.</small></div>
      <button className="authSubmit" disabled={busy} onClick={savePlace}>{editPlace?"حفظ التعديل":"حفظ المكان"}</button>
    </div>}

    {sub==="routes"&&<>
      <div className="apToggle"><div><b>إظهار قائمة «مشاوير بأسعار ثابتة» في شاشة العميل</b><small>يمكن إخفاء القائمة مع استمرار تطبيق السعر الثابت.</small></div><label className="switch"><input type="checkbox" checked={showFixedRoutes} onChange={async e=>{const v=e.target.checked;setShowFixedRoutes(v);if(settingsId)await supabase.from("settings").update({show_fixed_routes:v}).eq("id",settingsId)}}/><span className="track"/></label></div>
      <div className="apFormRoutes"><div className="field"><label>اسم المشوار — اختياري</label><input value={routeName} onChange={e=>setRouteName(e.target.value)}/></div><div className="row2"><div className="field"><label>من</label><select value={routeFrom} onChange={e=>setRouteFrom(e.target.value)}><option value="">اختر مكانًا</option>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>إلى</label><select value={routeTo} onChange={e=>setRouteTo(e.target.value)}><option value="">اختر مكانًا</option>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div><div className="row2"><div className="field"><label>السعر</label><input inputMode="decimal" value={routePrice} onChange={e=>setRoutePrice(e.target.value)}/></div><div className="field"><label>سعر العودة — اختياري</label><input inputMode="decimal" value={routeRev} onChange={e=>setRouteRev(e.target.value)}/></div></div><div className="field"><label>ملاحظات — اختياري</label><input value={routeNotes} onChange={e=>setRouteNotes(e.target.value)}/></div><button className="authSubmit" onClick={saveRoute} disabled={busy}>حفظ المشوار</button></div>
      <div className="apList">{routes.map(r=><div className="apRow" key={r.id}><div className="apRowMain"><b>{r.name||`${places.find(p=>p.id===r.from_place_id)?.name||"؟"} ← ${places.find(p=>p.id===r.to_place_id)?.name||"؟"}`}</b><span className="apMeta">{Number(r.price).toFixed(0)} ج.م</span></div><div className="apRowActions"><button onClick={()=>{setEditRoute(r);setRouteName(r.name||"");setRouteFrom(r.from_place_id);setRouteTo(r.to_place_id);setRoutePrice(String(r.price));setRouteRev(r.reverse_price?String(r.reverse_price):"");setRouteNotes(r.notes||"")}}>تعديل</button></div></div>)}</div>
    </>}
  </section>;
}
