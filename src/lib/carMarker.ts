// أيقونة سيارة موحّدة (SVG) — تتلوّن حسب الحالة وتدور حسب الاتجاه
export function carMarkerSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="white" stroke="${color}" stroke-width="1.5"/>
    <path fill="${color}" d="M12 3l3 5h-6z" opacity="0.9"/>
    <path fill="${color}" d="M7 12.5l.9-2.7c.1-.3.4-.5.7-.5h6.8c.3 0 .6.2.7.5l.9 2.7.5.3c.3.1.5.4.5.8v2c0 .2-.2.4-.4.4H16c0 .6-.5 1-1 1s-1-.4-1-1h-4c0 .6-.5 1-1 1s-1-.4-1-1h-1.1c-.2 0-.4-.2-.4-.4v-2c0-.4.2-.7.5-.8zm1.1-.5h7.8l-.6-1.8H8.7z"/>
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
    (label ? `<b>${label}</b>` : "");
  return el;
}
