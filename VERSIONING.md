# WEDRIVE Versioning Rule

- `package.json` is the release version source.
- `src/lib/version.ts` mirrors the same version and is the single UI version source for all visible version labels, including the login screen and the shared header.
- Every normal product update MUST increment the patch version by `0.0.1` before merge (example: `1.16.6` -> `1.16.7`).
- If the user explicitly requests an exact version, a minor-version change, or a major-version change, that explicit request overrides the automatic patch increment.
- Do not hardcode version strings inside UI components. Import `APP_VERSION` from `src/lib/version.ts` instead.
- Before merge, verify `package.json` and `src/lib/version.ts` match and that both login and authenticated headers render the same version.
