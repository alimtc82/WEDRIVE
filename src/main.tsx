import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tab = "الرئيسية" | "رحلاتي" | "الأرباح" | "التقييمات";

const Icon = ({ children }: { children: React.ReactNode }) => <span className="icon">{children}</span>;

function App() {
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState<Tab>("الرئيسية");
  const [request, setRequest] = useState<"waiting" | "accepted" | "dismissed">("waiting");

  return <div className="app" dir="rtl">
    <aside className="sidebar">
      <div className="logo"><span>WE</span><b>DRIVE</b><small>CAPTAIN</small></div>
      <nav>
        {[["الرئيسية","⌂"],["رحلاتي","▣"],["الأرباح","◈"],["التقييمات","☆"]].map(([label, icon]) =>
          <button className={tab === label ? "active" : ""} onClick={() => setTab(label as Tab)} key={label}><Icon>{icon}</Icon>{label}</button>)}
      </nav>
      <div className="sidebarBottom"><button><Icon>?</Icon>مركز المساعدة</button><button><Icon>↪</Icon>تسجيل الخروج</button></div>
    </aside>

    <main className="workspace">
      <header className="header">
        <button className="mobileLogo">WD</button>
        <div className="pageTitle"><h1>{tab}</h1><p>الجمعة، 14 أغسطس 2026</p></div>
        <div className="headerActions">
          <button className="bell" aria-label="الإشعارات">♧<i></i></button>
          <div className="profile"><div className="avatar">أ</div><div><b>أحمد حسن</b><span>كابتن مميز</span></div><span>⌄</span></div>
        </div>
      </header>

      {tab === "الرئيسية" ? <>
        <section className="welcomeRow">
          <div><p>أهلاً بك من جديد، أحمد 👋</p><h2>جاهز تبدأ يومك؟</h2></div>
          <button className={`online ${online ? "isOnline" : ""}`} onClick={() => setOnline(!online)}><i></i><span>{online ? "أنت متصل الآن" : "أنت غير متصل"}</span><em>{online ? "ON" : "OFF"}</em></button>
        </section>

        <section className="metrics">
          <article className="featured"><div><small>أرباح اليوم</small><p><b>485</b> ج.م</p><span>↗ 12.5% عن أمس</span></div><div className="miniBars">{[30,48,36,68,55,84,96].map((h,i)=><i style={{height:`${h}%`}} key={i}></i>)}</div></article>
          <article><div className="metricIcon lavender">↗</div><small>رحلات اليوم</small><p><b>8</b> رحلات</p><span className="positive">+2 عن أمس</span></article>
          <article><div className="metricIcon peach">◷</div><small>ساعات العمل</small><p><b>5:20</b> ساعة</p><span>من أصل 8 ساعات</span></article>
          <article><div className="metricIcon yellow">★</div><small>تقييمك</small><p><b>4.9</b> / 5</p><span>من 128 رحلة</span></article>
        </section>

        <section className="dashboardGrid">
          <div className="mapPanel">
            <div className="panelHead"><div><h3>منطقة العمل</h3><p>خريطة الطلبات القريبة منك</p></div><button>توسيع الخريطة ↗</button></div>
            <div className="map">
              <div className="street s1"></div><div className="street s2"></div><div className="street s3"></div><div className="street s4"></div>
              <span className="road r1">شارع جامعة الدول العربية</span><span className="road r2">شارع السودان</span>
              <div className="zone z1"></div><div className="zone z2"></div><div className="zone z3"></div>
              <div className="car">▲<i></i></div><div className="requestPin p1">2</div><div className="requestPin p2">3</div><div className="requestPin p3">1</div>
              <div className="mapTools"><button>＋</button><button>−</button><button>⌖</button></div>
              <div className="mapKey"><i></i>مناطق طلب مرتفع</div>
            </div>
          </div>

          <div className="requestPanel">
            <div className="panelHead"><div><h3>طلب رحلة جديد</h3><p>وصل منذ 12 ثانية</p></div><span className="pulse">قريب منك</span></div>
            {request === "waiting" ? <>
              <div className="customer"><div className="customerAvatar">م</div><div><b>محمد سامي</b><span><strong>★ 4.9</strong> · 128 رحلة</span></div><div className="fare"><b>92</b><span>ج.م</span></div></div>
              <div className="route"><div className="routeLine"><i></i><span></span><em></em></div><div>
                <section><small>نقطة الالتقاء</small><b>ميدان لبنان، المهندسين</b><p>2.4 كم عنك · 6 دقائق</p></section>
                <section><small>الوجهة</small><b>مول مصر، مدينة 6 أكتوبر</b><p>18.6 كم · 32 دقيقة</p></section>
              </div></div>
              <div className="tripInfo"><span>المسافة<b>18.6 كم</b></span><span>المدة المتوقعة<b>32 دقيقة</b></span><span>طريقة الدفع<b>نقداً</b></span></div>
              <div className="requestActions"><button onClick={()=>setRequest("dismissed")}>رفض</button><button onClick={()=>setRequest("accepted")}>قبول الرحلة <span>←</span></button></div>
            </> : <div className="resultState"><div>{request === "accepted" ? "✓" : "×"}</div><h3>{request === "accepted" ? "تم قبول الرحلة" : "تم رفض الطلب"}</h3><p>{request === "accepted" ? "جاري فتح المسار إلى محمد سامي" : "سنبحث لك عن طلب قريب آخر"}</p><button onClick={()=>setRequest("waiting")}>عرض الطلب التجريبي مجددًا</button></div>}
          </div>
        </section>

        <section className="weekly"><div className="panelHead"><div><h3>ملخص هذا الأسبوع</h3><p>أداؤك من السبت إلى الجمعة</p></div><button>عرض التقرير الكامل ←</button></div><div className="weeklyItems"><div><span>إجمالي الأرباح</span><b>2,840 ج.م</b></div><div><span>إجمالي الرحلات</span><b>47 رحلة</b></div><div><span>معدل القبول</span><b>94%</b></div><div><span>التقييم</span><b>4.9 ★</b></div></div></section>
      </> : <section className="placeholder"><span>{tab === "رحلاتي" ? "▣" : tab === "الأرباح" ? "◈" : "☆"}</span><h2>قسم {tab}</h2><p>تم تجهيز الهيكل الأساسي لهذا القسم، ويمكن إضافة تفاصيله في المرحلة التالية.</p><button onClick={()=>setTab("الرئيسية")}>العودة للرئيسية</button></section>}
    </main>
  </div>
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
