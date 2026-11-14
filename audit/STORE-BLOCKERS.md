# Microsoft Store blockers — pre-publication audit, 13 November 2026

> **Superseded status (14 November 2026):** Partner Center now reports PC Wrapped as **In the
> Microsoft Store**. The findings below describe the state recorded before publication and are kept
> as historical engineering notes, not as a current release checklist.

## MSIX startup

The previous MSIX launch logs show Electron aborting because the digest embedded in the executable
does not match the packaged `app.asar` (`23ab3020…` versus `7c15b688…`). The earlier audit's claim
that this was caused by Electron hashing ASAR's NUL padding was incorrect; electron-builder and
Electron both hash the parsed header string. The exact build stage that changes the embedded digest
has not yet been isolated.

A local workaround is now in the `build:msix` command: build this target without ASAR and disable
`onlyLoadAppFromAsar` for that target. The portable target still uses ASAR. The generated app layout
is checked after packaging.

| Check                      | Result                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| MSIX test package built    | Pass; `release-msix-test/PC-Wrapped-1.0.0-x64.msix`, 156,749,136 bytes                       |
| Package layout             | Pass; files are under `app/resources/app`; no `app.asar` is present                          |
| Unpacked app startup       | Pass; the `PC Wrapped` window opened with isolated `%TEMP%` data and no ASAR-integrity error |
| Installed MSIX activation  | Not tested; this test package is unsigned                                                    |
| WACK on this exact package | Not tested                                                                                   |

This is a verified local startup workaround, not Store certification or a Store-ready release. It
unpacks the app's files and disables the `onlyLoadAppFromAsar` boundary for MSIX. ASAR does not
encrypt source files, but this package no longer has an ASAR integrity check. The portable package
is unaffected.

## Other readiness items

| Item                          | Status                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Windows App Certification Kit | An earlier report records 24/24 checks passing for its then-current package; rerun WACK on the final MSIX        |
| Tile art                      | Previously checked at required sizes                                                                             |
| Startup integration           | The hardcoded startup extension was removed; verify opt-in behavior from the installed package                   |
| Tracker policy                | `-ExecutionPolicy Bypass` was removed from the tracker command                                                   |
| Automated checks              | 58 tests pass; both TypeScript projects type-check                                                               |
| Privacy                       | Local-only event model; no window titles, screenshots or keyboard monitoring; renderer denies remote connections |
| Store publication             | Partner Center now reports **In the Microsoft Store**; this audit predates that status                           |

## What remains before submission

1. Reserve the app in Partner Center and replace the placeholder `identityName` and `publisher` in
   `package.json`; the identity check intentionally refuses placeholder values.
2. Build with that identity, sign/install the resulting package and test it from `WindowsApps`.
   Verify tracking opt-in, start-at-login, data retention/deletion, tray behavior and the tracker.
3. Run WACK on that exact package and resolve any findings.
4. Prepare the Store listing, privacy policy URL, age rating, screenshots and support contact.

Separately, capture the executable's integrity resource before and after each MSIX packaging stage.
If the builder mismatch is corrected upstream, restore ASAR for MSIX and re-enable
`onlyLoadAppFromAsar` rather than retaining the workaround indefinitely.
