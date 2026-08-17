// هوية التطبيق — كابتن بنها
export const APP_NAME = "كابتن بنها";

// شعار التطبيق: مربع متدرج أخضر بداخله سيارة منظر علوي (SVG متجهي)
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cbGrad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#1fbf8f" />
          <stop offset="1" stopColor="#0d9b72" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#cbGrad)" />
      <rect x="1.5" y="1.5" width="45" height="45" rx="13" stroke="rgba(255,255,255,.28)" />
      {/* سيارة منظر علوي */}
      <rect x="17" y="12" width="14" height="25" rx="4.5" fill="#0f1729" />
      <path d="M19.2 16.5 L28.8 16.5 L27.4 20.2 L20.6 20.2 Z" fill="#fff" />
      <path d="M20.4 30 L27.6 30 L26.8 33.2 L21.2 33.2 Z" fill="#fff" opacity=".85" />
      <rect x="15" y="17" width="2.4" height="4.6" rx="1.1" fill="#0f1729" />
      <rect x="30.6" y="17" width="2.4" height="4.6" rx="1.1" fill="#0f1729" />
      <rect x="15" y="27.8" width="2.4" height="4.6" rx="1.1" fill="#0f1729" />
      <rect x="30.6" y="27.8" width="2.4" height="4.6" rx="1.1" fill="#0f1729" />
      {/* أسهم اتجاه أسفل الشعار */}
      <path d="M20 41.5 L24 38.6 L28 41.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".9" />
    </svg>
  );
}
