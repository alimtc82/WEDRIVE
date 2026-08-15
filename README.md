# WE DRIVE

تطبيق ويب عربي لإدارة الرحلات بثلاث واجهات مستقلة:

- العميل: تحديد نقطة الانطلاق والوجهة وطلب الرحلة.
- الكابتن: الاتصال واستقبال الطلبات وقبول الرحلة.
- الإدارة: متابعة الإحصائيات وإدارة التسعير والنطاق.

## التقنية

- React 19 + TypeScript + Vite
- Supabase Auth, Postgres, RLS وRealtime
- MapLibre + OpenStreetMap
- Vercel

## التشغيل المحلي

يتطلب Node.js 22 أو أحدث.

```bash
npm ci
cp .env.example .env
npm run dev
```

اضبط القيم التالية داخل `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## التحقق والبناء

```bash
npx tsc --noEmit
npm run build
```

## قاعدة البيانات

ملفات Supabase محفوظة داخل `supabase/migrations`. آخر ترقية أمان:

`20260815064638_11_security_hardening.sql`

تمنع الترقية تعديل الأدوار من العميل، وتقيد دوال الرحلات بالمستخدمين المصرح لهم، وتحسب المسافة والسعر في قاعدة البيانات.

## الإصدار

الإصدار الحالي: **1.0.2**

