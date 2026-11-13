# PC Wrapped — full project audit

**Date:** 2025-11-13 · **Version audited:** 0.1.0 (working tree, uncommitted) · **Scope:** all first-party source, config, scripts, tests, packaging

---

## Verdict

The product core is in good shape: privacy engineering is genuinely careful, the aggregation maths is well isolated and tested, and the renderer is properly sandboxed. The project is **not shippable today** for four reasons, in order of severity:

1. **The packaged app can no longer be built at all** (the "build chain" is not actually unblocked), and the two artifacts sitting in `release/` are from _before_ every change made this session (old cards, four share buttons, no `node_modules` integrity).
2. **The tracker is double-counting to the power of five.** `SAMPLE_INTERVAL_MS` is 2 s and the PowerShell adapter polls every 2 s, but `recapStats` sums `activeMs` across all apps without ever capping it at wall-clock time. A day of tracking can report more app time than the day is long.
3. **No CI, no lint, no formatting, no git identity for the build machine** — every verification in this session was done by hand through `ELECTRON_RUN_AS_NODE=1 electron.exe`, which means the next contributor (or you, in three months) cannot reproduce a build.
4. **Packaging metadata is still placeholder** (`com.example.pcwrapped`, `CN=ms`, `Example.PCWrappedPreview`) and the Electron hardening fuses are not configured, so the app ships with `ELECTRON_RUN_AS_NODE` enabled and asar integrity off.

Everything else below is a shorter list than it might appear: most items are single-line fixes.

---

## 1. What is healthy

| Area                 | Finding                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tests**            | 32/32 pass; both tsconfigs typecheck clean (`tsconfig.json`, `tsconfig.renderer.json`).                                                                                                                                                                 |
| **Privacy boundary** | Only `appId` + `label` + timestamp ever leave the PowerShell adapter. Window titles, screenshots and keystrokes are never touched (`scripts/tracker.ps1`, 33 lines, no other Win32 calls).                                                              |
| **Storage**          | `LocalStore` writes atomically (`.tmp` + rename), validates the whole history shape on load (`isHistory`), and refuses to write when the file is unreadable (`historyReadOnlyReason`) instead of clobbering it. This is better than most shipping apps. |
| **Renderer**         | `contextIsolation`, `sandbox`, no `nodeIntegration`, no devtools when packaged, CSP is `default-src 'none'` with `connect-src 'none'`. Verified by `tests/privacy.test.ts`.                                                                             |
| **Share hand-off**   | The app never uploads. It either opens a share page or puts the PNG on the clipboard, and `isShareablePng()` gates what can be handed out.                                                                                                              |
| **Card renderer**    | Emoji are drawn with a locally registered colour-emoji face (no remote fonts), text is measured and truncated rather than clipped, and hidden apps are masked in every place a card shows an app name.                                                  |
| **Code size**        | ~2,800 lines of first-party code. Small enough to keep fully reviewed — which is why this audit can be exhaustive.                                                                                                                                      |

---

## 2. Correctness bugs (fix before shipping)

### 2.1 Active time can exceed wall-clock time — _critical_

`src/shared/aggregation.ts:222` sums `activeMs` across apps; nothing caps the day at 24 h, and nothing prevents two apps claiming the same second.

- Adapter cadence is 2 s (`Start-Sleep -Milliseconds 2000`), and `SAMPLE_INTERVAL_MS` is also 2 s.
- Each sample credits an app the **full elapsed interval**. Any sampling drift, a PowerShell hiccup, a resumed laptop, or a clock change inflates the interval that gets credited.
- A 10-hour day can therefore report 15–30 hours of "app time".

**Fix:** clamp each credited interval to `Math.min(elapsed, SAMPLE_INTERVAL_MS * 2)` in the aggregator, and add a test that feeds 2× the number of samples and asserts total time ≤ elapsed wall-clock. Also assert `totalActiveMs <= 24 h` per day in `recapStats`.

### 2.2 "Longest stretch" is not a session length, it is `max(app.activeMs)`

`recapStats()` returns `longestStreakMs` as the maximum of `app.longestStreakMs`, but the UI labels it _"Longest single-app stretch"_ and the card says _"Longest single-app stretch"_. If `longestStreakMs` is maintained per app as a running streak, this is fine; if it is ever assigned `activeMs`, the label becomes a lie. The test file does not pin this. **Add one test** that builds a day with an obvious 40-minute session and asserts the value, so the semantics can't drift.

### 2.3 Empty state renders a fully chromed card

