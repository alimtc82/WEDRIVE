import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { APP_VERSION } from "../lib/version";
import { BrandMark } from "../lib/brand";
import CaptainRegister from "./CaptainRegister";
import "../authV2.css";

type Screen = "welcome" | "signin" | "register" | "signupCustomer";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [captainReg, setCaptainReg] = useState(false);
  const [captainDone, setCaptainDone] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // شاشة تسجيل الكابتن الكاملة بالمستندات (بدون أي تغيير في التدفق)
  if (captainReg) {
    return <CaptainRegister onBack={() => setCaptainReg(false)} onDone={() => { setCaptainReg(false); setCaptainDone(true); setScreen("signin"); }} />;
  }

  const go = (s: Screen) => { setScreen(s); setError(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("من فضلك أدخل البريد وكلمة المرور");
      return;
    }
    if (screen === "signupCustomer" && !fullName.trim()) {
      setError("من فضلك أدخل الاسم بالكامل");
      return;
    }

    setBusy(true);
    try {
      if (screen === "signin") {
        await signIn(email.trim(), password);
      } else {
        // إنشاء حساب عميل — الكابتن له مسار مستقل بالمستندات
        await signUp({ email: email.trim(), password, fullName: fullName.trim(), phone: phone.trim(), role: "customer" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avWrap" dir="rtl">
      <div className="avGlow g1" /><div className="avGlow g2" />
      <div className="avInner">

        {screen === "welcome" ? (
          <>
            {/* الهيرو */}
            <div className="avHero">
              <BrandMark size={68} />
              <h1 className="avName">كابتن <span>بنها</span></h1>
              <p className="avTag">مشوارك داخل بنها على بُعد ضغطة</p>
              <div className="avChips">
                <span>📍 تتبع حي</span>
                <span>🤝 سعر تفاوضي</span>
                <span>🛡 كباتن موثقون</span>
              </div>
              <svg className="avRoute" viewBox="0 0 250 56" fill="none" aria-hidden="true">
                <path d="M14 46 C 70 46, 82 10, 140 12 S 220 34, 238 16" stroke="#1fbf8f" strokeWidth="2.5" strokeDasharray="7 7" strokeLinecap="round" opacity=".8" />
                <circle cx="14" cy="46" r="6" fill="#1fbf8f" />
                <circle cx="238" cy="16" r="6" fill="#3b82f6" />
              </svg>
            </div>

            {/* شيت تسجيل الدخول حسب الدور */}
            <div className="avSheet">
              <div className="avGrab" />
              {captainDone && (
                <p className="okMsg">تم رفع صور المستندات واستلام طلبك بنجاح ✓ حسابك الآن قيد المراجعة من الإدارة، وسيتم تفعيله بعد الموافقة.</p>
              )}
              <button type="button" className="avRole customer" onClick={() => go("signin")}>
                <span className="avRoleIc">🧍</span>
                <span className="avRoleTxt"><b>أنا عميل</b><small>سجّل دخولك واطلب مشوارك</small></span>
                <i className="avChev">‹</i>
              </button>
              <button type="button" className="avRole captain" onClick={() => go("signin")}>
                <span className="avRoleIc">🚗</span>
                <span className="avRoleTxt"><b>أنا كابتن</b><small>سجّل دخولك واستقبل الطلبات</small></span>
                <i className="avChev">‹</i>
              </button>

              <div className="avDivider"><span>جديد في كابتن بنها؟</span></div>
              <button type="button" className="avBtnNew" onClick={() => go("register")}>
                سجّل حساب جديد ✦
              </button>
            </div>
          </>
        ) : screen === "register" ? (
          <>
            {/* اختيار نوع الحساب الجديد */}
            <div className="avFormHead">
              <button type="button" className="avBack" onClick={() => go("welcome")} aria-label="رجوع">→</button>
              <div>
                <h2>إنشاء حساب جديد</h2>
                <p>اختر نوع الحساب المناسب ليك</p>
              </div>
            </div>

            <div className="avSheet">
              <div className="avBrandMini"><BrandMark size={30} /><b>كابتن بنها</b></div>
              <button type="button" className="avRole customer" onClick={() => go("signupCustomer")}>
                <span className="avRoleIc">🧍</span>
                <span className="avRoleTxt"><b>حساب عميل جديد</b><small>سجّل في دقيقة واطلب رحلتك فورًا</small></span>
                <i className="avChev">‹</i>
              </button>
              <button type="button" className="avRole captain" onClick={() => setCaptainReg(true)}>
                <span className="avRoleIc">🚗</span>
                <span className="avRoleTxt">
                  <b>حساب كابتن جديد</b>
                  <small>انضم لأسطولنا واكسب معنا</small>
                  <span className="avDocBadge">📄 يتطلب مستندات للتحقق</span>
                </span>
                <i className="avChev">‹</i>
              </button>
              <p className="avSwitch">عندك حساب بالفعل؟ <button type="button" onClick={() => go("signin")}>سجّل الدخول</button></p>
            </div>
          </>
        ) : (
          <>
            {/* شاشة الدخول / إنشاء حساب عميل */}
            <div className="avFormHead">
              <button type="button" className="avBack" onClick={() => go(screen === "signupCustomer" ? "register" : "welcome")} aria-label="رجوع">→</button>
              <div>
                <h2>{screen === "signin" ? "تسجيل الدخول" : "حساب عميل جديد"}</h2>
                <p>{screen === "signin" ? "أهلًا بعودتك إلى كابتن بنها" : "خطوة واحدة وتبدأ تطلب مشاويرك"}</p>
              </div>
            </div>

            <div className="avSheet">
              <div className="avBrandMini"><BrandMark size={30} /><b>كابتن بنها</b></div>
              {captainDone && (
                <p className="okMsg">تم استلام طلب الكابتن بنجاح ✓ حسابك قيد المراجعة وسيُفعَّل بعد الموافقة.</p>
              )}
              <form onSubmit={submit}>
                {screen === "signupCustomer" && (
                  <>
                    <div className="avField">
                      <i>👤</i>
                      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم بالكامل" autoComplete="name" />
                    </div>
                    <div className="avField">
                      <i>📱</i>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الموبايل 01xxxxxxxxx" inputMode="tel" autoComplete="tel" />
                    </div>
                  </>
                )}
                <div className="avField">
                  <i>✉️</i>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="البريد الإلكتروني" autoComplete="email" />
                </div>
                <div className="avField">
                  <i>🔒</i>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="كلمة المرور" autoComplete={screen === "signin" ? "current-password" : "new-password"} />
                </div>

                {error && <p className="authError" role="alert">{error}</p>}

                <button className="avSubmit" type="submit" disabled={busy}>
                  {busy ? "جارٍ..." : screen === "signin" ? "دخول" : "إنشاء الحساب"}
                </button>
              </form>
              <p className="avSwitch">
                {screen === "signin" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
                <button type="button" onClick={() => go(screen === "signin" ? "register" : "signin")}>
                  {screen === "signin" ? "سجّل حساب جديد" : "سجّل الدخول"}
                </button>
              </p>
            </div>
          </>
        )}

      </div>
      <p className="verTag">الإصدار {APP_VERSION}</p>
    </div>
  );
}
