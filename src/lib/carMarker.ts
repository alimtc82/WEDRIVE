// أيقونة سيارة موحّدة (SVG) — منظر علوي + أسهم اتجاه، تتلوّن حسب الحالة وتدور حسب heading
// المقدمة لأعلى (شمال) — تدوير CSS heading (azimuth: 0=شمال، عقارب الساعة) يتوافق معها مباشرة
export function carMarkerSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="22" fill="white" stroke="${color}" stroke-width="2"/>
  <!-- أسهم الاتجاه أمام المقدمة -->
  <path d="M16.5 14.5 L24 8.5 L31.5 14.5" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
  <path d="M18.5 18 L24 13.5 L29.5 18" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
  <!-- جسم السيارة (منظر علوي) -->
  <rect x="17" y="20" width="14" height="23" rx="4.5" fill="${color}"/>
  <!-- الزجاج الأمامي: منحرف عريض يدل على الأمام -->
  <path d="M19.2 24 L28.8 24 L27.4 27.6 L20.6 27.6 Z" fill="white"/>
  <!-- الزجاج الخلفي: أصغر -->
  <path d="M20.2 36 L27.8 36 L27 39.2 L21 39.2 Z" fill="white" opacity="0.8"/>
  <!-- العجلات -->
  <rect x="15.1" y="24.2" width="2.4" height="4.6" rx="1.1" fill="#1e293b"/>
  <rect x="30.5" y="24.2" width="2.4" height="4.6" rx="1.1" fill="#1e293b"/>
  <rect x="15.1" y="34.4" width="2.4" height="4.6" rx="1.1" fill="#1e293b"/>
  <rect x="30.5" y="34.4" width="2.4" height="4.6" rx="1.1" fill="#1e293b"/>
</svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

// لون السيارة حسب الحالة
export function carColor(inTrip: boolean, moving: boolean): string {
  if (inTrip) return "#3b82f6";      // أزرق: في رحلة
  if (moving) return "#1fbf8f";      // أخضر: متحرك
  return "#93a1c0";                   // رمادي: ثابت
}

// عنصر ماركر كامل (سيارة + اسم) قابل للدوران
export function makeCarElement(color: string, heading: number | null, label?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "carMarker";
  const rot = heading != null ? `transform:rotate(${heading}deg)` : "";
  el.innerHTML =
    `<img class="carImg" src="${carMarkerSvg(color)}" width="36" height="36" style="${rot}" alt=""/>` +
    (label ? `<b></b>` : "");
  const b = el.querySelector("b");
  if (b && label) b.textContent = label;
  return el;
}
