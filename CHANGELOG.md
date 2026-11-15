# Changelog

All notable changes to PCWrapped. The project follows [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-11-15

Two more ranges and a way out with your data.

### Added

- **Month and year recaps.** The period switch now offers Today, This week, This month and This
  year. The year range runs from 1 January to today. Cards and share captions name the range.
- **CSV export.** Settings has an Export CSV button: one row per app per day, newest first, with
  durations in whole seconds and a BOM so Excel reads non-ASCII app names correctly. It exports
  only what was already stored — no window titles, no screenshots.

### Changed

- The app is now called **PCWrapped** everywhere: window title, tray, installer name, login item and copy.

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
