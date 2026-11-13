$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$out = Join-Path $root 'audit\wack-run.log'
function Log($t) { Add-Content -Path $out -Value $t }

Set-Content -Path $out -Value "start $(Get-Date -Format o) as $([Security.Principal.WindowsIdentity]::GetCurrent().Name)"

$wack = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
$bundle = Get-ChildItem -Path (Join-Path $root 'release') -Filter '*.msix' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
Log ('package file: ' + ($bundle.FullName -as [string]))

$pkg = $null
try { $pkg = (Get-AppxPackage -Name 'PCWrapped.Test').PackageFullName } catch { Log ('lookup failed: ' + $_.Exception.Message) }
Log ('full name: ' + ($pkg -as [string]))

$report = Join-Path $root 'audit\wack-report.xml'
if (Test-Path $report) { Remove-Item $report -Force }

# appcert.exe has no "-package" switch. The real ones are -appxpackagepath (a file) and
# -packagefullname (an installed package). Try the file first, then the full name.
if ($bundle) {
  Log 'running appcert -appxpackagepath <file>...'
  & $wack test -appxpackagepath $bundle.FullName -reportoutputpath $report *>&1 | ForEach-Object { Log ('  ' + $_) }
  Log ('exit: ' + $LASTEXITCODE)
}

if (-not (Test-Path $report) -and $pkg) {
  Log 'running appcert -packagefullname <name>...'
  & $wack test -packagefullname $pkg -reportoutputpath $report *>&1 | ForEach-Object { Log ('  ' + $_) }
  Log ('exit: ' + $LASTEXITCODE)
}

Log ('report written: ' + (Test-Path $report))
Log 'done'
