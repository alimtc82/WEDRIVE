import { useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadCaptainDoc } from "../lib/captainDocs";
import DocUpload from "../components/DocUpload";
import UsagePoliciesModal, { TERMS_VERSION } from "../components/UsagePoliciesModal";
import { APP_VERSION } from "../lib/version";
import "../captainSuccess.css";

interface Props { onDone: () => void; onBack: () => void; }
type Docs = Record<string, File | null>;
const DOC_SLOTS = [
  { key: "id_card_front", label: "البطاقة - الوجه" }, { key: "id_card_back", label: "البطاقة - الظهر" },
  { key: "vehicle_license_front", label: "رخصة السيارة - الوجه" }, { key: "vehicle_license_back", label: "رخصة السيارة - الظهر" },
  { key: "driver_license_front", label: "رخصة القيادة - الوجه" }, { key: "driver_license_back", label: "رخصة القيادة - الظهر" },
  { key: "selfie_photo", label: "صورة الكابتن الشخصية" }, { key: "car_front_photo", label: "السيارة من الأمام" },
  { key: "car_back_photo", label: "السيارة من الخلف" }, { key: "plate_photo", label: "اللوحة المعدنية" },
];

function maxYears(years: number): string { const d = new Date(); d.setFullYear(d.getFullYear() + years); return d.toISOString().split("T")[0]; }

