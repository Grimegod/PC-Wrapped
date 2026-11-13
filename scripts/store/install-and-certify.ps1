$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$result = Join-Path $env:TEMP 'pcw-store-result.txt'
function Log($text) { Add-Content -Path $result -Value $text }
Set-Content -Path $result -Value "start $(Get-Date -Format o) as $([Security.Principal.WindowsIdentity]::GetCurrent().Name)"

# 1. Trust the throwaway test certificate machine-wide.
$cer = Join-Path $env:TEMP 'pcw-cert\test.cer'
try {
  Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
  Log 'cert: trusted machine-wide'
} catch { Log ('cert failed: ' + $_.Exception.Message) }

# 2. Install the test-signed MSIX.
$msix = Join-Path $root 'release\PC-Wrapped-0.1.0-x64.msix'
try {
  Add-AppxPackage -Path $msix -ErrorAction Stop
  Log 'install: OK'
} catch { Log ('install failed: ' + $_.Exception.Message) }

$pkg = Get-AppxPackage -Name 'PCWrapped.Test'
if ($pkg) {
  Log ('package: ' + $pkg.PackageFullName)
  Log ('location: ' + $pkg.InstallLocation)
  Log ('status: ' + $pkg.Status)
} else {
  Log 'package: not registered'
}

# 3. Windows App Certification Kit, if the package installed.
$wack = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
if ($pkg -and (Test-Path $wack)) {
  $report = Join-Path $root 'audit\wack-report.xml'
  $out = Join-Path $env:TEMP 'pcw-wack-output.txt'
  Log 'wack: running'
  & $wack test -package $pkg.PackageFullName -reportoutputpath $report -appusage none *> $out
  Log ('wack exit: ' + $LASTEXITCODE)
  if (Test-Path $out) { Get-Content $out | Select-Object -First 40 | ForEach-Object { Log ('  ' + $_) } }
  if (Test-Path $report) { Log 'wack: report written' } else { Log 'wack: no report' }
} else {
  Log ('wack: skipped (package=' + [bool]$pkg + ', exe=' + (Test-Path $wack) + ')')
}

Log 'done'
