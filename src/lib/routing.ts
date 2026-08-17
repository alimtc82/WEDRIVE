// يجلب مسار الطريق الحقيقي بين نقطتين من OSRM (مجاني)
// مع تحويل للخط المستقيم تلقائيًا لو فشل الطلب
export type Coord = [number, number]; // [lng, lat]

export async function fetchRoute(from: Coord, to: Coord): Promise<Coord[]> {
  const straight: Coord[] = [from, to];
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from[0]},${from[1]};${to[0]},${to[1]}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return straight;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 1) {
      return coords as Coord[];
    }
    return straight;
  } catch {
    return straight; // fallback عند أي خطأ
  }
}
