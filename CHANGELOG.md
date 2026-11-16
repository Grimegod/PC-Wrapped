# Changelog

All notable changes to PC Wrapped. The project follows [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-11-16

### Fixed

- **Week, month and year totals were cut to 24 hours.** The one-day wall-clock cap was applied to
  every range, so a 63-hour week showed as 24h and the top app as 233%. The cap now scales with the
  number of days, and the top app's share can no longer exceed 100%.
- **"Versus" compared unequal stretches.** This month is now compared with the same days of last
  month (1–16 November against 1–16 October), the last 7 days with the 7 before, and today is
  labelled as "so far, versus all of yesterday". The year line is no longer drawn, because history
  is kept for 365 days and last year's matching days are gone.
- **Two copies of the app could run at once** and overwrite each other's history. A second launch
  now brings the existing window forward and exits.
- Store apps (Calculator, Photos, Netflix…) were all counted as "Application Frame Host"; each is
  now counted as itself.
- Windows tools were labelled "Microsoft® Windows® Operating System"; labels now come from the
  file description (for example "Windows Explorer").
- App names lost accents and symbols on the way from the activity adapter ("Microsoftr Windowsr");
  the adapter now writes UTF-8. Days already saved keep their old label until the app is used again.
- Facebook and Messenger opened error pages. Every share button without a share page (Facebook,
  Instagram, Messenger, TikTok, Snapchat) now copies the card and opens the platform, ready for Ctrl+V.
- Saving a card or a CSV to a folder Windows protects shows a plain explanation instead of a raw
  error. Confirmation messages clear themselves after a few seconds.
- On the square card, the privacy footer overlapped the third app bar; it now shares the tagline's line.
- The activity adapter exits at once if it is started without a valid parent process.

### Added

- **35 languages, chosen automatically.** On first launch PC Wrapped reads the Windows display
  languages in order of preference and uses the first one it has: every full Windows display
  language is included (Arabic and Hebrew right to left). Windows' partial language packs fall
  back to their base language. The interface, dialogs, tray menu, share captions and the cards
  themselves are translated; the language picker in the top bar changes it at any time.
- **Full-screen games and videos count** even without keyboard or mouse input (a controller or a
  film produces none), for up to 4 hours and never while the PC is locked. On by default; can be
  turned off in Settings.
- **Appearance:** light turquoise, a dark blue theme that is gentler on the eyes in the evening, or
  follow the Windows theme.
- **Resume tracking when PC Wrapped opens** (off by default).
- A login start opens straight into the tray instead of showing the window.
- The period tabs work with the arrow keys, Home and End.

### Changed

- New look: light turquoise interface with gold buttons.
- Wider, shorter layout: the language picker sits in the top bar, the card maker sits beside the app list under your character,
  and the settings are laid out in two columns. The window opens at up to 1400 × 860, never larger than the screen.
- "This week" is now called **Last 7 days**, which is what it always measured.
- The tray menu shows one tracking item that matches the current state.
- Electron 45 (Electron 39 stopped receiving security fixes on 5 May 2026).
- The UI refreshes from one timer instead of two; sleep and lock are handled explicitly.

## [1.2.0] — 2026-11-16

### Added

- Recap cards compare the period with the one before it: "Versus the period before: +37%", or "about the same" when nothing moved. Shown only when there is an earlier period to compare against.
- The story card lists up to five apps instead of three.

### Changed

- The square card shows three apps by name with their share bars, instead of one unlabelled strip.
- The app is called **PC Wrapped** everywhere: window, tray, exe, installer, login item and copy.
- Soft turquoise and gold interface, replacing the cocoa palette.

## [1.1.0] — 2026-11-15

Two more ranges and a way out with your data.

### Added

- **Month and year recaps.** The period switch now offers Today, This week, This month and This
  year. The year range runs from 1 January to today. Cards and share captions name the range.
- **CSV export.** Settings has an Export CSV button: one row per app per day, newest first, with
  durations in whole seconds and a BOM so Excel reads non-ASCII app names correctly. It exports
  only what was already stored — no window titles, no screenshots.

### Changed

- The app is now called **PC Wrapped** everywhere: window title, tray, installer name, login item and copy.

### Fixed

- The period switch wraps instead of overflowing once there are four ranges.
- Two CSP and focus-ring tests were matching exact formatting rather than the property they meant
  to check; they now check the property.

## [1.0.0] — 2026-11-13

First release. Local-only Windows activity recap: per-day app aggregates, recap cards in story
and square formats, nine sharing targets through the OS, and no network client of any kind.

### Store verification

- The published Microsoft Store version was installed and launched successfully from the Store.

### Fixed

- **Activity time can no longer exceed wall-clock time.** One sample may credit at most two
  sampling intervals, and a single day is capped at 24 hours, so a stalled adapter, a resumed
  laptop or a clock change can no longer report 30 hours in a 10-hour day.
- The tracker stops when the app is gone: the adapter exits if its parent process disappears, and
  quitting the app kills the whole tracker process tree.
- Removing an app's history from the cancel path no longer mutates history.
- A day with no tracked time renders a quiet "Nothing tracked yet" card instead of a full recap
  card showing zeros.
- Sharing only ever hands out a card file this app saved itself, not any PNG on disk.
- The app window refuses navigation, new windows and every permission request, and every IPC
  handler verifies that the call came from the app's own page.

### Changed

- Application identity is final: `appId` and `AppUserModelId` are `com.grimegod.pcwrapped`,
  imported from one constant instead of a literal, and the MSIX identity is checked before
  packaging.
- Electron fuses are configured for a local-only app: `runAsNode`, `NODE_OPTIONS` and
  `--inspect` are disabled; asar integrity is validated and only the app's own asar is loaded.
- Build scripts no longer assume a package manager or `node` on `PATH`; each step is a script in
  `scripts/` and `pnpm verify` runs the whole chain.
- Recap cards use a bright, celebratory palette with a deterministic confetti pattern instead of
  the earlier muted browns.

### Added

- `pnpm verify`, `check:deps`, `check:identity`, `lint`, `format` and `typecheck` scripts, plus a
  GitHub Actions workflow that runs all of them on Windows.
- Tests for the activity adapter's line parsing and sanitising, for the wall-clock cap, and for
  the saved-card ledger.

## [0.1.0]

First working build: local-only tracking, daily and weekly recap cards in story and square
formats, and OS hand-off sharing to nine networks.
