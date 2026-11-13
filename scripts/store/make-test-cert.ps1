$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:TEMP 'pcw-cert'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=PC Wrapped Test' } | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=PC Wrapped Test' -KeyUsage DigitalSignature `
    -FriendlyName 'PC Wrapped Test' -CertStoreLocation 'Cert:\CurrentUser\My' `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
}

$pwd = ConvertTo-SecureString -String 'pctest' -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath (Join-Path $dir 'test.pfx') -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath (Join-Path $dir 'test.cer') | Out-Null

# Trust the throwaway certificate on this machine only, so the package can be installed and tested.
Import-Certificate -FilePath (Join-Path $dir 'test.cer') -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null

Write-Output $cert.Thumbprint
