# Store setup for PC Wrapped: trust the test certificate, install the MSIX, run the certification kit.
#
# Run this one of these ways:
#   * Right-click -> Run with PowerShell
#   * powershell -ExecutionPolicy Bypass -File scripts\store\store-setup.ps1
# It asks Windows for permission once (a UAC prompt), then does everything else itself.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$result = Join-Path $env:TEMP 'pcw-store-result.txt'
$wack = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
$msix = Join-Path $root 'release\PC-Wrapped-0.1.0-x64.msix'
$cer = Join-Path $env:TEMP 'pcw-cert\test.cer'

function Say($text) {
  Write-Host $text
  Add-Content -Path $result -Value $text
}

Set-Content -Path $result -Value "start $(Get-Date -Format o)"

# Re-launch elevated if we are not already, so one click is all this takes.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Asking Windows for permission...'
  $shell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
  Start-Process -FilePath $shell -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
  )
  exit
}

Say 'cert: trusting test certificate'
if (Test-Path $cer) {
  try {
    Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
    Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
    Say 'cert: trusted machine-wide'
  } catch { Say ('cert failed: ' + $_.Exception.Message) }
} else {
  Say ('cert missing: ' + $cer + ' - run scripts\store\make-test-cert.ps1 first')
}

Say 'install: adding package'
try {
  Add-AppxPackage -Path $msix -ErrorAction Stop
  Say 'install: OK'
} catch { Say ('install failed: ' + $_.Exception.Message) }

$pkg = Get-AppxPackage -Name 'PCWrapped.Test'
if ($pkg) {
  Say ('package: ' + $pkg.PackageFullName)
  Say ('location: ' + $pkg.InstallLocation)
  Say ('status: ' + $pkg.Status)
} else { Say 'package: not registered' }

if ($pkg -and (Test-Path $wack)) {
  $report = Join-Path $root 'audit\wack-report.xml'
  $out = Join-Path $env:TEMP 'pcw-wack-output.txt'
  Say 'wack: running (this takes a few minutes)'
  & $wack test -package $pkg.PackageFullName -reportoutputpath $report -appusage none *> $out
  Say ('wack exit: ' + $LASTEXITCODE)
  if (Test-Path $out) { Get-Content $out | Select-Object -First 40 | ForEach-Object { Say ('  ' + $_) } }
  if (Test-Path $report) { Say 'wack: report written' } else { Say 'wack: no report' }
} else {
  Say ('wack: skipped (package=' + [bool]$pkg + ', exe=' + (Test-Path $wack) + ')')
}

Say 'done'
Write-Host ''
Write-Host "Result saved to $result"
Write-Host 'You can close this window.'
Start-Sleep -Seconds 6
