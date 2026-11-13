# Audit fixes applied — 13 November 2025

Companion to `audit/PC-Wrapped-Audit-2025-11-13.pdf`. Every item from the audit's prioritised list,
what was done, and what is still open.

**Verification after the work (all run, not assumed):** 54/54 tests pass · both tsconfigs typecheck
clean · ESLint clean with `--max-warnings 0` · Prettier clean · `scripts/check-deps.cjs` passes ·
the portable build completes and produces `release/PC-Wrapped-0.1.0-portable-x64.exe` (97.3 MB) ·
both card formats render, checked by eye.

---

## P0 — before any build is distributed

| # | Item | Status |
| --- | --- | --- |
| 1 | Clean dependency install | **Fixed.** Node 22.22.1 and pnpm 10.34.9 installed locally; `pnpm install` rebuilt `node_modules` from scratch (360 store entries, 358 packages). The old tree's defect is gone: `node_modules/electron/dist/resources/default_app.asar` is now a real 109 KB archive instead of a directory. `check-deps.cjs` resolves each package the way the build does and passes. |
| 2 | Active-time double-count | **Fixed.** `MAX_CREDITED_INTERVAL_MS = SAMPLE_INTERVAL_MS * 2` caps what one sample may credit; `recapStats` caps a day at 24 h. Three tests: a fast-arriving stream cannot credit more than wall-clock time, one stalled sample credits at most one interval, a day never exceeds 86 400 000 ms. |
| 3 | Identity | **Partly done.** `build.appId` and `AppUserModelId` are `com.grimegod.pcwrapped`, from one `APP_ID` constant; `check-identity.cjs` fails if they drift. **You must supply** the reserved MSIX `identityName` and certificate `publisher`. The identity check now guards `build:msix` only — the portable build needs no certificate and builds today. |
| 4 | Electron fuses | **Fixed and verified in the built exe.** Read back from `release/win-unpacked/PC Wrapped.exe`: `RunAsNode` DISABLE, `EnableNodeOptionsEnvironmentVariable` DISABLE, `EnableNodeCliInspectArguments` DISABLE, `EnableEmbeddedAsarIntegrityValidation` ENABLE, `OnlyLoadAppFromAsar` ENABLE, `EnableCookieEncryption` ENABLE. |
| 5 | Rebuild, remove stale artifacts | **Portable rebuilt.** `release/PC-Wrapped-0.1.0-portable-x64.exe` now contains the emoji fix, the square-card layout fix, THE CAST, the nine-network share row, the bright palette and the audit fixes. The old MSIX was not rebuilt (blocked on #3) and has been deleted rather than left to be shipped by mistake. |

## P1 — before launch

| # | Item | Status |
| --- | --- | --- |
| 6 | Share only a card the app wrote | **Fixed.** `SavedCardLedger` in `src/main/share.ts`; `card:save` records the path, `card:share` checks membership *and* that it is still a PNG. Test added. |
| 7 | IPC and navigation hardening | **Fixed.** `will-navigate` and `setWindowOpenHandler` deny navigation and new windows; permission requests and checks are denied; every handler goes through `handle()`, which refuses any `senderFrame` that is not the app's own page (`src/main/ipc-guard.ts`, 4 tests). |
| 8 | Tracker cannot outlive the app | **Fixed.** The adapter breaks its poll loop when its parent PID is gone; quitting kills the process tree with `taskkill /t /f`. |
| 9 | `history:remove-app` cancel path | **Audit finding withdrawn.** The existing `removeAppFromHistory(..., false)` returns `confirmed: false` and mutates nothing; the report misread it. |
| 10 | Zero-data card | **Fixed.** `renderCard` returns a quiet "Nothing tracked yet" card when a period has no active time; two tests, plus `preview/recap-card-empty.png`. |
| 11 | CI, lint, format | **Done and run locally.** `eslint.config.mjs` (type-aware: `no-floating-promises`, `no-misused-promises`), `.prettierrc.json`, `tsconfig.eslint.json`, `.github/workflows/ci.yml` (check:deps, lint, format:check, typecheck, test, portable build, artifact upload). The first real run found and fixed 14 lint errors: floating promises in `main.ts` and `renderer.ts`, two `void`-less event handlers that could swallow a rejection, an unused `Snapshot` import, an unused `lime` colour, and a bare `catch {}`. |

## P2 — polish

| # | Item | Status |
| --- | --- | --- |
| 12 | Cast heading consistency | **Fixed, and it exposed a real bug.** The square card now has a `THE CAST` heading — and giving it one showed the second metric row ran into the cast strip while the average-return line collided with the footer. Metrics are now 100 px tall and repositioned; the square card no longer draws the return line (it has no room). Verified by rendering `preview/recap-card-square.png`. |
| 13 | Share labels | **Fixed.** Each share button carries a `title` saying what happens: opens a composer to attach the PNG, or copies it to the clipboard. |
| 14 | Split `main.ts` | **Partly done.** `tracker-line.ts` (adapter parsing and sanitising) and `ipc-guard.ts` (sender rule) are out, with 11 tests between them. Tray/tracker/window wiring is still in `main.ts` (≈440 lines); that split needs the app running interactively to verify. |
| 15 | Tests for risky paths | **Fixed.** `tests/store.test.ts` (6: corrupt file preserved and never overwritten, wrong-shape file rejected, retention, settings round-trip and cleaning), `tests/tracker-line.test.ts` (7), `tests/ipc.test.ts` (4). **32 → 54 tests.** |
| 16 | i18n, docs, scratch files | **Partly done.** `CHANGELOG.md` written; `.gitignore` covers `_*.cjs`, `_*.png`, `*.tsbuildinfo`, the audit's generated files; eight build-trace scripts moved to `scripts/dev/` with a README. **i18n is still not decided** — all UI strings remain hardcoded English. `MVP-PLAN.md` and `PRODUCT-BRIEF.md` are still unmarked historical documents. |

## Build chain

`package.json` no longer shells out to `pnpm` or a bare `node`: each step is a script
(`scripts/build-ts.cjs`, `clean.cjs`, `check-deps.cjs`, `check-identity.cjs`) and `pnpm verify`
runs the chain. `packageManager` and `engines` are pinned. The `msix` block was reordered so
electron-builder actually applies the fuses — while it sat after `toolsets`, every fuse silently
fell back to the Electron default, which is why the audit found none configured.

## What is still open

1. **MSIX:** reserve the identity in Partner Center and put `build.msix.identityName` and
   `build.msix.publisher` in `package.json`, then `pnpm run build:msix`. Until then the app is
   unsigned and the portable exe will show a SmartScreen prompt.
2. **Git:** nothing from these sessions is committed. Commit before anything else touches the
   folder.
3. **i18n decision** and marking `MVP-PLAN.md` / `PRODUCT-BRIEF.md` as historical.
4. **`main.ts` split** into `ipc.ts`, `tray.ts`, `tracker.ts`.
