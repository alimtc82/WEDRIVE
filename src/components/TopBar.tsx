import { useAuth } from "../lib/AuthContext";

const roleLabel: Record<string, string> = {
  customer: "عميل",
  captain: "كابتن",
  admin: "أدمن",
};

export default function TopBar({ title }: { title: string }) {
  const { profile, signOut } = useAuth();
  const initial = (profile?.full_name || "؟").trim().charAt(0) || "؟";

  return (
    <header className="topbar">
      <div className="topbarBrand">
        <span className="brandMark sm">WE</span>
        <b>{title}</b>
      </div>
      <div className="topbarUser">
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
