# كابتن بنها (Captain Banha)

تطبيق ويب عربي لإدارة وطلب الرحلات داخل بنها بثلاث واجهات مستقلة:

- العميل: تحديد نقطة الانطلاق والوجهة وطلب الرحلة واستقبال عروض الكباتن.
- الكابتن: الاتصال واستقبال الطلبات وتقديم عروض الأسعار.
- الإدارة: متابعة الإحصائيات والخريطة الحية وإدارة التسعير والنطاق.

## التقنية

- React 19 + TypeScript + Vite
- Supabase Auth, Postgres, RLS وRealtime
- MapLibre + OpenStreetMap + OSRM (مسارات الطريق الحقيقية)
- Vercel للنشر

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

ناتج البناء في `dist/client` (مع نسخ ملفات MapLibre worker تلقائيًا).

## قاعدة البيانات

ملفات Supabase محفوظة داخل `supabase/migrations`. آخر ترقية أمان:

`20260821130000_24_smart_place_search_v1164.sql`

تمنع الترقية تعديل الأدوار من العميل، وتقيد دوال الرحلات بالمستخدمين المصرح لهم، وتحسب المسافة والسعر في قاعدة البيانات.

## التحويل إلى تطبيقات (Android / iOS / Desktop) لاحقًا

المشروع مهيأ للتغليف عبر Capacitor دون تعديل الكود:

- `capacitor.config.json` جاهز (webDir: `dist/client`).
- `base: "./"` في Vite حتى تعمل المسارات النسبية داخل WebView.
- وسوم PWA وموبايل مضبوطة في `index.html` (viewport-fit, theme-color).

عند الحاجة:

```bash
npm install @capacitor/core @capacitor/cli
npx cap add android   # أو ios
npm run build
npx cap sync
```

ولسطح المكتب يمكن تغليف نفس ناتج `dist/client` عبر Electron أو Tauri.

## الإصدار

الإصدار الحالي: **1.16.5**

