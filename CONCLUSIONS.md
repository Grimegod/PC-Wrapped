# PC Wrapped 1.0.0 — conclusions

Audit date: 13 November 2026 · Version: **1.0.0** · Repository: `https://github.com/Grimegod/PC-Wrapped`

**Status update — 14 November 2026:** Partner Center now reports PC Wrapped as **In the Microsoft Store**. The pre-submission findings below record the state before publication and are historical; they do not describe the current Store package.

## What this project is now

A complete, working, local-only Windows activity recap: it samples the foreground app, stores daily
per-app aggregates, renders story and square recap cards, and hands them to nine sharing targets
through the OS. No account, no network client, no telemetry — the renderer's CSP is
`default-src 'none'; connect-src 'none'` and that is enforced by test.

## What is verified, and how

| Claim                         | Evidence                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| The app runs                  | Portable build launched: window "PC Wrapped", 4 processes (`audit/portable-test.log`)  |
| Tests                         | 58 passing (`tsx --test tests/*.test.ts`)                                              |
| Types and lint                | `tsc --noEmit` clean, ESLint `--max-warnings 0` clean, Prettier clean                  |
| Windows App Certification Kit | **PASS on an earlier package**; rerun against the current MSIX before submission       |
| Package installs              | An earlier signed test package installed as `PCWrapped.Test`; current test is unsigned |
| Package signature             | **Valid on the earlier test package**; current no-ASAR test package is unsigned        |
| MSIX workaround               | No-ASAR package layout passed; the unpacked executable opened the app window           |
| No network                    | CSP locked, no HTTP client in `src/`                                                   |
| Privacy                       | daily aggregates only; hidden apps appear as "Hidden app"; no titles, no screenshots   |

## Original MSIX failure and corrected explanation

**The MSIX build installs but does not launch.** Every launch aborts with:

```
FATAL:electron\shell\common\asar\asar_util.cc:143] Integrity check failed for asar archive
```

The launch logs show a mismatch between the digest embedded in the executable and the digest
calculated from `app.asar` (`23ab3020…` versus `7c15b688…`). The earlier report's explanation that
Electron includes the header's seven NUL padding bytes was incorrect: electron-builder and Electron
both hash the parsed header string. The exact packaging stage that changes the embedded digest has
not been isolated.

What was tried and did not help: rebuilding and reinstalling; `enableEmbeddedAsarIntegrityValidation:
false` (the resource is written and checked regardless); pinning electron-builder to 26.18.1 (it
rejects this config — `fileOptions` and `msix` are 27-only); stripping the resource from the exe by
hand (the MSIX target re-adds it).

The no-ASAR workaround has now been applied to the MSIX target only. The test package contains the
application under `resources/app`, has no `app.asar`, and its unpacked executable opened the `PC
Wrapped` window with isolated `%TEMP%` data and no integrity error. The package is unsigned, so
Windows package installation and activation have not been tested. The portable target still uses
ASAR. Waiting for an upstream builder fix remains the path to restoring ASAR in MSIX.

## What was fixed during this work

- Emoji rendered as tofu on cards → local font registration plus emoji run-splitting.
- Square and story cards overlapped and left an empty block → layout rebuilt around a shared
  character box; a zero-data day now renders an explicit empty card.
- Card palette was funeral brown → bright gradient with deterministic confetti.
- Activity time could exceed wall-clock time → per-sample clamp and a 24-hour day cap.
- The MSIX manifest declared a hardcoded `SlackStartup` task → removed; startup handled in
  `src/main/startup.ts`, off by default.
- `Wide310x150Logo.png` was missing/wrong size → all eight tile assets generated at exact sizes.
- `powershell.exe -ExecutionPolicy Bypass` on the tracker launch → removed. This was the exact
  string Bitdefender reported as a "malicious command line".
- IPC and navigation were open → every handler verifies the sender, navigation and new windows are
  refused, permissions denied.
- MSIX ASAR integrity mismatch → MSIX now builds without ASAR and with `onlyLoadAppFromAsar` disabled;
  a post-build layout check and synthetic regression test guard the workaround. This is a local
  startup workaround, not an installed-package or Store certification result.

## Store status at the time of this audit

At the audit date, the local workaround opened the unpacked app, but the generated MSIX was unsigned
and had not been installed or launched through Windows package activation. Partner Center now
reports the product as **In the Microsoft Store**. This audit does not establish which package
changes were made after 13 November; use the current Store listing and release records for that.

## If someone else picks this up

Read these as dated engineering records: `audit/STORE-BLOCKERS.md`, `audit/WACK-RESULT.md`,
`audit/MSIX-INTEGRITY.md`, and `audit/FIXES-APPLIED.md`. Some findings were superseded by the Store
publication on 14 November 2026.
