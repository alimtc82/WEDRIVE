const ROUTERS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
];

function validCoord(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const raw = typeof req.query.points === "string" ? req.query.points : "";
  const points = raw.split(";").filter(Boolean);
  if (points.length < 2 || points.length > 5) {
    return res.status(400).json({ error: "INVALID_POINTS" });
  }

  for (const point of points) {
    const [lng, lat] = point.split(",");
    if (!validCoord(lng, -180, 180) || !validCoord(lat, -90, 90)) {
      return res.status(400).json({ error: "INVALID_COORDINATES" });
    }
  }

  const suffix = `${points.join(";")}?overview=full&geometries=geojson&steps=false`;

  for (const base of ROUTERS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      let upstream;
      try {
        upstream = await fetch(base + suffix, {
          signal: ctrl.signal,
          headers: { "User-Agent": "WEDRIVE/1.0" },
        });
      } finally {
        clearTimeout(timer);
      }
      if (!upstream.ok) continue;
      const data = await upstream.json();
      const route = data?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      res.setHeader("Cache-Control", "public, max-age=10, s-maxage=30, stale-while-revalidate=60");
      return res.status(200).json({
        coordinates: coords,
        distance_m: Number(route.distance) || null,
        duration_s: Number(route.duration) || null,
      });
    } catch {
      // Try the next provider.
    }
  }

  return res.status(503).json({ error: "ROUTE_UNAVAILABLE" });
}
