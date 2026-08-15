import { useAuth } from "./lib/AuthContext";
import AuthPage from "./pages/AuthPage";
import CustomerApp from "./roles/CustomerApp";
import CaptainApp from "./roles/CaptainApp";
import AdminApp from "./roles/AdminApp";

export default function RoleRouter() {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="fullCenter" dir="rtl">
        <div className="spinner" aria-label="جارٍ التحميل" />
      </div>
    );
  }

  if (!session) return <AuthPage />;

  if (!profile) {
    return (
      <div className="fullCenter" dir="rtl">
        <p>جارٍ تجهيز حسابك...</p>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="fullCenter" dir="rtl">
        <section className="inactiveCard">
          <span className="brandMark">WE</span>
          <h1>{profile.role === "captain" ? "حساب الكابتن قيد المراجعة" : "الحساب غير نشط"}</h1>
          <p>
            {profile.role === "captain"
              ? "تم استلام طلب التسجيل. ستتمكن من استقبال الرحلات بعد اعتماد الحساب من الإدارة."
              : "تواصل مع الإدارة لإعادة تفعيل الحساب."}
          </p>
          <button type="button" className="signOut" onClick={() => signOut()}>
            تسجيل الخروج
          </button>
        </section>
      </div>
    );
  }

  switch (profile.role) {
    case "captain":
      return <CaptainApp />;
    case "admin":
      return <AdminApp />;
    default:
      return <CustomerApp />;
  }
}
