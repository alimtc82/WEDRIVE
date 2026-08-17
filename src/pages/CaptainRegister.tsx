import { useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadCaptainDoc } from "../lib/captainDocs";
import DocUpload from "../components/DocUpload";
import { APP_VERSION } from "../lib/version";
import "../captainSuccess.css";

interface Props { onDone: () => void; onBack: () => void; }

type Docs = Record<string, File | null>;
const DOC_SLOTS = [
  { key: "id_card_front", label: "البطاقة - الوجه" },
  { key: "id_card_back", label: "البطاقة - الظهر" },
  { key: "vehicle_license_front", label: "رخصة السيارة - الوجه" },
  { key: "vehicle_license_back", label: "رخصة السيارة - الظهر" },
  { key: "driver_license_front", label: "رخصة القيادة - الوجه" },
  { key: "driver_license_back", label: "رخصة القيادة - الظهر" },
  { key: "selfie_photo", label: "صورة الكابتن الشخصية" },
  { key: "car_front_photo", label: "السيارة من الأمام" },
  { key: "car_back_photo", label: "السيارة من الخلف" },
  { key: "plate_photo", label: "اللوحة المعدنية" },
];

// حد أقصى لتاريخ الانتهاء = N سنوات من اليوم (yyyy-mm-dd)
function maxYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