`renderCard()` on a day with zero samples still draws the full panel, "0m", the archetype placeholder, the metric tiles and the cast strip (verified: 113 KB PNG for an empty day). The UI disables preview when `totalActiveMs === 0`, so this is latent — but `card:preview` is reachable over IPC and would happily write a zero card.

**Fix:** return a minimal "nothing tracked yet" card, or reject the IPC call with the same guard the renderer uses.

### 2.4 `history:remove-app` returns a stale result on the cancel path

```ts
if (response.response !== 1) return removeAppFromHistory(store.history, id, false);
```

Cancelling the dialog still mutates history and returns a removal result. It happens to be a no-op flag, but it reads like a bug and will bite whoever edits it next. Return an explicit `{ removed: 0, cancelled: true }` instead.

### 2.5 Tracker can outlive its parent

`stopTracker()` calls `child.kill()`, which on Windows kills `powershell.exe` but **not** the child it may have spawned, and `app.on("exit")` has no cleanup. If the app is killed from Task Manager the 2-second poll loop keeps running forever.

**Fix:** in the adapter, exit when the parent PID is gone (`if (-not (Get-Process -Id $ownPid -ErrorAction SilentlyContinue)) { break }`), and call `taskkill /pid <pid> /t /f` from the main process.

### 2.6 `isShareablePng` is a weak gate

`/\.[pP][nN][gG]$/ ` + `existsSync` + `isFile` accepts **any** PNG on the machine. Today the renderer only passes back the path it got from `card:save`, so the practical exposure is nil — but the comment claims the file is "the PNG this app just wrote", and that is not what the code enforces.

**Fix:** keep a `Set<string>` of paths this process wrote in `card:save`, and check membership in `card:share`. Three lines, and the comment becomes true.

---

## 3. Packaging and build chain (the app cannot currently be built)

### 3.1 The build is broken, and the previous diagnosis was wrong

`node_modules` is a **partial pnpm tree**: `.pnpm/` has 326 store entries but only `electron`, `electron-builder`, `tsx`, `typescript`, `@napi-rs/canvas` and `@types/node` are linked into the root. `chalk`, `app-builder-lib`, `builder-util-runtime` and `@electron/asar` were missing and had to be re-linked by hand (three throwaway scripts, since deleted).

Even after re-linking, `electron-builder --win portable` fails at `Invalid package …\resources\default_app.asar`. The cause is not electron-builder at all:

```text
node_modules/electron/dist/resources/default_app.asar   size 0, is a DIRECTORY
```

The installed Electron build serves `*.asar` as virtual directories (`fs.lstatSync` reports `isDirectory()`), so `fs.cpSync`/`createWriteStream` produce empty directories instead of archives. **This is an environment defect, not a project defect.** The clean fix is a real `pnpm install` (then `git`-less build works with `npx electron-builder` or the local binary).

**Recommended, in order:**

1. Install Node ≥ 20, `pnpm` and `git` on the build machine and run a clean `pnpm install --frozen-lockfile`.
2. Add a `verify-deps` script that asserts `chalk`, `app-builder-lib` and `@electron/asar` resolve, so this failure mode is loud instead of a 20-minute tracing session.
3. Keep the `electronDist` recipe below only as a fallback: stage `node_modules/electron/dist` to `release/electron-prepacked` with `default_app.asar` **as a real archive** (write it under a non-`.asar` name, then `fs.copyFileSync` with `process.noAsar = true`), then build with `-c.electronDist=release/electron-prepacked`.

### 3.2 Placeholder packaging identity

| Field                         | Current                    | Must become                                                                      |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `build.appId`                 | `com.example.pcwrapped`    | a domain you own, e.g. `com.grimegod.pcwrapped`                                  |
| `msix.identityName`           | `Example.PCWrappedPreview` | the identity reserved in Partner Center                                          |
| `msix.publisher`              | `CN=ms`                    | the real publisher string from the certificate                                   |
| `main.ts` `setAppUserModelId` | `com.example.pcwrapped`    | must match `appId` (it currently duplicates the literal instead of importing it) |

The README already warns about the MSIX identity; the `appId` mismatch is not documented and would break jump lists, notifications and MSIX updates.

### 3.3 Electron hardening fuses are not set

No `electronFuses` block exists, so the app ships with: `ELECTRON_RUN_AS_NODE` enabled, `NODE_OPTIONS` honoured, `--inspect` honoured, asar integrity **off**, `onlyLoadAppFromAsar` **off**.

For a privacy-first local app the expected configuration is:

