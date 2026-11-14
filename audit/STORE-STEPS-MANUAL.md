# Store setup, step by step (no elevation needed for the checks)

If `store-setup.ps1` did not finish, this is the manual path. Run each line from the repository
folder in PowerShell and read what it prints. Lines marked **[admin]** need an elevated PowerShell window
(_Start → "PowerShell" → right-click → Run as administrator_).

## A. What should already be true

```powershell
# 1. The package exists and its signature is valid.
Get-AuthenticodeSignature '.\release\PC-Wrapped-0.1.0-x64.msix' | Select-Object Status

# 2. The throwaway test certificate is trusted for your user.
Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -eq 'CN=PC Wrapped Test' } | Select-Object Subject, NotAfter

# 3. The certification kit is installed.
Test-Path 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
```

Expected: `Valid`, the certificate listed, `True`.

## B. [admin] Trust the certificate machine-wide

Windows refuses to install a package whose root certificate is not trusted for the whole machine.

```powershell
$cer = Join-Path $env:TEMP 'pcw-cert\test.cer'
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\Root'
```

Check: `Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -eq 'CN=PC Wrapped Test' }`

## C. Install the package

This step does **not** need admin.

```powershell
Add-AppxPackage -Path '.\release\PC-Wrapped-0.1.0-x64.msix'
Get-AppxPackage -Name 'PCWrapped.Test' | Select-Object PackageFullName, Status
```

Expected: one package, `Status = Ok`. **This is confirmed working** —
`PCWrapped.Test_0.1.0.0_x64__hg23wmq7gw2m6`, installed at
`C:\Program Files\WindowsApps\PCWrapped.Test_0.1.0.0_x64__hg23wmq7gw2m6`. If you get `0x800B0109`, step B did not apply.
If you get `0x800B0100`, the package is unsigned — rebuild it with the signing arguments in
`audit\STORE-READINESS.md`.

Start it once from the Start menu, then close it from the tray.

## D. [admin] Run the Windows App Certification Kit

```powershell
powershell -ExecutionPolicy Bypass -File scripts\store\run-wack.ps1
```

That script elevates itself and prints a PASS/FAIL summary per check. Or run `appcert.exe` directly:

```powershell
& 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe' test `
  -package (Get-AppxPackage -Name 'PCWrapped.Test').PackageFullName `
  -reportoutputpath '.\audit\wack-report.xml' `
  -appusage none
```

It takes a few minutes and prints a PASS/FAIL summary. The XML report is what matters; open it or
send it over and I will read it.

## E. What to look at while the app is installed

- **Start-at-login**: toggle it in Settings, then check
  `Task Manager → Startup apps` for PC Wrapped.
- **History survives a restart**: track a few minutes, quit from the tray, reopen, check the numbers.
- **Delete all history** really empties it (the data lives in a virtualised `%LOCALAPPDATA%` inside the package).
- **Tray icon and tracking** work when the app runs from `C:\Program Files\WindowsApps`.
