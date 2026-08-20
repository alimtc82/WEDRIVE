import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { BrandMark } from "../lib/brand";

const roleLabel: Record<string, string> = {
  customer: "عميل",
  captain: "كابتن",
  admin: "أدمن",
};

function applyTheme(t: "light" | "dark") {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("wd-theme", t); } catch { /* تجاهل */ }
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "light" ? "#f2f5fa" : "#0f1729");
}

export default function TopBar({ title }: { title: string }) {
  const { profile, signOut } = useAuth();
  const initial = (profile?.full_name || "؟").trim().charAt(0) || "؟";
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    (document.documentElement.dataset.theme as "light" | "dark") || "light");

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <header className="topbar">
      <div className="topbarBrand">
        <BrandMark size={30} />
        <b>{title}</b>
      </div>
      <div className="topbarUser">
        <button className="themeToggle" onClick={toggleTheme}
          title={theme === "light" ? "الوضع الليلي" : "الوضع النهاري"}
          aria-label={theme === "light" ? "الوضع الليلي" : "الوضع النهاري"}>
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        <div className="uAvatar">{initial}</div>
        <div className="uMeta">
          <b>{profile?.full_name || "بدون اسم"}</b>
          <span>{roleLabel[profile?.role || "customer"]}</span>
        </div>
        <button className="signOut" onClick={() => signOut()} title="تسجيل الخروج">خروج</button>
      </div>
    </header>
  );
}
