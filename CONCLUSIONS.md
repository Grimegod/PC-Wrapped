# PC Wrapped 1.0.0 — conclusions

Date: 13 November 2026 · Version: **1.0.0** · Repository: `https://github.com/Grimegod/PC-Wrapped`

## What this project is now

A complete, working, local-only Windows activity recap: it samples the foreground app, stores daily
per-app aggregates, renders story and square recap cards, and hands them to nine sharing targets
through the OS. No account, no network client, no telemetry — the renderer's CSP is
`default-src 'none'; connect-src 'none'` and that is enforced by test.

## What is verified, and how

| Claim                         | Evidence                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| The app runs                  | Portable build launched: window "PC Wrapped", 4 processes (`audit/portable-test.log`) |
| Tests                         | 56 passing (`tsx --test tests/*.test.ts`)                                             |
| Types and lint                | `tsc --noEmit` clean, ESLint `--max-warnings 0` clean, Prettier clean                 |
| Windows App Certification Kit | **PASS**, 24/24 required checks (`audit/wack-report.xml`)                             |
| Package installs              | `PCWrapped.Test`, `Status = Ok`, `SignatureKind = Developer`                          |
| Package signature             | `Valid` (`Get-AuthenticodeSignature`)                                                 |
| No network                    | CSP locked, no HTTP client in `src/`                                                  |
| Privacy                       | daily aggregates only; hidden apps appear as "Hidden app"; no titles, no screenshots  |

## What does not work, and why

**The MSIX build installs but does not launch.** Every launch aborts with:

```
FATAL:electron\shell\common\asar\asar_util.cc:143] Integrity check failed for asar archive
```

Root cause, established by direct measurement: `electron-builder 27.0.0-alpha.14` hashes the asar
header **without its 7 bytes of NUL padding** (`7c15b688…`), while Electron 39 hashes the header **as
stored** (`edd566ba…`). The whole file hashes to `c73b9fee…`, which is neither.

What was tried and did not help: rebuilding and reinstalling; `enableEmbeddedAsarIntegrityValidation:
false` (the resource is written and checked regardless); pinning electron-builder to 26.18.1 (it
rejects this config — `fileOptions` and `msix` are 27-only); stripping the resource from the exe by
hand (the MSIX target re-adds it).

The two untried options: `"asar": false` for the MSIX target (no asar, nothing to verify — works but
weakens packaging), or waiting for a fixed electron-builder 27 beta.

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

## Straight verdict on the Store

Not submittable today: a package that crashes on launch fails certification, whatever else is right.
Once the MSIX launches, the remaining work is Partner Center paperwork, a real publisher identity in
`package.json`, one day of using the installed build, and the listing assets.

## If someone else picks this up

Read, in order: `audit/STORE-BLOCKERS.md` (the one real blocker), `audit/WACK-RESULT.md` (what the
certification kit said), `audit/MSIX-INTEGRITY.md` (the hash mismatch, with the numbers), and
`audit/FIXES-APPLIED.md` (everything repaired, with how it was verified). The code itself is in good
shape; the packaging tool is not.