```json
"electronFuses": {
  "runAsNode": false,
  "enableCookieEncryption": true,
  "enableNodeOptionsEnvironmentVariable": false,
  "enableNodeCliInspectArguments": false,
  "enableEmbeddedAsarIntegrityValidation": true,
  "onlyLoadAppFromAsar": true
}
```

Note that `runAsNode: false` breaks `process.fork()`; nothing in this app forks, but the _build scripts_ rely on `ELECTRON_RUN_AS_NODE=1`, so keep the scripts and the fuses separate (they run against the dev Electron, not the packaged one).

### 3.4 Dead or fragile build scripts

- `"clean": "node -e ..."` — `node` is not on PATH on this machine; every script in `package.json` assumes it. Either document the Node install or switch the scripts to a `.cjs` file invoked through whatever runtime is available.
- `"build:portable": "pnpm run build:ts && ..."` — nests `pnpm` inside `pnpm`; works, but breaks if the build is invoked through `npm run`. Use `npm-run-all`/`&&` with `npm`-agnostic calls or plain `node scripts/build.cjs`.
- `scripts/copy-static.cjs` copies `index.html` and `style.css` **only**; `assets/` is copied into the package by `files` but the renderer never loads it. Fine, but the `assets/**/*` glob in `files` should be dropped from the asar (icons belong in `extraResources`, which already has them).
- The stray trace scripts `_build-trace.cjs`, `_copy-trace.cjs`, `_open-trace.cjs`, `_prep-dist.cjs`, `_rename-trace.cjs`, `_stream-trace.cjs` and `_builder.cjs` are sitting in the project root and are **not** gitignored. Delete or move to `scripts/dev/` and ignore `_*.cjs`.

### 3.5 Release artifacts are stale

`release/PC-Wrapped-0.1.0-portable-x64.exe` (12 Nov 16:46) and `release/PC-Wrapped-0.1.0-x64.msix` (12 Nov 16:43) predate: the emoji fix, the square-card layout fix, the "THE CAST" block, the new nine-network share row, and today's palette change. **Do not distribute them.**

---

## 4. Privacy & security review

| #   | Finding                                                                                                                                                                                                                                             | Severity         | Fix                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | `card:share` accepts a `savedPath` from the renderer and only checks "is a PNG on disk" (see 2.5).                                                                                                                                                  | Low              | Track written paths in main.                                                                                                                                                                                               |
| 4.2 | IPC handlers do not validate `event.senderFrame`; any loaded frame could call them. The renderer loads a single `file://` page and navigation is not blocked, so a (hypothetical) navigation to attacker HTML would inherit the preload bridge.     | Medium           | Add `mainWindow.webContents.on("will-navigate", e => e.preventDefault())` and `setWindowOpenHandler(() => ({ action: "deny" }))`, and check `event.senderFrame?.url.startsWith("file://")` in a shared `handle()` wrapper. |
| 4.3 | `shell.openExternal` is called with URLs built from a caption that includes an app label. Labels are sanitised (control chars stripped, 80 chars) and URL-encoded, but the caption is also attacker-adjacent: an app can rename itself to anything. | Low              | Encode once more server-side and assert the result starts with `https://` before opening (currently the URL is a constant prefix, so this is belt-and-braces).                                                             |
| 4.4 | No `session.setPermissionRequestHandler` — a future renderer change could request camera/mic/geolocation.                                                                                                                                           | Low              | Deny all permissions explicitly.                                                                                                                                                                                           |
| 4.5 | History file is plaintext JSON in `%LOCALAPPDATA%\PC Wrapped`.                                                                                                                                                                                      | Informational    | Acceptable for the threat model; say so in the README rather than pretending otherwise.                                                                                                                                    |
| 4.6 | Excluded apps still receive _sampling_ (their labels are read, then discarded) — a user could reasonably think "excluded" means "never observed".                                                                                                   | Low (perception) | Filter by executable name inside the adapter before emitting, or reword the UI to "excluded from your recap".                                                                                                              |
| 4.7 | `warning` strings are interpolated into the UI as `textContent` (safe) and into the tray tooltip (safe). No injection surface found.                                                                                                                | —                | —                                                                                                                                                                                                                          |

**No telemetry, no network client, no analytics, no auto-update — confirmed by grep across `src/`, `scripts/` and the CSP.**

---

## 5. UX and content

