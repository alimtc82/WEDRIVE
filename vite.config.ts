import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// MapLibre v6 يحمّل ملف الـ worker وقت التشغيل من مسار مجاور للحزمة (/assets/maplibre-gl-worker.mjs)
// وVite لا ينسخه تلقائيًا — هذه الإضافة تنسخه مع ملف shared الذي يستورده بعد كل بناء
function maplibreWorkerAssets(): Plugin {
  return {
    name: "maplibre-worker-assets",
    apply: "build",
    closeBundle() {
      const require = createRequire(import.meta.url);
      mkdirSync("dist/client/assets", { recursive: true });
      for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
        copyFileSync(require.resolve(`maplibre-gl/dist/${f}`), `dist/client/assets/${f}`);
      }
    },
  };
}

// base نسبي — جاهزية للتغليف لاحقًا عبر Capacitor (Android/iOS) أو Electron (Desktop)
export default defineConfig({
  base: "./",
  plugins: [react(), maplibreWorkerAssets()],
  build: { outDir: "dist/client", emptyOutDir: true },
});
