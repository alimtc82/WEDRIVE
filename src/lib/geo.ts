import type { TripKind } from "./types";

export interface LatLng {
  lat: number;
  lng: number;
}

// المسافة المباشرة بين نقطتين بالكيلومتر (معادلة Haversine) — تُحسب مجانًا في المتصفح
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(h));
  return Math.round(d * 100) / 100;
}

// تخمين مبدئي لنوع الرحلة: أطول من 30 كم يُعتبر بين المدن (يمكن للعميل تغييره)
export function guessKind(distanceKm: number): TripKind {
  return distanceKm > 30 ? "intercity" : "in_city";
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
