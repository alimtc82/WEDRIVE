import { useEffect, useRef, useState } from "react";
import "./customerHelpGuide.css";

const HELP_SESSION_KEY = "wd-customer-help-v2";

export default function CustomerHelpGuide({ replayKey = 0 }: { replayKey?: number }) {
  const [visible, setVisible] = useState(false);
  const firstReplay = useRef(replayKey);

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

  if (!visible) return null;

  return (
    <aside className="cbHelpToast" role="status" aria-live="polite" dir="rtl">
      <button className="cbHelpClose" type="button" onClick={close} aria-label="إغلاق المساعدة">×</button>
      <div className="cbDriverAvatar" aria-label="مساعد كابتن بنها">
        <span className="cbDriverCap" />
        <span className="cbDriverFace"><i className="cbEye left"/><i className="cbEye right"/><i className="cbSmile"/></span>
        <span className="cbDriverUniform" />
      </div>
      <div className="cbHelpCopy">
        <b>أهلاً بيك في كابتن بنها 👋</b>
        <span>تقدر تغيّر نقطة الانطلاق ونقطة الوصول من <strong>البحث الذكي هنا</strong>، أو تختار المكان مباشرة من الخريطة.</span>
      </div>
      <span className="cbHelpArrow" aria-hidden="true">↑</span>
    </aside>
  );
}
