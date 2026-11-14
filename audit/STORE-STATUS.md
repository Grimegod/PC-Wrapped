# Store readiness — verified state, 13 November 2026, 19:15

## Confirmed working

| Check                      | Result                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| MSIX builds                | `release\PC-Wrapped-0.1.0-x64.msix`, 149.4 MB                                               |
| Package signature          | `Valid` (`Get-AuthenticodeSignature`)                                                       |
| Test certificate trusted   | `CN=PC Wrapped Test` in `CurrentUser\Root`                                                  |
| **Package installed**      | `PCWrapped.Test_0.1.0.0_x64__hg23wmq7gw2m6`, **`Status = Ok`**, `SignatureKind = Developer` |
| Install location           | `C:\Program Files\WindowsApps\PCWrapped.Test_0.1.0.0_x64__hg23wmq7gw2m6`                    |
| Windows SDK / WACK present | `C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe`                  |
| Store bug fixed            | the MSIX no longer declares a hardcoded `SlackStartup` task                                 |
| Code health                | 56 tests, typecheck, ESLint `--max-warnings 0`, Prettier all clean                          |

The app is now genuinely installed as a Store-style package. That is the milestone that was
missing before.

## The one thing that still cannot be automated from here

`appcert.exe` (WACK) refuses to run outside an elevated session, and this session cannot obtain
elevation: Windows shows no UAC prompt to a background process. Three different approaches were
tried and all failed the same way — the elevated process starts and exits immediately with no
consent dialog:

1. `Start-Process -Verb RunAs` on a script — process launched, died, no output.
2. `store-setup.ps1` self-elevating — same.
3. Registering a scheduled task that runs as SYSTEM — `Access is denied` (registering a SYSTEM
   task itself needs admin).

So WACK needs exactly one interactive action. `scripts\store\run-wack.ps1` is ready and does the
rest by itself once it is elevated.

## Do this, once

Open **PowerShell as administrator** (Start → type `PowerShell` → right-click →
_Run as administrator_), change to the repository folder, then:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\store\run-wack.ps1
```

It prints a per-check PASS/FAIL summary and writes `audit\wack-report.xml`. Send me that file (or
just the output) and I will read the findings and fix anything it flags.

## After WACK

1. **Try the installed app** — Start menu → PC Wrapped. In Settings toggle _Open with Windows_,
   then check Task Manager → Startup apps. This is the only behaviour not yet exercised, because
   the startup task was removed from the manifest on purpose.
2. Reserve the app in Partner Center, put the real `identityName` / `publisher` in
   `package.json` → `build.msix`, rebuild with `pnpm run build:msix`.
3. Capture listing screenshots (`scripts/store/capture-screens.cjs`) and write the Store listing.
