$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$out = Join-Path $root 'audit\msix-asar.log'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Log($t) { Add-Content -Path $out -Value $t }
Set-Content -Path $out -Value "start $(Get-Date -Format o)"

$z = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $root 'release\PC-Wrapped-0.1.0-x64.msix'))
$e = $z.Entries | Where-Object { $_.FullName -eq 'app/resources/app.asar' }
Log ('zip entry: ' + $e.Length + ' bytes, compressed ' + $e.CompressedLength)
$ms = New-Object System.IO.MemoryStream
$s = $e.Open(); $s.CopyTo($ms); $s.Close()
$b = $ms.ToArray()
$sha = [System.Security.Cryptography.SHA256]::Create()
Log ('sha256 of zip payload: ' + ((($sha.ComputeHash($b)) | ForEach-Object { $_.ToString('x2') }) -join ''))
Log ('first 16 bytes: ' + (($b[0..15] | ForEach-Object { $_.ToString('x2') }) -join ' '))
$z.Dispose()

$installed = (Get-AppxPackage -Name 'PCWrapped.Test').InstallLocation
$asar = Join-Path $installed 'app\resources\app.asar'
$ib = [System.IO.File]::ReadAllBytes($asar)
Log ('installed asar: ' + $ib.Length + ' bytes, sha256 ' + ((($sha.ComputeHash($ib)) | ForEach-Object { $_.ToString('x2') }) -join ''))
Log ('first 16 bytes: ' + (($ib[0..15] | ForEach-Object { $_.ToString('x2') }) -join ' '))

# The exe's asar-integrity resource holds the expected hash as a UTF-16 string.
$exe = Join-Path $installed 'app\PC Wrapped.exe'
$text = [System.IO.File]::ReadAllText($exe, [System.Text.Encoding]::Unicode)
foreach ($h in @('1671f0d3aa21bac1250011d3deb1287d412735b19ff0171e6ffb322031cd7089', '05f47c19e395c81b472b9df391c1de7e8089c77b03bad66193a473cba203fe4c')) {
  Log ('exe expects ' + $h.Substring(0, 12) + '...: ' + $text.Contains($h))
}
Log 'done'
