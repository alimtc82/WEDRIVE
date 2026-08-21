import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import ParentPlaceSearch, { type ExternalParentPlace, type ParentSavedPlace } from "./ParentPlaceSearch";

type PlaceRow = { id: string; name: string; lat: number; lng: number; district_id: string | null };

function normalizeArabic(value: string) {
  return value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function findParentSelect() {
  const forms = Array.from(document.querySelectorAll<HTMLElement>(".apFormRoutes"));
  for (const form of forms) {
    const fields = Array.from(form.querySelectorAll<HTMLElement>(".field"));
    for (const field of fields) {
      const label = field.querySelector("label")?.textContent || "";
      if (label.includes("تابع لمكان")) {
        return { field, select: field.querySelector("select") as HTMLSelectElement | null, form };
      }
    }
  }
  return null;
}

export default function AdminParentPlaceBridge({ active }: { active: boolean }) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [selectEl, setSelectEl] = useState<HTMLSelectElement | null>(null);
  const [formEl, setFormEl] = useState<HTMLElement | null>(null);
  const [saved, setSaved] = useState<ParentSavedPlace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [external, setExternal] = useState<ExternalParentPlace | null>(null);
  const [error, setError] = useState("");

  const loadSaved = useCallback(async () => {
    const { data } = await supabase.from("places")
      .select("id,name,lat,lng,district_id,districts(name,cities(name))")
      .order("name");
    const rows = (data || []) as Array<PlaceRow & { districts?: { name?: string; cities?: { name?: string } | null } | null }>;
    setSaved(rows.map((p) => ({
      id: p.id, name: p.name, lat: Number(p.lat), lng: Number(p.lng), districtId: p.district_id,
      context: [p.districts?.name, p.districts?.cities?.name].filter(Boolean).join(" — "),
    })));
  }, []);

  useEffect(() => {
    if (!active) { setMount(null); setSelectEl(null); setFormEl(null); return; }
    void loadSaved();
    const sync = () => {
      const found = findParentSelect();
      if (!found?.select) { setMount(null); setSelectEl(null); setFormEl(null); return; }
      let host = found.field.querySelector<HTMLElement>("[data-parent-smart-host]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.parentSmartHost = "1";
        found.field.insertBefore(host, found.select);
      }
      found.select.style.display = "none";
      setMount(host); setSelectEl(found.select); setFormEl(found.form);
      setSelectedId(found.select.value || "");
    };
    sync();
    const timer = window.setInterval(sync, 500);
    return () => window.clearInterval(timer);
  }, [active, loadSaved]);

  const setNativeParent = useCallback((id: string, name?: string) => {
    if (!selectEl) return;
    if (id && !Array.from(selectEl.options).some((o) => o.value === id)) {
      const option = document.createElement("option"); option.value = id; option.text = name || "المكان الرئيسي";
      selectEl.appendChild(option);
    }
    selectEl.value = id;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    setSelectedId(id); setExternal(null); setError("");
  }, [selectEl]);

  const districtId = useMemo(() => {
    if (!formEl) return "";
    const fields = Array.from(formEl.querySelectorAll<HTMLElement>(".field"));
    const districtField = fields.find((field) => (field.querySelector("label")?.textContent || "").trim() === "الحي");
    return (districtField?.querySelector("select") as HTMLSelectElement | null)?.value || "";
  }, [formEl, selectedId, external]);

  const chooseExternal = async (place: ExternalParentPlace) => {
    setError("");
    const currentDistrict = (() => {
      if (!formEl) return "";
      const fields = Array.from(formEl.querySelectorAll<HTMLElement>(".field"));
      const districtField = fields.find((field) => (field.querySelector("label")?.textContent || "").trim() === "الحي");
      return (districtField?.querySelector("select") as HTMLSelectElement | null)?.value || "";
    })();
    if (!currentDistrict) { setError("اختر الحي أولًا قبل اختيار مكان رئيسي من الخريطة"); return; }

    const targetName = normalizeArabic(place.name);
    const { data: possible } = await supabase.from("places")
      .select("id,name,lat,lng,district_id")
      .ilike("name", `%${place.name.trim()}%`)
      .limit(20);
    const duplicate = ((possible || []) as PlaceRow[]).find((p) =>
      normalizeArabic(p.name) === targetName && distanceMeters({ lat: Number(p.lat), lng: Number(p.lng) }, place) <= 150
    );
    if (duplicate) {
      setNativeParent(duplicate.id, duplicate.name);
      await loadSaved();
      return;
    }

    const { data: created, error: insertError } = await supabase.from("places")
      .insert({ name: place.name.trim(), lat: place.lat, lng: place.lng, district_id: currentDistrict, parent_place_id: null })
      .select("id,name")
      .single();
    if (insertError || !created) { setError("تعذّر حفظ المكان الرئيسي: " + (insertError?.message || "خطأ غير معروف")); return; }
    setNativeParent(created.id, created.name);
    setExternal(place);
    await loadSaved();
  };

  if (!active || !mount || !selectEl) return null;
  return createPortal(
    <div className="parentSmartBridge">
      <ParentPlaceSearch
        savedPlaces={saved}
        selectedId={selectedId}
        external={external}
        onSelectSaved={(id) => setNativeParent(id, saved.find((p) => p.id === id)?.name)}
        onSelectExternal={(p) => { void chooseExternal(p); }}
        onClear={() => setNativeParent("")}
      />
      {districtId && !selectedId && !external && <small className="apMeta">اختر مكانًا محفوظًا أو ابحث عنه في الخريطة الأساسية للنظام.</small>}
      {error && <p className="authError">{error}</p>}
    </div>,
    mount,
  );
}
