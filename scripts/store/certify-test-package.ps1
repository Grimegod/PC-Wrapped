# Certify the newest test MSIX (release-test\*.msix) with the Windows App Certification Kit.
#
# Called by scripts\dev\build-store.cmd after it has built the test package. It asks Windows for
# permission once (a UAC prompt), because installing a self-signed package and running appcert.exe
# both need an elevated session. Steps:
#   1. make sure the Windows App Certification Kit (part of the Windows SDK) is installed;
#   2. create or reuse the throwaway "CN=PC Wrapped Test" certificate and trust it machine-wide;
#   3. sign the test MSIX with it and install it;
#   4. run appcert.exe and summarise the report;
#   5. clean up: uninstall the test package and remove the test certificate from the machine stores.
# Everything is written to audit\store-certify.log. ASCII only: Windows PowerShell 5.1 reads
# BOM-less scripts in the ANSI code page.

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$log = Join-Path $root 'audit\store-certify.log'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Set-Content -Path $log -Value "waiting for permission (UAC) $(Get-Date -Format o)"
  Write-Host ' Windows iti cere permisiunea. Apasa "Da" / "Yes".'
  try {
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    exit $proc.ExitCode
  } catch {
    Add-Content -Path $log -Value ('permission refused or failed: ' + $_.Exception.Message)
    exit 2
  }
}

function Log($text) {
  Write-Host (' ' + $text)
  Add-Content -Path $log -Value $text
}
Set-Content -Path $log -Value "start $(Get-Date -Format o) as $([Security.Principal.WindowsIdentity]::GetCurrent().Name)"

# 1. Windows App Certification Kit.
function Find-AppCert {
  @(
    'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe',
    'C:\Program Files\Windows Kits\10\App Certification Kit\appcert.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
$wack = Find-AppCert
if (-not $wack) {
  Log 'wack: not installed - installing the Windows SDK with winget (this can take a while)'
  winget install -e --id Microsoft.WindowsSDK.10.0.26100 --silent --accept-package-agreements --accept-source-agreements 2>&1 |
    ForEach-Object { Add-Content -Path $log -Value ('  ' + $_) }
  $wack = Find-AppCert
}
Log ('wack: ' + ($wack -as [string]))
if (-not $wack) { Log 'STOP: the certification kit is still missing'; exit 3 }

$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
Log ('signtool: ' + ($signtool.FullName -as [string]))
if (-not $signtool) { Log 'STOP: signtool.exe not found in the Windows SDK'; exit 3 }

# 2. Test package and throwaway certificate.
$msix = Get-ChildItem -Path (Join-Path $root 'release-test') -Filter '*.msix' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
Log ('test package: ' + ($msix.FullName -as [string]))
if (-not $msix) { Log 'STOP: no test package in release-test'; exit 4 }

$certDir = Join-Path $root 'release-test\cert'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
# Only a certificate with its private key can sign. Older runs may have left one without it.
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
  $_.Subject -eq 'CN=PC Wrapped Test' -and $_.NotAfter -gt (Get-Date) -and $_.HasPrivateKey
} | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=PC Wrapped Test' -KeyUsage DigitalSignature `
    -FriendlyName 'PC Wrapped Test' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyExportPolicy Exportable `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  Log 'cert: created'
}
$cer = Join-Path $certDir 'test.cer'
try {
  Export-Certificate -Cert $cert -FilePath $cer -ErrorAction Stop | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' -ErrorAction Stop | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\Root' -ErrorAction Stop | Out-Null
  Log ('cert: trusted for this test, thumbprint ' + $cert.Thumbprint)
} catch { Log ('cert failed: ' + $_.Exception.Message) }

# 3. Sign straight from the certificate store (no key file on disk) and install.
& $signtool.FullName sign /fd SHA256 /s My /sha1 $cert.Thumbprint $msix.FullName 2>&1 | ForEach-Object { Add-Content -Path $log -Value ('  ' + $_) }
$signature = (Get-AuthenticodeSignature -FilePath $msix.FullName).Status
Log ('signature: ' + $signature)

Get-AppxPackage -Name 'PCWrapped.Test' | ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName -ErrorAction SilentlyContinue }
try {
  Add-AppxPackage -Path $msix.FullName -ErrorAction Stop
  Log 'install: OK'
} catch { Log ('install failed: ' + $_.Exception.Message) }
$pkg = Get-AppxPackage -Name 'PCWrapped.Test' | Select-Object -First 1
Log ('installed: ' + ($pkg.PackageFullName -as [string]) + ' status ' + ($pkg.Status -as [string]))

# 4. Certification kit.
$report = Join-Path $root ('audit\wack-report-' + $msix.BaseName + '.xml')
if (Test-Path $report) { Remove-Item $report -Force }
Log 'wack: running - this takes several minutes, do not close the window'
& $wack test -appxpackagepath $msix.FullName -reportoutputpath $report 2>&1 | ForEach-Object { Add-Content -Path $log -Value ('  ' + $_) }
Log ('wack exit: ' + $LASTEXITCODE)
if (-not (Test-Path $report) -and $pkg) {
  Log 'wack: retrying against the installed package'
  & $wack test -packagefullname $pkg.PackageFullName -reportoutputpath $report 2>&1 | ForEach-Object { Add-Content -Path $log -Value ('  ' + $_) }
  Log ('wack exit: ' + $LASTEXITCODE)
}

if (Test-Path $report) {
  $xml = [xml](Get-Content $report -Raw)
  Log ('OVERALL: ' + $xml.REPORT.OVERALL_RESULT)
  foreach ($req in @($xml.REPORT.REQUIREMENTS.REQUIREMENT)) {
    foreach ($test in @($req.TEST)) {
      $optional = ''
      if ($test.OPTIONAL -eq 'TRUE') { $optional = ' (optional)' }
      Log ('  ' + $test.RESULT.'#cdata-section' + $optional + ' - ' + $req.TITLE + ' / ' + $test.NAME)
      if ($test.RESULT.'#cdata-section' -ne 'PASS') {
        $messages = @($test.MESSAGES.MESSAGE | Where-Object { $_ })
        foreach ($message in ($messages | Select-Object -First 6)) { Log ('      ' + $message.TEXT) }
        if ($messages.Count -gt 6) { Log ('      ... and ' + ($messages.Count - 6) + ' more in the report') }
      }
    }
  }
  Log ('report: ' + $report)
} else {
  Log 'wack: NO REPORT - see the messages above'
}

# 5. Clean up: the test package and the machine-wide trust are only for this run.
Get-AppxPackage -Name 'PCWrapped.Test' | ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName -ErrorAction SilentlyContinue }
foreach ($store in 'Cert:\LocalMachine\Root', 'Cert:\LocalMachine\TrustedPeople') {
  Get-ChildItem $store | Where-Object { $_.Thumbprint -eq $cert.Thumbprint } | Remove-Item -ErrorAction SilentlyContinue
}
Log 'cleanup: test package removed, test certificate no longer trusted machine-wide'
Log 'done'
Start-Sleep -Seconds 3
