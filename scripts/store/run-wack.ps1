# Run the Windows App Certification Kit on the installed PC Wrapped test package.
#
# Usage, from an ADMIN PowerShell window in the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\store\run-wack.ps1
#
# If it is not elevated it says so and stops; it never runs appcert.exe un-elevated, because that
# fails silently with no output.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$report = Join-Path $root 'audit\wack-report.xml'
$log = Join-Path $root 'audit\wack-run.log'
$inner = Join-Path $PSScriptRoot 'wack-inner.ps1'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host ('elevated: ' + $isAdmin)
if (-not $isAdmin) {
  Write-Host 'This must run in an ADMIN PowerShell window (right-click PowerShell > Run as administrator).'
  exit 1
}

# Run the real work, capturing everything it prints into the log.
& $inner 2>&1 | ForEach-Object { Write-Host $_ }
Add-Content -Path $log -Value ('script exit: ' + $LASTEXITCODE)

if (Test-Path $report) {
  $xml = [xml](Get-Content $report -Raw)
  $checks = @($xml.REQUIREMENTS.REQUIREMENT)
  $failed = @($checks | Where-Object { $_.STATUS -ne 'PASS' })
  Write-Host ''
  Write-Host ('checks: ' + $checks.Count + ', not passing: ' + $failed.Count)
  $failed | ForEach-Object { Write-Host ('  ' + $_.STATUS + ' - ' + $_.DESCRIPTION) }
} else {
  Write-Host 'No report written - see the messages above and audit\wack-run.log'
}
