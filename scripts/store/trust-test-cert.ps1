# Requires an elevated PowerShell.
# Trust the throwaway self-signed test certificate machine-wide so the test MSIX can be installed.
$ErrorActionPreference = 'Stop'
$cer = Join-Path $env:TEMP 'pcw-cert\test.cer'
if (-not (Test-Path $cer)) { throw "Missing $cer - run make-test-cert.ps1 first." }
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
Write-Output 'test certificate trusted machine-wide'
