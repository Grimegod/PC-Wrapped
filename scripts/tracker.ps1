$ErrorActionPreference = 'SilentlyContinue'
# The app reads this script's output as UTF-8. Without this, Windows PowerShell writes in the console
# code page and app names lose their accents and symbols ("Microsoft(R) Windows(R)" arrives as "Microsoftr Windowsr").
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PcWrappedWindow {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

    const int GWL_STYLE = -16;
    const int WS_CAPTION = 0x00C00000;
    const uint MONITOR_DEFAULTTONEAREST = 2;

    public static IntPtr Foreground() { return GetForegroundWindow(); }

    public static uint ProcessOf(IntPtr hWnd) {
        uint processId;
        GetWindowThreadProcessId(hWnd, out processId);
        return processId;
    }

    public static string ClassOf(IntPtr hWnd) {
        var name = new StringBuilder(256);
        GetClassName(hWnd, name, name.Capacity);
        return name.ToString();
    }

    // Store (UWP) apps draw inside a frame window owned by ApplicationFrameHost.exe. The app itself is
    // the process that owns a child window of that frame.
    public static uint HostedProcess(IntPtr frame, uint frameProcessId) {
        uint found = 0;
        EnumChildWindows(frame, (child, unused) => {
            uint childProcessId = ProcessOf(child);
            if (childProcessId != 0 && childProcessId != frameProcessId) { found = childProcessId; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    // Full screen: the window covers its whole monitor and has no title bar. A maximised window keeps
    // its title bar, and the desktop and taskbar are never counted.
    public static bool IsFullscreen(IntPtr hWnd) {
        string cls = ClassOf(hWnd);
        if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return false;
        if ((GetWindowLong(hWnd, GWL_STYLE) & WS_CAPTION) == WS_CAPTION) return false;
        RECT rect;
        if (!GetWindowRect(hWnd, out rect)) return false;
        var info = new MONITORINFO();
        info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST), ref info)) return false;
        return rect.Left <= info.rcMonitor.Left && rect.Top <= info.rcMonitor.Top &&
               rect.Right >= info.rcMonitor.Right && rect.Bottom >= info.rcMonitor.Bottom;
    }
}
'@

# Without a valid parent id there is no way to know when to stop, so do not start polling at all.
$ownPid = 0
if (-not [int]::TryParse($env:PC_WRAPPED_PID, [ref]$ownPid) -or $ownPid -le 0) { exit 2 }

# Product names that say "Windows" rather than which app it is (Explorer, Task Manager, cmd and so on).
# Built from char codes: Windows PowerShell 5.1 reads a BOM-less script as ANSI, so a literal (R) sign would not match.
$reg = [char]0x00AE
$genericProducts = @("Microsoft$reg Windows$reg Operating System", 'Microsoft Windows Operating System')

function Get-AppLabel($process, $appId) {
    $label = $process.ProcessName
    try {
        $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($process.MainModule.FileName)
        if (-not [string]::IsNullOrWhiteSpace($info.FileDescription)) {
            $label = $info.FileDescription.Trim()
        } elseif (-not [string]::IsNullOrWhiteSpace($info.ProductName) -and $genericProducts -notcontains $info.ProductName.Trim()) {
            $label = $info.ProductName.Trim()
        }
    } catch { }
    if ([string]::IsNullOrWhiteSpace($label)) { $label = $appId }
    if ($label.Length -gt 80) { $label = $label.Substring(0, 80) }
    return $label
}

while ($true) {
    # The app is gone (closed, killed from Task Manager): stop polling rather than outlive it.
    if (-not (Get-Process -Id $ownPid -ErrorAction SilentlyContinue)) { break }
    try {
        $hwnd = [PcWrappedWindow]::Foreground()
        [uint32]$processId = [PcWrappedWindow]::ProcessOf($hwnd)
        if ($processId -gt 0 -and $processId -ne $ownPid) {
            $p = Get-Process -Id $processId -ErrorAction Stop
            if ($p.ProcessName -ieq 'ApplicationFrameHost') {
                $hosted = [PcWrappedWindow]::HostedProcess($hwnd, $processId)
                if ($hosted -gt 0) { $p = Get-Process -Id $hosted -ErrorAction Stop }
            }
            $appId = [IO.Path]::GetFileNameWithoutExtension($p.ProcessName).ToLowerInvariant()
            $label = Get-AppLabel $p $appId
            if ($appId -eq 'applicationframehost') { $label = 'Windows app' }
            $fullscreen = [PcWrappedWindow]::IsFullscreen($hwnd)
            [pscustomobject]@{ appId = $appId; label = $label; fullscreen = $fullscreen; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
        }
    } catch { }
    Start-Sleep -Milliseconds 2000
}
