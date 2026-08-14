import { useAuth } from "./lib/AuthContext";
import AuthPage from "./pages/AuthPage";
import CustomerApp from "./roles/CustomerApp";
import CaptainApp from "./roles/CaptainApp";
import AdminApp from "./roles/AdminApp";

export default function RoleRouter() {
  const { session, profile, loading } = useAuth();

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

  switch (profile.role) {
    case "captain":
      return <CaptainApp />;
    case "admin":
      return <AdminApp />;
    default:
      return <CustomerApp />;
  }
}
