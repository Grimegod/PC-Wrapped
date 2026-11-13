$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

$ownPid = 0
[int]::TryParse($env:PC_WRAPPED_PID, [ref]$ownPid) | Out-Null
while ($true) {
    # The app is gone (closed, killed from Task Manager): stop polling rather than outlive it.
    if (-not (Get-Process -Id $ownPid -ErrorAction SilentlyContinue)) { break }
    try {
        $hwnd = [ForegroundWindow]::GetForegroundWindow()
        [uint32]$processId = 0
        [ForegroundWindow]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
        if ($processId -gt 0 -and $processId -ne $ownPid) {
            $p = Get-Process -Id $processId -ErrorAction Stop
            $appId = [IO.Path]::GetFileNameWithoutExtension($p.ProcessName).ToLowerInvariant()
            $label = $p.ProcessName
            try {
                $exePath = $p.MainModule.FileName
                $product = [Diagnostics.FileVersionInfo]::GetVersionInfo($exePath).ProductName
                if (-not [string]::IsNullOrWhiteSpace($product)) { $label = $product.Trim() }
            } catch { }
            if ([string]::IsNullOrWhiteSpace($label)) { $label = $appId }
            if ($label.Length -gt 80) { $label = $label.Substring(0, 80) }
            [pscustomobject]@{ appId = $appId; label = $label; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
        }
    } catch { }
    Start-Sleep -Milliseconds 2000
}