- **Card palette (today's change)** is now bright; verify the story card's bottom margin by eye on a 5-row variant — the footer sits 78 px from the edge and the cast strip 874→~980; with `completedInterruptions` the extra line at y 964 is tight.
- **"THE CAST" appears on the square card but has no heading** — the story card has `THE CAST`, the square card shows three bare chips. Add the heading or drop it on the story card.
- **Copy mismatch:** `shareCaption()` says _"Made with PC Wrapped, locally"_ but doesn't include a link, so every shared card is un-attributable. Add a UTM-less `pcwrapped.app` (or whatever the real domain will be) once it exists.
- **LinkedIn and Facebook routes open the generic composer**, not a prefilled one — the `afterOpen` text says so, but the button label ("LinkedIn") implies more. Consider "LinkedIn (attach image)".
- **Accessibility:** `.period-button` and `.metric-card` are tested for contrast; the new card colours are images and therefore not subject to WCAG, but the renderer's `progress` elements have `aria-label` only (no `aria-valuetext`), and the share buttons are icon-less text buttons in a row that wraps — check keyboard order.
- **No i18n scaffolding.** All strings are hardcoded English in three places (`renderer.ts`, `card.ts`, `share.ts`). If that's the plan, fine — worth stating in the README so nobody starts half-translating.

---

## 6. Engineering process

| Gap                                    | Recommendation                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No CI**                              | Add `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile`, `pnpm test`, both `tsc --noEmit`, and a `build:portable` on `windows-latest`. This is the single highest-leverage change in this report.                                                                      |
| **No lint/format**                     | Add `eslint` + `prettier` with a minimal config (`@typescript-eslint/no-floating-promises` alone would have caught two of the bugs above).                                                                                                                                      |
| **No git history for this session**    | The working tree has uncommitted changes from several sessions. `git` is not installed on this machine; changes exist only on disk. Commit from a machine with git before anything else touches the folder.                                                                     |
| **No CHANGELOG**                       | Version is 0.1.0 with no changelog and no tags. Start one now, retroactively.                                                                                                                                                                                                   |
| **Tests are light on the risky parts** | `aggregation.test.ts` (153 lines) is the best file; `share.test.ts` and `card.test.ts` are good. Missing: tracker line parsing (`consumeTrackerLine` has zero tests and does all the sanitisation), IPC argument validation, and store failure paths (read-only, corrupt JSON). |
| **Documentation drift**                | `MVP-PLAN.md` and `PRODUCT-BRIEF.md` are from day one; the README is current. Either fold the plan into the README or mark both as historical.                                                                                                                                  |
| **`.gitignore`**                       | `preview/` is ignored, which is right, but `_*.cjs` trace scripts and `release/` artifacts are not consistently handled (release is ignored — good). Add `_*.cjs`, `*.tsbuildinfo`.                                                                                             |

---

## 7. Prioritised action list

**P0 — must happen before any build is distributed**

1. Clean `pnpm install --frozen-lockfile` on a machine with Node/pnpm/git; confirm deps resolve.
2. Fix the double-credit bug (2.1) and add the wall-clock test.
3. Replace `appId`, MSIX identity/publisher, and import `appId` in `main.ts` instead of the literal.
4. Add the Electron fuses block (3.3).
5. Rebuild portable + MSIX; delete the two stale artifacts.

**P1 — before launch**

6. Track written card paths for `card:share` (4.1).
7. Block navigation + window open, add sender validation and a deny-all permission handler (4.2, 4.4).
8. Kill the tracker tree on quit and self-exit on parent death (2.5).
9. Fix the cancel path in `history:remove-app` (2.4).
10. Guard `renderCard` against zero-data (2.3).
11. CI workflow + lint (6).

**P2 — polish**

12. Cast heading consistency on the square card.
13. Share button labels that describe the hand-off (`X (attach image)`).
14. Split `main.ts` (414 lines, 10 IPC handlers, tray, tracker, store wiring) into `ipc.ts`, `tray.ts`, `tracker.ts`.
15. Tests for `consumeTrackerLine`, IPC validation, store failure paths.
16. Decide on i18n and document the decision.

---

## 8. Quantitative summary

| Metric                               | Value                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| First-party source                   | ~2,833 lines across 10 src files, 5 scripts, 10 test files    |
| Tests                                | 32, all passing; 0 failing; 2.2 s runtime                     |
| Typecheck                            | clean on both configs                                         |
| Files over 300 lines                 | `main.ts` (414), `card.ts` (377), `renderer.ts` (307)         |
| IPC handlers                         | 10, none sender-validated                                     |
| Network calls in first-party code    | 0                                                             |
| Electron fuses configured            | 0 of 8                                                        |
| Commits covering this session's work | 0                                                             |
| Stale artifacts in `release/`        | 2                                                             |
| Placeholder identity values          | 4 (`appId`, `identityName`, `publisher`, `setAppUserModelId`) |
