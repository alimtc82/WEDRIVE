import { useMemo, useState } from "react";

export type ParentSavedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  districtId: string | null;
  context?: string;
};

export type ExternalParentPlace = {
  name: string;
  lat: number;
  lng: number;
  displayName: string;
};

export default function ParentPlaceSearch({
  savedPlaces,
  selectedId,
  external,
  excludeId,
  onSelectSaved,
  onSelectExternal,
  onClear,
}: {
  savedPlaces: ParentSavedPlace[];
  selectedId: string;
  external: ExternalParentPlace | null;
  excludeId?: string | null;
  onSelectSaved: (id: string) => void;
  onSelectExternal: (place: ExternalParentPlace) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mapResults, setMapResults] = useState<ExternalParentPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const selected = savedPlaces.find((p) => p.id === selectedId) || null;
  const localResults = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ar");
    if (!q) return [];
    return savedPlaces
      .filter((p) => p.id !== excludeId)
      .filter((p) => `${p.name} ${p.context || ""}`.toLocaleLowerCase("ar").includes(q))
      .slice(0, 8);
  }, [query, savedPlaces, excludeId]);

  const searchMap = async () => {
    const q = query.trim();
    if (q.length < 2) { setError("اكتب حرفين على الأقل للبحث في الخريطة"); return; }
    setSearching(true); setError(""); setMapResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=eg&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "ar" } });
      if (!res.ok) throw new Error("map search failed");
      const data = await res.json() as Array<{ display_name: string; name?: string; lat: string; lon: string }>;
      setMapResults(data.map((r) => ({
        name: (r.name || r.display_name.split(",")[0] || q).trim(),
        lat: Number(r.lat),
        lng: Number(r.lon),
        displayName: r.display_name,
      })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)));
    } catch {
      setError("تعذّر البحث في الخريطة الآن — حاول مرة أخرى");
    } finally {
      setSearching(false);
    }
  };

  if (selected || external) {
    const name = selected?.name || external?.name || "";
    const context = selected?.context || external?.displayName || "";
    return (
      <div className="psPicked">
        <span className="knownBadge">{selected ? "محفوظ" : "من الخريطة"}</span>
        <b>{name}</b>
        {context && <small>{context}</small>}
        <button type="button" className="psClear" onClick={() => { onClear(); setQuery(""); setMapResults([]); }}>✕</button>
      </div>
    );
  }

  return (
    <div className="parentSmartSearch">
      <div className="parentSearchRow">
        <input
          value={query}
          placeholder="ابحث باسم المول، المستشفى، المسجد، الجامعة، المحل..."
          onChange={(e) => { setQuery(e.target.value); setMapResults([]); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchMap(); } }}
        />
        <button type="button" className="offerMain" onClick={() => void searchMap()} disabled={searching}>
          {searching ? "جارٍ البحث..." : "بحث في الخريطة"}
        </button>
      </div>

      {localResults.length > 0 && (
        <div className="parentSearchGroup">
          <small className="parentSearchTitle">أماكن محفوظة في النظام</small>
          <ul className="psList parentSearchList">
            {localResults.map((p) => (
              <li key={p.id} onClick={() => onSelectSaved(p.id)}>
                <b>{p.name}</b>
                {p.context && <small> — {p.context}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mapResults.length > 0 && (
        <div className="parentSearchGroup">
          <small className="parentSearchTitle">نتائج الخريطة</small>
          <ul className="psList parentSearchList">
            {mapResults.map((p, i) => (
              <li key={`${p.lat}-${p.lng}-${i}`} onClick={() => onSelectExternal(p)}>
                <b>{p.name}</b>
                <small> — {p.displayName}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {query.trim() && localResults.length === 0 && mapResults.length === 0 && !searching && !error && (
        <p className="psEmpty">لا يوجد تطابق محفوظ. اضغط «بحث في الخريطة» للبحث في خريطة النظام.</p>
      )}
      {error && <p className="authError">{error}</p>}
    </div>
  );
}
