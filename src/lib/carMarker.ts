import { CAR_MOVING, CAR_OFFLINE, CAR_ONLINE } from "../assets/v1172/mapCars";
import "../mapAssetsV1172.css";

const BLUE = "#3b82f6";
const GREEN = "#1fbf8f";
const GRAY = "#93a1c0";

export function carMarkerSvg(color: string): string {
  const c = color.toLowerCase();
  if (c === GREEN) return CAR_MOVING;
  if (c === GRAY) return CAR_OFFLINE;
  return CAR_ONLINE;
}

export function carColor(_inTrip: boolean, moving: boolean): string {
  return moving ? GREEN : BLUE;
}

export function makeCarElement(color: string, heading: number | null, label?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "carMarker";
  el.innerHTML = `<img class="carImg" src="${carMarkerSvg(color)}" width="56" height="20" alt=""/>` + (label ? `<b></b>` : "");
  const img = el.querySelector("img") as HTMLImageElement | null;
  if (img && heading != null && Number.isFinite(heading)) img.style.transform = `rotate(${heading - 90}deg)`;
  const b = el.querySelector("b");
  if (b && label) b.textContent = label;
  return el;
}
