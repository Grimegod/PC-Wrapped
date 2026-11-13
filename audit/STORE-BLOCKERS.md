# Store blockers — honest status, 13 November 2026

## The one thing that must be fixed before anything else

**The MSIX build does not run.** It installs (`Status = Ok`), but every launch aborts with:

```
FATAL:electron\shell\common\asar\asar_util.cc:143] Integrity check failed for asar archive
```

That is not a packaging nicety — a Store listing whose app crashes on launch fails certification.

### What the cause is, exactly

`electron-builder 27.0.0-alpha.14` hashes the asar header **with its trailing NUL padding removed**;
Electron 39 hashes the header **as stored**. Verified against the real files:

| Hashed                                      | Result                                            |
| ------------------------------------------- | ------------------------------------------------- |
| whole `app.asar`                            | `c73b9fee…`                                       |
| header JSON text without the 7 padding NULs | `7c15b688…` — the value electron-builder embedded |
| header as stored on disk                    | `edd566ba…` — what Electron computes              |

### What was tried, and what it proved

| Attempt                                                           | Result                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Rebuild and reinstall the MSIX                                    | same failure, asar byte-identical                                      |
| `enableEmbeddedAsarIntegrityValidation: false` in `electronFuses` | **no effect** — the resource is still written and still checked        |
| Pin `electron-builder` to 26.18.1 (latest stable)                 | impossible: it rejects this config (`fileOptions`, `msix` are 27-only) |
| Strip the integrity resource from the exe by hand                 | works on the exe, but the MSIX target re-adds it                       |

So the only remaining clean fix is upstream. Two workable paths:

1. **Wait for a fixed electron-builder 27 beta**, then bump the pin. One line.
2. **Build the MSIX without asar** (`"asar": false` for that target). The app then has no asar to
   verify, so the check cannot fail. Cost: slower startup, files visible on disk, and the
   `onlyLoadAppFromAsar` fuse becomes meaningless. Acceptable for a test package, worth revisiting
   before shipping.

## Everything else, checked

| Item                                          | Status                                                             |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Windows App Certification Kit                 | **PASS** — 24/24 required checks (`audit/wack-report.xml`)         |
| Wide tile art                                 | fixed — all eight assets have exact required sizes                 |
| Hardcoded `SlackStartup` task in the manifest | removed; startup now handled in `src/main/startup.ts`              |
| `-ExecutionPolicy Bypass` on the tracker      | removed — this was the Bitdefender alert                           |
| Portable build                                | **runs** — verified window titled "PC Wrapped"                     |
| Tests / types / lint                          | 56 tests pass, typecheck clean, ESLint `--max-warnings 0`          |
| Privacy story                                 | no network client, CSP `connect-src 'none'`, daily aggregates only |
| Repository                                    | public, `https://github.com/Grimegod/PC-Wrapped`                   |

## What is genuinely left before a Store submission

1. Fix the MSIX launch failure (above) — **hard blocker**.
2. Reserve the app in Partner Center; put the real `identityName` / `publisher` in
   `package.json` → `build.msix`. `pnpm run check:identity` refuses until then, on purpose.
3. Install the real MSIX and use it for a day: start-at-login, history after restart,
   delete-all-history, tray and tracker running from `WindowsApps`.
4. Store listing: screenshots, description, age rating, privacy policy URL, support contact.

## Straight answer to "can we go further?"

Not to the Store today. The code and the privacy story are in good shape and WACK passes, but an
app that crashes on launch is not submittable, and I will not dress that up. Once the MSIX launches
(option 1 or 2 above), the remaining work is paperwork and one day of using it installed.
