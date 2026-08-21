import { useEffect, useRef, useState } from "react";
import "./customerHelpGuide.css";
import "./customerHelpGuideV1171.css";

const HELP_SESSION_KEY = "wd-customer-help-v4";
type DragState = { startX: number; startY: number; posX: number; posY: number; left: number; right: number; top: number; bottom: number };

export default function CustomerHelpGuide({ replayKey = 0 }: { replayKey?: number }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [moved, setMoved] = useState(false);
  const firstReplay = useRef(replayKey);
  const toastRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    let alreadyShown = false;
    try { alreadyShown = sessionStorage.getItem(HELP_SESSION_KEY) === "1"; } catch { /* ignore */ }
    if (alreadyShown) return;
    const t = window.setTimeout(() => setVisible(true), 850);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (replayKey === firstReplay.current) return;
    firstReplay.current = replayKey;
    setPosition({ x: 0, y: 0 });
    setMoved(false);
    setVisible(true);
  }, [replayKey]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      setVisible(false);
      try { sessionStorage.setItem(HELP_SESSION_KEY, "1"); } catch { /* ignore */ }
    }, 15000);
    return () => window.clearTimeout(t);
  }, [visible, replayKey]);

  const close = () => {
    setVisible(false);
    try { sessionStorage.setItem(HELP_SESSION_KEY, "1"); } catch { /* ignore */ }
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const el = toastRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: position.x, posY: position.y, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    let dx = e.clientX - d.startX;
    let dy = e.clientY - d.startY;
    const pad = 8;
    dx = Math.max(pad - d.left, Math.min(window.innerWidth - pad - d.right, dx));
    dy = Math.max(pad - d.top, Math.min(window.innerHeight - pad - d.bottom, dy));
    setPosition({ x: d.posX + dx, y: d.posY + dy });
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) setMoved(true);
  };

  const endDrag = () => { dragRef.current = null; };

  if (!visible) return null;

  return (
    <aside
      ref={toastRef}
      className={`cbHelpToast cbHelpToastV1171 ${moved ? "moved" : ""}`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      role="status"
      aria-live="polite"
      dir="rtl"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      title="اسحب من أي مكان لتحريك مساعد كابتن بنها"
    >
      <button className="cbHelpClose" type="button" onClick={close} aria-label="إغلاق المساعدة">×</button>
      <div className="cbDriverAvatar" role="img" aria-label="مساعد كابتن بنها" />
      <div className="cbHelpCopy">
        <b>أهلاً بيك في كابتن بنها 👋</b>
        <span>تقدر تغيّر نقطة الانطلاق أو الوصول من <strong>البحث الذكي</strong>، وتسحب دبوس الانطلاق مباشرة لتغيير مكانك، أو تختار أي نقطة من الخريطة.</span>
        <small>↕ اسحب المساعد من أي مكان لتحريكه</small>
      </div>
    </aside>
  );
}
