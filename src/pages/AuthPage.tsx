import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import type { UserRole } from "../lib/types";
import { APP_VERSION } from "../lib/version";
import CaptainRegister from "./CaptainRegister";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [captainReg, setCaptainReg] = useState(false);
  const [captainDone, setCaptainDone] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // شاشة تسجيل الكابتن الكاملة
  if (captainReg) {
    return <CaptainRegister onBack={() => setCaptainReg(false)} onDone={() => { setCaptainReg(false); setCaptainDone(true); setMode("signin"); }} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("من فضلك أدخل البريد وكلمة المرور");
      return;
    }
    if (mode === "signup" && !fullName.trim()) {
      setError("من فضلك أدخل الاسم بالكامل");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp({ email: email.trim(), password, fullName: fullName.trim(), phone: phone.trim(), role });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authWrap" dir="rtl">
      <div className="authCard">
        <div className="authBrand">
          <span className="brandMark">WE</span>
          <div>
            <b>WE DRIVE</b>
            <small>لوحة إدارة المشاوير</small>
          </div>
        </div>

        {captainDone && (
          <p className="okMsg">تم استلام طلبك ✓ حسابك قيد المراجعة من الإدارة، وسنفعّله بعد الموافقة.</p>
        )}
        <div className="authTabs">
          <button className={mode === "signin" ? "on" : ""} onClick={() => { setMode("signin"); setError(""); }} type="button">
            تسجيل الدخول
          </button>
          <button className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setError(""); }} type="button">
            حساب جديد
          </button>
        </div>

        <form onSubmit={submit} className="authForm">
          {mode === "signup" && (
            <>
              <label>الاسم بالكامل
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="أحمد حسن" />
              </label>
              <label>رقم الموبايل
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" inputMode="tel" />
              </label>
              <div className="rolePick">
                <span>أنا</span>
                <button type="button" className={role === "customer" ? "on" : ""} onClick={() => setRole("customer")}>عميل</button>
                <button type="button" className={role === "captain" ? "on" : ""} onClick={() => setCaptainReg(true)}>كابتن</button>
              </div>
            </>
          )}

          <label>البريد الإلكتروني
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" autoComplete="email" />
          </label>
          <label>كلمة المرور
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </label>

          {error && <p className="authError" role="alert">{error}</p>}

          <button className="authSubmit" type="submit" disabled={busy}>
            {busy ? "جارٍ..." : mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>

        <p className="authNote">
          {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
          <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
            {mode === "signin" ? "أنشئ حساب" : "سجّل الدخول"}
          </button>
        </p>
      </div>
      <p className="verTag">الإصدار {APP_VERSION}</p>
    </div>
  );
}
