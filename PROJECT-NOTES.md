# Captain Banha — Project Notes

> Read this file first when starting any new working session on this project.
> Last updated: 2026-08-21 (v1.16.5)

## Identity & Infrastructure
- **App name:** كابتن بنها (Captain Banha) — formerly "WE DRIVE"
- **Repo:** `alimtc82/WEDRIVE` (main branch)
- **Web deploy:** Vercel, auto-deploys on push to main → `wedrive.mtc-group.online`
- **Stack:** React + TypeScript + Vite (rolldown) + MapLibre GL v6 + Supabase (auth/DB/storage/realtime)
- **Build output:** `dist/client` (see `vite.config.ts`, `base: "./"`, custom plugin copies MapLibre worker files)
- **Env vars (required at build time):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — stored locally in `.env.local` (gitignored). Without them the built app throws "متغيرات Supabase غير مضبوطة" and shows a blank screen.
- **Version:** bumped in `src/lib/version.ts` (`APP_VERSION`), shown on the auth screen.

## Android App (Capacitor 8)
- **appId:** `online.mtcgroup.captainbanha`, **webDir:** `dist/client`
- Config: `capacitor.config.json` (background/splash color `#0f1729`)
- Plugins: `@capacitor/app` (back button), `@capacitor/status-bar`, `@capacitor/splash-screen`
- Native init: `src/lib/native.ts` — called from `src/main.tsx`, guarded by `Capacitor.isNativePlatform()` so web is unaffected
- App icon source: `resources/icon.png` (generated steering-wheel-in-pin logo); regenerate via `npx capacitor-assets generate --android`
- Location permissions were added to `android/app/src/main/AndroidManifest.xml` (ACCESS_FINE/COARSE_LOCATION)

### APK update cycle (after any web change)
```
git pull
npm run build
npx cap sync
# Android Studio → Build → Build APK(s)
# install app-debug.apk OVER the old one (same debug signature = update, keeps login)
```

## iOS Plan (pending)
- No Mac available → plan: **Codemagic** (free tier, cloud macOS) builds `.ipa`; install via **Sideloadly** with free Apple ID (7-day limit). `npx cap add ios` still needs to be run and pushed; `codemagic.yaml` to be written. Arabic location-permission strings needed in Info.plist. Real distribution needs Apple Developer ($99/yr) + TestFlight.

## Feature History (high level)
- v1.10.2: admin map auto-location; new auth flow (role cards → sign-in, separate register choice); 5-star default rating; My Ratings screens; My Trips (filters + pagination); customer favorite trips; captain registration (document upload with expiry limits: vehicle 3y, driver license 10y, ID 7y); admin docs lightbox.
- v1.10.3: password confirmation field + show/hide password toggle (customer signup & captain register step 1); "Remember me" on sign-in.
- v1.16.2: "Remember me" stores email only; fixed-route coordinates are verified server-side; privileged RPC surface and document paths are hardened; CI runs type-checks/tests; location writes and Realtime subscriptions are throttled/scoped.
- v1.16.4: restored smart in-app place suggestions, Arabic-tolerant match highlighting, city matching, and deterministic local-result ranking.
- v1.16.5: reliable captain presence heartbeat, consistent online count, and a searchable paginated admin directory with direct call and WhatsApp actions.
- v1.10.6: replaced `prompt()` price input in CaptainApp with inline modal (`priceModal` state, Enter-to-submit, click-outside to close); added `.env.example` template; added GitHub Actions CI workflow (`.github/workflows/ci.yml`, build check on push/PR to main, needs `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` repo secrets); offer countdown timer synced with DB `offer_ttl_sec`.

## Auth architecture notes
- `src/pages/AuthPage.tsx`: welcome → role cards → sign-in / register choice; customer signup inline; captain register = separate wizard (`CaptainRegister.tsx`, 3 steps: data → 10 documents → terms, then `save_captain_docs` RPC).
- Supabase session persists by default; "remember me" stores and prefills the email only and never persists a password.

## Known backlog / watch-list
- GPS spoofing detection; OSRM/Nominatim usage-policy compliance
- Capacitor files (`capacitor.config.json`, `src/lib/native.ts`, `resources/`) live in repo; `android/` is local-only (add to .gitignore or commit deliberately)
- Release-signed APK needed for Play Store; background geolocation + FCM push for production

## Working style with the user
- User: Ali (Arabic/Egyptian speaker) — respond in Egyptian Arabic, full-width Arabic punctuation, numbered step-by-step instructions; he follows along with screenshots — verify each stage from the screenshot before moving on.