export default function CaptainRegister({ onDone, onBack }: Props) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");

  // بيانات الحساب
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // المستندات وتواريخ الانتهاء
  const [docs, setDocs] = useState<Docs>({});
  const [idExpiry, setIdExpiry] = useState("");
  const [vehExpiry, setVehExpiry] = useState("");
  const [drvExpiry, setDrvExpiry] = useState("");

  const [agreed, setAgreed] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const validateStep1 = () => {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) return "أكمل كل البيانات";
    if (password.length < 6) return "كلمة المرور 6 أحرف على الأقل";
    return "";
  };

  const validateStep2 = () => {
    for (const s of DOC_SLOTS) if (!docs[s.key]) return "من فضلك ارفع كل الصور المطلوبة";
    if (!idExpiry || !vehExpiry || !drvExpiry) return "أدخل تواريخ انتهاء المستندات";
    if (idExpiry <= today || vehExpiry <= today || drvExpiry <= today)
      return "أحد المستندات منتهي — يجب أن تكون كل المستندات سارية";
    // حدود الصلاحية القصوى من يوم التسجيل (بدون إشعار مسبق — رسالة عند الخطأ فقط)
    if (vehExpiry > maxYears(3)) return "تأكد من تاريخ رخصة السيارة";
    if (drvExpiry > maxYears(10)) return "تأكد من تاريخ رخصة القيادة";
    if (idExpiry > maxYears(7)) return "تأكد من تاريخ البطاقة الشخصية";
    return "";
  };

  const next = () => {
    const e = step === 1 ? validateStep1() : step === 2 ? validateStep2() : "";
    if (e) { setErr(e); return; }
    setErr(""); setStep(step + 1);
  };

  const submit = async () => {
    if (!agreed) { setErr("يجب الموافقة على شروط العمل"); return; }
    // إعادة التحقق من التواريخ عند الإرسال أيضًا
    const ve = validateStep2();
    if (ve) { setErr(ve); setStep(2); return; }
    setErr(""); setBusy(true);
    try {
      // 1) إنشاء الحساب بدور كابتن
      const { data: auth, error: authErr } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim(), role: "captain" } },
      });
      if (authErr) throw new Error(mapErr(authErr.message));
      const uid = auth.user?.id;
      if (!uid) throw new Error("تعذّر إنشاء الحساب");

      // التأكد من وجود جلسة نشطة (لازمة لصلاحيات الرفع). لو مش موجودة، سجّل الدخول.
      let sess = auth.session;
      if (!sess) {
        const { data: si, error: siErr } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (siErr) throw new Error("تم إنشاء الحساب لكن تعذّر تسجيل الدخول لرفع المستندات: " + siErr.message);
        sess = si.session;
      }

      // انتظار قصير لضمان تنفيذ trigger إنشاء صف الكابتن، ثم التأكد من وجوده
      await ensureCaptainRow(uid);

      // 2) رفع صور المستندات (مع رسالة تقدّم وخطأ واضحة لكل صورة)
      const paths: Record<string, string> = {};
      let done = 0;
      for (const s of DOC_SLOTS) {
        done++;
        setProgress(`جارٍ رفع صورة ${done} من ${DOC_SLOTS.length}...`);
        try {
          paths[s.key] = await uploadCaptainDoc(uid, s.key, docs[s.key]!);
        } catch (upErr) {
          throw new Error(`فشل رفع صورة (${s.label}): ${upErr instanceof Error ? upErr.message : ""}`);
        }
      }
      setProgress("جارٍ حفظ البيانات...");

      // 3) حفظ بيانات الكابتن عبر دالة آمنة (تتجاوز مشكلة توقيت RLS)
      const { error: saveErr } = await supabase.rpc("save_captain_docs", {
        p_id_card_front: paths.id_card_front,
        p_id_card_back: paths.id_card_back,
        p_id_card_expiry: idExpiry,
        p_vehicle_license_front: paths.vehicle_license_front,
        p_vehicle_license_back: paths.vehicle_license_back,
        p_vehicle_license_expiry: vehExpiry,
        p_driver_license_front: paths.driver_license_front,
        p_driver_license_back: paths.driver_license_back,
        p_driver_license_expiry: drvExpiry,
        p_selfie_photo: paths.selfie_photo,
        p_car_front_photo: paths.car_front_photo,
        p_car_back_photo: paths.car_back_photo,
        p_plate_photo: paths.plate_photo,
      });
      if (saveErr) throw new Error(saveErr.message);

      // 4) شاشة نجاح واضحة
      setStep(4);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  // شاشة النجاح بعد رفع المستندات وحفظها
  if (step === 4) {
    return (
      <div className="authWrap" dir="rtl">
        <div className="authCard">
          <div className="capSuccess">
            <div className="capSuccessIc">✓</div>
            <h2>تم رفع صور المستندات بنجاح</h2>
            <p>تم استلام طلبك ✓ حسابك الآن قيد المراجعة من الإدارة، وسيتم تفعيله بعد الموافقة.</p>
            <button className="authSubmit" onClick={onDone}>تسجيل الدخول</button>
          </div>
        </div>
        <p className="verTag">الإصدار {APP_VERSION}</p>
      </div>
    );
  }

  return (
    <div className="authWrap" dir="rtl">
      <div className="authCard wide">
        <div className="authBrand">
          <span className="brandMark">WE</span>
          <div><b>تسجيل كابتن جديد</b><small>الخطوة {step} من 3</small></div>
        </div>

        <div className="wizBar">
          <span className={step >= 1 ? "on" : ""} />
          <span className={step >= 2 ? "on" : ""} />
          <span className={step >= 3 ? "on" : ""} />
        </div>

        {/* الخطوة 1: البيانات */}
        {step === 1 && (
          <div className="authForm">
            <label>الاسم بالكامل
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الرباعي" />
            </label>
            <label>رقم الهاتف
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" inputMode="tel" />
            </label>
            <label>البريد الإلكتروني
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" />
            </label>
            <label>كلمة المرور
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </label>
          </div>
        )}

        {/* الخطوة 2: المستندات */}
        {step === 2 && (
          <div className="authForm">
            <p className="stepHint">ارفع صور واضحة للمستندات، وكلها يجب أن تكون سارية.</p>

            <div className="docGroup">
              <b>البطاقة الشخصية</b>
              <div className="docRow">
                <DocUpload label="الوجه" file={docs.id_card_front} onPick={(f) => setDocs({ ...docs, id_card_front: f })} />
                <DocUpload label="الظهر" file={docs.id_card_back} onPick={(f) => setDocs({ ...docs, id_card_back: f })} />
              </div>
              <label>تاريخ انتهاء البطاقة
                <input type="date" value={idExpiry} min={today} onChange={(e) => setIdExpiry(e.target.value)} />
              </label>
            </div>

            <div className="docGroup">
              <b>رخصة السيارة</b>
              <div className="docRow">
                <DocUpload label="الوجه" file={docs.vehicle_license_front} onPick={(f) => setDocs({ ...docs, vehicle_license_front: f })} />
                <DocUpload label="الظهر" file={docs.vehicle_license_back} onPick={(f) => setDocs({ ...docs, vehicle_license_back: f })} />
              </div>
              <label>تاريخ انتهاء رخصة السيارة
                <input type="date" value={vehExpiry} min={today} onChange={(e) => setVehExpiry(e.target.value)} />
              </label>
            </div>

            <div className="docGroup">
              <b>رخصة القيادة</b>
              <div className="docRow">
                <DocUpload label="الوجه" file={docs.driver_license_front} onPick={(f) => setDocs({ ...docs, driver_license_front: f })} />
                <DocUpload label="الظهر" file={docs.driver_license_back} onPick={(f) => setDocs({ ...docs, driver_license_back: f })} />
              </div>
              <label>تاريخ انتهاء رخصة القيادة
                <input type="date" value={drvExpiry} min={today} onChange={(e) => setDrvExpiry(e.target.value)} />
              </label>
            </div>

            <div className="docGroup">
              <b>صورة الكابتن الشخصية</b>
              <p className="docWarn">⚠ صورة واضحة للوجه، بدون فلتر وبدون نظارة</p>
              <div className="docRow">
                <DocUpload label="صورة شخصية" file={docs.selfie_photo} onPick={(f) => setDocs({ ...docs, selfie_photo: f })} />
              </div>
            </div>

            <div className="docGroup">
              <b>صور السيارة</b>
              <div className="docRow">
                <DocUpload label="من الأمام" file={docs.car_front_photo} onPick={(f) => setDocs({ ...docs, car_front_photo: f })} />
                <DocUpload label="من الخلف" file={docs.car_back_photo} onPick={(f) => setDocs({ ...docs, car_back_photo: f })} />
              </div>
              <div className="docRow">
                <DocUpload label="اللوحة المعدنية (واضحة)" file={docs.plate_photo} onPick={(f) => setDocs({ ...docs, plate_photo: f })} />
              </div>
            </div>
          </div>
        )}

        {/* الخطوة 3: الشروط */}
        {step === 3 && (
          <div className="authForm">
            <div className="termsBox">
              <h4>شروط العمل مع كابتن بنها</h4>
              <p>1. الالتزام بحسن معاملة العملاء والحفاظ على سلامتهم طوال الرحلة.</p>
              <p>2. الحفاظ على صلاحية جميع المستندات (البطاقة، رخصة السيارة، رخصة القيادة) وتحديثها فور انتهائها.</p>
              <p>3. الالتزام بالأسعار المعتمدة من التطبيق وتحصيل الأجرة نقدًا فقط.</p>
              <p>4. الحفاظ على نظافة السيارة وصلاحيتها الفنية للعمل.</p>
              <p>5. عدم إلغاء الرحلات المقبولة دون سبب، والالتزام بالوصول لنقطة العميل في الوقت المناسب.</p>
              <p>6. يحق للشركة إيقاف الحساب عند مخالفة الشروط أو تلقّي شكاوى متكررة.</p>
              <p>7. الكابتن مسؤول عن أي مخالفات مرورية أو قانونية أثناء عمله.</p>
              <p>8. يوافق الكابتن على تتبّع موقعه الجغرافي أثناء اتصاله بالتطبيق (حالة "متصل" أو أثناء رحلة)، وذلك لأغراض توزيع الرحلات ومتابعة الخدمة وسلامة العملاء. يتوقف التتبّع تلقائيًا عند قطع الاتصال.</p>
            </div>
            <label className="agreeRow">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>قرأت ووافقت على شروط العمل</span>
            </label>
          </div>
        )}

        {err && <p className="authError" role="alert">{err}</p>}

        <div className="wizBtns">
          {step > 1 && <button type="button" className="wizBack" onClick={() => setStep(step - 1)} disabled={busy}>السابق</button>}
          {step === 1 && <button type="button" className="wizBack" onClick={onBack}>إلغاء</button>}
          {step < 3
            ? <button type="button" className="authSubmit" onClick={next}>التالي</button>
            : <button type="button" className="authSubmit" onClick={submit} disabled={busy}>{busy ? (progress || "جارٍ الإرسال...") : "إرسال الطلب"}</button>}
        </div>
      </div>
      <p className="verTag">الإصدار {APP_VERSION}</p>
    </div>
  );
}

function mapErr(m: string) {
  if (m.includes("already registered")) return "هذا البريد مسجّل بالفعل";
  if (m.includes("rate limit")) return "محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة";
  return m;
}

// تتأكد من وجود صف الكابتن (الذي ينشئه trigger) قبل التحديث، مع محاولات متعددة
async function ensureCaptainRow(uid: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("captains").select("id").eq("id", uid).maybeSingle();
    if (data) return;
    // لو لم يُنشأ بعد، انتظر قليلاً ثم أنشئه يدويًا كخطة بديلة
    await new Promise((r) => setTimeout(r, 500));
    await supabase.from("captains").insert({ id: uid }).select();
  }
}
