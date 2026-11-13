# Store readiness — what is done, what needs one click from you

Status: **15 November 2026** · Package built and signed for testing · install and WACK still pending.

---

## Done

| Item                                                 | Result                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MSIX builds from scratch                             | `pnpm build:msix` produces `release/PC-Wrapped-0.1.0-x64.msix` (149 MB).                                                                                                                                                                                                                                                         |
| Package identity can be swapped without code changes | Built with a throwaway identity `PCWrapped.Test` / `CN=PC Wrapped Test` and a self-signed test certificate; the real values go in `package.json` → `build.msix`.                                                                                                                                                                 |
| Package is signed                                    | `signtool` reports a valid signature; `Get-AuthenticodeSignature` on the MSIX returns **Valid**.                                                                                                                                                                                                                                 |
| Throwaway test certificate created                   | `scripts/store/make-test-cert.ps1`, trusted for the current user.                                                                                                                                                                                                                                                                |
| **Bug found and fixed: MSIX startup task**           | `addAutoLaunchExtension` wrote a hardcoded startup task id **`SlackStartup`** into the manifest, and declared a startup extension at all — which contradicts the README's promise that start-at-login is off by default and decided in the app. It is now **off**, and startup goes through `src/main/startup.ts` (2 new tests). |
| Screenshot tooling written                           | `scripts/store/capture-screens.cjs` loads the real renderer at 1920×1080 with a stubbed IPC bridge. It has not been run to completion here (no display in this session); run it on your desktop.                                                                                                                                 |
| Readiness check                                      | `scripts/store/check-store-readiness.ps1` — reports WACK presence, package size and exe signature. Run output: `wack path: <empty>`, `msix exists: True`, `msix MB: 149.4`, `exe signature: Valid`.                                                                                                                              |

## Blocked in this session

Both need one elevated action that cannot be automated from here — Windows refuses to raise the
UAC prompt without an interactive desktop, and the local certificate store cannot be written from
this non-admin session.

1. **Install the test package.** Windows rejects an unsigned or untrusted-root MSIX (`0x800B0100`
   without a signature, `0x800B0109` when the self-signed root is not machine-trusted). The
   signature is fine; only the trust step is missing.
2. **Run the Windows App Certification Kit.** WACK (`appcert.exe`) is **not installed** on this
   machine at all — it ships with the Windows SDK, not with Windows.

### Run these two, in an elevated PowerShell, in this folder

```powershell
# 1. Trust the throwaway test certificate machine-wide, then install and certify.
powershell -ExecutionPolicy Bypass -File scripts\store\install-and-certify.ps1
```

That script trusts `%TEMP%\pcw-cert\test.cer`, installs the MSIX, prints the registered package
and, if WACK is present, runs it and writes `audit\wack-report.xml`.

If WACK is missing, install it first (it is part of the Windows SDK):

```powershell
winget install Microsoft.WindowsSDK.10.0.26100
```

Then re-run the script. Results land in `%TEMP%\pcw-install-result.txt` and `audit\wack-report.xml`.

## What still needs doing before submission

1. **Reserve the app in Partner Center**, then put the real identity in `package.json`:
   ```json
   "msix": {
     "identityName": "<Publisher>.<AppName>",
     "publisher": "CN=<your publisher from Partner Center>",
     "displayName": "PC Wrapped",
     "publisherDisplayName": "<your display name>"
   }
   ```
   `pnpm run check:identity` fails until both are real — that is intentional.
2. **Rebuild** with `pnpm run build:msix`. For the Store you do **not** sign the MSIX yourself;
   Microsoft signs it. Delete the test-sign paths from any local command you use.
3. **Install that MSIX and use it for a day** — this is the only untested surface:
   - Start-at-login: confirm the toggle actually creates the Windows startup entry. The startup
     task was removed, so this now goes through the ordinary login item; verify it works from the
     packaged location.
   - Data location: `%LOCALAPPDATA%` is virtualised inside an MSIX. Confirm history survives a
     restart, and that **Delete all history** really clears it.
   - Tray icon and `tracker.ps1` must both work when the app runs from `WindowsApps`.
4. **Screenshots for the Store listing**: close the dev app, then
   ```powershell
   pnpm run build:ts
   .\node_modules\electron\dist\electron.exe scripts\store\capture-screens.cjs
   ```
   Output: `audit\store\store-01-dashboard.png`, `store-02-card-and-sharing.png` (1920×1080).
5. **Store listing copy**: age-rating questionnaire, privacy policy URL, support contact, category
   (Productivity / Personal), and the description. The README's "What it does / What it does not
   do" sections are already the right tone and can be trimmed into the listing.

## Honest assessment

The _code_ is ready: clean build, 56 tests, lint and format clean, no network client, honest
privacy story, Electron fuses set, and an unsigned-but-valid package that is structurally a
correct MSIX. What has **not** happened is a single run of the app as a packaged MSIX, and no
Store submission has ever been reviewed. Those are the two risks left, and both are a day's work
once the Partner Center reservation exists.
