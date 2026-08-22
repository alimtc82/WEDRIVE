import { CAR_MOVING, CAR_OFFLINE, CAR_ONLINE } from "../assets/v1172/mapCars";
import "../mapAssetsV1172.css";

const BLUE = "#3b82f6";
const GREEN = "#1fbf8f";
const GRAY = "#93a1c0";

// يحافظ على واجهة الدالة القديمة، لكن يعرض الآن الصور التي زوّدنا بها المستخدم.
export function carMarkerSvg(color: string): string {
  const c = color.toLowerCase();
  if (c === GREEN) return CAR_MOVING;
  if (c === GRAY) return CAR_OFFLINE;
  return CAR_ONLINE;
}

// الكباتن الذين يصلون إلى خريطة المتصلين هم متصلون بالفعل:
// أزرق = متصل وثابت، أخضر = متحرك. الرمادي مخصص لغير المتصل.
export function carColor(_inTrip: boolean, moving: boolean): string {
  return moving ? GREEN : BLUE;
}

export function makeCarElement(color: string, _heading: number | null, label?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "carMarker";
  el.innerHTML = `<img class="carImg" src="${carMarkerSvg(color)}" width="56" height="30" alt=""/>` + (label ? `<b></b>` : "");
  const b = el.querySelector("b");
  if (b && label) b.textContent = label;
  return el;
}