export default function CaptainRegister({ onDone, onBack }: Props) {
  const [step, setStep] = useState(1); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(""); const [err, setErr] = useState("");
  const [fullName, setFullName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPass, setConfirmPass] = useState(""); const [showPass, setShowPass] = useState(false); const [showPass2, setShowPass2] = useState(false);
  const [docs, setDocs] = useState<Docs>({}); const [idExpiry, setIdExpiry] = useState(""); const [vehExpiry, setVehExpiry] = useState(""); const [drvExpiry, setDrvExpiry] = useState("");
  const [agreed, setAgreed] = useState(false); const [policyOpen, setPolicyOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const validateStep1 = () => {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) return "أكمل كل البيانات";
    if (password.length < 6) return "كلمة المرور 6 أحرف على الأقل";
    if (password !== confirmPass) return "كلمتا المرور غير متطابقتين";
    return "";
  };
  const validateStep2 = () => {
    for (const s of DOC_SLOTS) if (!docs[s.key]) return "من فضلك ارفع كل الصور المطلوبة";
    if (!idExpiry || !vehExpiry || !drvExpiry) return "أدخل تواريخ انتهاء المستندات";
    if (idExpiry <= today || vehExpiry <= today || drvExpiry <= today) return "أحد المستندات منتهي — يجب أن تكون كل المستندات سارية";
    if (vehExpiry > maxYears(3)) return "تأكد من تاريخ رخصة السيارة";
    if (drvExpiry > maxYears(10)) return "تأكد من تاريخ رخصة القيادة";
    if (idExpiry > maxYears(7)) return "تأكد من تاريخ البطاقة الشخصية";
    return "";
  };
  const next = () => { const e = step === 1 ? validateStep1() : step === 2 ? validateStep2() : ""; if (e) { setErr(e); return; } setErr(""); setStep(step + 1); };

  const submit = async () => {
    if (!agreed) { setErr("يجب الموافقة على سياسات الاستخدام قبل إرسال الطلب"); return; }
    const ve = validateStep2(); if (ve) { setErr(ve); setStep(2); return; }
    setErr(""); setBusy(true);
    try {
      const { data: auth, error: authErr } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim(), role: "captain", terms_accepted: true, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } },
      });
      if (authErr) throw new Error(mapErr(authErr.message));
      const uid = auth.user?.id; if (!uid) throw new Error("تعذّر إنشاء الحساب");
      let sess = auth.session;
      if (!sess) {
        const { data: si, error: siErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (siErr) throw new Error("تم إنشاء الحساب لكن تعذّر تسجيل الدخول لرفع المستندات: " + siErr.message);
        sess = si.session;
      }
      await ensureCaptainRow(uid);
      const paths: Record<string, string> = {}; let done = 0;
      for (const s of DOC_SLOTS) {
        done++; setProgress(`جارٍ رفع صورة ${done} من ${DOC_SLOTS.length}...`);
        try { paths[s.key] = await uploadCaptainDoc(uid, s.key, docs[s.key]!); }
        catch (upErr) { throw new Error(`فشل رفع صورة (${s.label}): ${upErr instanceof Error ? upErr.message : ""}`); }
      }
      setProgress("جارٍ حفظ البيانات...");
      const { error: saveErr } = await supabase.rpc("save_captain_docs", {
        p_id_card_front: paths.id_card_front, p_id_card_back: paths.id_card_back, p_id_card_expiry: idExpiry,
        p_vehicle_license_front: paths.vehicle_license_front, p_vehicle_license_back: paths.vehicle_license_back, p_vehicle_license_expiry: vehExpiry,
        p_driver_license_front: paths.driver_license_front, p_driver_license_back: paths.driver_license_back, p_driver_license_expiry: drvExpiry,
        p_selfie_photo: paths.selfie_photo, p_car_front_photo: paths.car_front_photo, p_car_back_photo: paths.car_back_photo, p_plate_photo: paths.plate_photo,
      });
      if (saveErr) throw new Error(saveErr.message);
      setStep(4);
    } catch (e) { setErr(e instanceof Error ? e.message : "حدث خطأ"); }
    finally { setBusy(false); setProgress(""); }
  };

  if (step === 4) return <div className="authWrap" dir="rtl"><div className="authCard"><div className="capSuccess"><div className="capSuccessIc">✓</div><h2>تم رفع صور المستندات بنجاح</h2><p>تم استلام طلبك ✓ حسابك الآن قيد المراجعة من الإدارة، وسيتم تفعيله بعد الموافقة.</p><button className="authSubmit" onClick={onDone}>تسجيل الدخول</button></div></div><p className="verTag">الإصدار {APP_VERSION}</p></div>;

  return (
    <div className="authWrap" dir="rtl">
      <div className="authCard wide">
        <div className="authBrand"><span className="brandMark">WE</span><div><b>تسجيل كابتن جديد</b><small>الخطوة {step} من 3</small></div></div>
        <div className="wizBar"><span className={step >= 1 ? "on" : ""} /><span className={step >= 2 ? "on" : ""} /><span className={step >= 3 ? "on" : ""} /></div>
        {step === 1 && <div className="authForm">
          <label>الاسم بالكامل<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الرباعي" /></label>
          <label>رقم الهاتف<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" inputMode="tel" /></label>
          <label>البريد الإلكتروني<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" /></label>
          <label>كلمة المرور<span className="pwWrap"><input value={password} onChange={(e) => setPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="••••••••" autoComplete="new-password" /><button type="button" className="pwEye" onClick={() => setShowPass(!showPass)}>{showPass ? "🙈" : "👁"}</button></span></label>
          <label>تأكيد كلمة المرور<span className="pwWrap"><input value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} type={showPass2 ? "text" : "password"} placeholder="••••••••" autoComplete="new-password" /><button type="button" className="pwEye" onClick={() => setShowPass2(!showPass2)}>{showPass2 ? "🙈" : "👁"}</button></span></label>
        </div>}
        {step === 2 && <div className="authForm">
          <p className="stepHint">ارفع صور واضحة للمستندات، وكلها يجب أن تكون سارية.</p>
          <div className="docGroup"><b>البطاقة الشخصية</b><div className="docRow"><DocUpload label="الوجه" file={docs.id_card_front} onPick={(f) => setDocs({ ...docs, id_card_front: f })} /><DocUpload label="الظهر" file={docs.id_card_back} onPick={(f) => setDocs({ ...docs, id_card_back: f })} /></div><label>تاريخ انتهاء البطاقة<input type="date" value={idExpiry} min={today} onChange={(e) => setIdExpiry(e.target.value)} /></label></div>
          <div className="docGroup"><b>رخصة السيارة</b><div className="docRow"><DocUpload label="الوجه" file={docs.vehicle_license_front} onPick={(f) => setDocs({ ...docs, vehicle_license_front: f })} /><DocUpload label="الظهر" file={docs.vehicle_license_back} onPick={(f) => setDocs({ ...docs, vehicle_license_back: f })} /></div><label>تاريخ انتهاء رخصة السيارة<input type="date" value={vehExpiry} min={today} onChange={(e) => setVehExpiry(e.target.value)} /></label></div>
          <div className="docGroup"><b>رخصة القيادة</b><div className="docRow"><DocUpload label="الوجه" file={docs.driver_license_front} onPick={(f) => setDocs({ ...docs, driver_license_front: f })} /><DocUpload label="الظهر" file={docs.driver_license_back} onPick={(f) => setDocs({ ...docs, driver_license_back: f })} /></div><label>تاريخ انتهاء رخصة القيادة<input type="date" value={drvExpiry} min={today} onChange={(e) => setDrvExpiry(e.target.value)} /></label></div>
          <div className="docGroup"><b>صورة الكابتن الشخصية</b><p className="docWarn">⚠ صورة واضحة للوجه، بدون فلتر وبدون نظارة</p><div className="docRow"><DocUpload label="صورة شخصية" file={docs.selfie_photo} onPick={(f) => setDocs({ ...docs, selfie_photo: f })} /></div></div>
          <div className="docGroup"><b>صور السيارة</b><div className="docRow"><DocUpload label="من الأمام" file={docs.car_front_photo} onPick={(f) => setDocs({ ...docs, car_front_photo: f })} /><DocUpload label="من الخلف" file={docs.car_back_photo} onPick={(f) => setDocs({ ...docs, car_back_photo: f })} /></div><div className="docRow"><DocUpload label="اللوحة المعدنية (واضحة)" file={docs.plate_photo} onPick={(f) => setDocs({ ...docs, plate_photo: f })} /></div></div>
        </div>}
        {step === 3 && <div className="authForm">
          <div className="termsBox"><h4>سياسات استخدام الكابتن</h4><p>تتضمن السياسات التزامات السلامة والقيادة القانونية، صلاحية المستندات والمركبة، حماية العميل وبياناته، التتبع أثناء الاتصال والرحلات، الأسعار، المخالفات، الحوادث، وحدود مسؤولية كل طرف.</p><p>افتح النص الكامل قبل الموافقة للتأكد من فهم جميع البنود.</p></div>
          <label className="policyAgree"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>أوافق على <button type="button" className="policyLink" onClick={(e) => { e.preventDefault(); setPolicyOpen(true); }}>سياسات الاستخدام</button><small className="policyHint">الموافقة إلزامية لإرسال طلب التسجيل.</small></span></label>
        </div>}
        {err && <p className="authError" role="alert">{err}</p>}
        <div className="wizBtns">{step > 1 && <button type="button" className="wizBack" onClick={() => setStep(step - 1)} disabled={busy}>السابق</button>}{step === 1 && <button type="button" className="wizBack" onClick={onBack}>إلغاء</button>}{step < 3 ? <button type="button" className="authSubmit" onClick={next}>التالي</button> : <button type="button" className="authSubmit" onClick={submit} disabled={busy}>{busy ? (progress || "جارٍ الإرسال...") : "إرسال الطلب"}</button>}</div>
      </div>
      <p className="verTag">الإصدار {APP_VERSION}</p>
      <UsagePoliciesModal role="captain" open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </div>
  );
}

function mapErr(m: string) { if (m.includes("already registered")) return "هذا البريد مسجّل بالفعل"; if (m.includes("rate limit")) return "محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة"; return m; }
async function ensureCaptainRow(uid: string): Promise<void> { for (let i = 0; i < 5; i++) { const { data } = await supabase.from("captains").select("id").eq("id", uid).maybeSingle(); if (data) return; await new Promise((r) => setTimeout(r, 500)); await supabase.from("captains").insert({ id: uid }).select(); } }
