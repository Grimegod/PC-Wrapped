# Changelog

All notable changes to PC Wrapped. The project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-13

First release. Local-only Windows activity recap: per-day app aggregates, recap cards in story
and square formats, nine sharing targets through the OS, and no network client of any kind.

### Known limitation

- The MSIX (Microsoft Store) build installs but does not launch: electron-builder 27 alpha embeds
  an asar-integrity hash that Electron 39 rejects. The portable build runs. See the
  STORE-BLOCKERS notes in `audit/`.

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
