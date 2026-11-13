$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$result = Join-Path $env:TEMP 'pcw-check-result.txt'
function Log($text) { Add-Content -Path $result -Value $text }
Set-Content -Path $result -Value "start $(Get-Date -Format o)"

# 1. Is WACK installed on this machine?
$wack = @(
  'C:\Program Files\Windows Kits\10\App Certification Kit\appcert.exe',
  'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
Log ('wack path: ' + ($wack -as [string]))
if ($wack) { Log ('wack version: ' + (Get-Item $wack).VersionInfo.FileVersion) }

# 2. Is the MSIX structurally valid? sproot does not need the package to be trusted.
$msix = Join-Path $root 'release\PC-Wrapped-0.1.0-x64.msix'
Log ('msix exists: ' + (Test-Path $msix))
Log ('msix MB: ' + [math]::Round((Get-Item $msix).Length / 1MB, 1))

# 3. What the packaged exe reports about itself.
$exe = Join-Path $root 'release\win-unpacked\PC Wrapped.exe'
$sig = Get-AuthenticodeSignature -FilePath $exe
Log ('exe signature: ' + $sig.Status)
Log ('exe signer: ' + ($sig.SignerCertificate.Subject -as [string]))
Log ('exe version: ' + (Get-Item $exe).VersionInfo.FileVersion)

Log 'done'
