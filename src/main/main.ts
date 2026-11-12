import { app, BrowserWindow, dialog, ipcMain, nativeImage, powerMonitor, Tray, Menu } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { ActivityAggregator, combineDays, emptyDay, recapStats, removeAppFromHistory } from "../shared/aggregation";
import { chooseArchetype } from "../shared/archetypes";
import { APP_NAME, IDLE_THRESHOLD_SECONDS, SAMPLE_INTERVAL_MS, type CardFormat } from "../shared/constants";
import { dayKeysEndingAt, localDateKey } from "../shared/dates";
import type { AppState, DayAggregate, Snapshot } from "../shared/model";
import { renderCard } from "./card";
import { LocalStore } from "./store";

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let tracker: ChildProcessByStdio<null, Readable, Readable> | undefined;
let aggregator: ActivityAggregator;
let tracking = false;
let quitting = false;
let lastSaveAt = 0;
let lastUiUpdateAt = 0;
let warning = "";
const isWindows = process.platform === "win32";
const appDataRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, APP_NAME)
  : path.join(app.getPath("userData"), "LocalData");
const store = new LocalStore(appDataRoot);
if (!app.isPackaged) console.info(`[main] Local data root: ${appDataRoot}`);

if (isWindows) {
  app.setPath("userData", appDataRoot);
  app.setAppUserModelId("com.example.pcwrapped");
}

function aggregateForPeriod(period: "day" | "week"): DayAggregate {
  const keys = period === "day" ? [localDateKey(Date.now())] : dayKeysEndingAt(Date.now(), 7);
  return combineDays(keys.map((key) => store.history[key] ?? emptyDay()));
}

function currentState(): AppState {
  const today = aggregateForPeriod("day");
  const week = aggregateForPeriod("week");
  const todayStats = recapStats(today);
  const weekStats = recapStats(week);
  return {
    tracking,
    startAtLogin: store.settings.startAtLogin,
    excludedApps: { ...store.settings.excludedApps },
    hiddenApps: { ...store.settings.hiddenApps },
    today,
    week,
    todayStats,
    weekStats,
    todayArchetype: chooseArchetype(todayStats),
    weekArchetype: chooseArchetype(weekStats),
    warning: warning || store.historyReadOnlyReason
  };
}

function broadcastState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("state:changed", currentState());
  if (tray && !tray.isDestroyed()) tray.setToolTip(`${APP_NAME}${tracking ? " · tracking" : " · paused"}`);
}

function saveHistory(): void {
  try {
    store.history = aggregator.history;
    store.saveHistory();
    lastSaveAt = Date.now();
  } catch (error) {
    warning = error instanceof Error ? error.message : "History could not be saved.";
  }
}

function startTracker(): void {
  if (!isWindows) throw new Error("PC Wrapped currently supports Windows only.");
  if (store.historyReadOnlyReason) throw new Error(store.historyReadOnlyReason);
  if (tracker) return;
  const script = app.isPackaged
    ? path.join(process.resourcesPath, "tracker.ps1")
    : path.join(app.getAppPath(), "scripts", "tracker.ps1");
  if (!fs.existsSync(script)) throw new Error(`The Windows activity adapter is missing: ${script}`);
  const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    windowsHide: true,
    env: { ...process.env, PC_WRAPPED_PID: String(process.pid) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  tracker = child;
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) consumeTrackerLine(line);
  });
  child.stderr.on("data", () => { /* PowerShell errors are not retained as activity data. */ });
  child.once("error", (error) => {
    warning = `Activity tracking could not start: ${error.message}`;
    tracking = false;
    if (tracker === child) tracker = undefined;
    aggregator.resetContinuity();
    broadcastState();
  });
  child.once("exit", (code) => {
    if (tracker === child) tracker = undefined;
    if (tracking && !quitting) {
      tracking = false;
      aggregator.resetContinuity();
      saveHistory();
      warning = `Activity tracking stopped unexpectedly${code === null ? "." : ` (exit ${code}).`}`;
      broadcastState();
    }
  });
  tracking = true;
  warning = "";
  broadcastState();
}

function consumeTrackerLine(line: string): void {
  if (!line || !tracking) return;
  try {
    const raw = JSON.parse(line) as { appId?: unknown; label?: unknown; at?: unknown };
    if (typeof raw.appId !== "string" || typeof raw.label !== "string" || typeof raw.at !== "number") return;
    const appId = raw.appId.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
    const label = raw.label.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 80);
    if (!appId || !label || appId === "pc-wrapped") return;
    const now = Date.now();
    const snapshot: Snapshot = {
      at: now,
      appId,
      label,
      idle: powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_SECONDS,
      excluded: Object.hasOwn(store.settings.excludedApps, appId)
    };
    aggregator.ingest(snapshot);
    if (now - lastSaveAt >= 15_000) saveHistory();
    if (now - lastUiUpdateAt >= 4_000) {
      lastUiUpdateAt = now;
      broadcastState();
    }
  } catch { /* Malformed adapter lines are ignored and never persisted. */ }
}

function stopTracker(): void {
  tracking = false;
  aggregator.resetContinuity();
  if (tracker) {
    const child = tracker;
    tracker = undefined;
    child.kill();
  }
  saveHistory();
  broadcastState();
}

function createWindow(): void {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, "pc-wrapped.ico")
    : path.join(app.getAppPath(), "assets", "pc-wrapped.ico");
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 790,
    minWidth: 800,
    minHeight: 650,
    show: false,
    backgroundColor: "#261e1e",
    title: APP_NAME,
    icon: windowIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  if (!app.isPackaged) {
    mainWindow.webContents.on("console-message", (details) => {
      if (details.level === "error") {
        console.error(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`);
      }
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[renderer] process gone: ${details.reason} (exit ${details.exitCode})`);
    });
  }
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!app.isPackaged && input.type === "keyDown" && input.control && input.shift && input.key.toLowerCase() === "i") {
      event.preventDefault();
      mainWindow?.webContents.toggleDevTools();
    }
  });
  mainWindow.loadFile(path.join(app.getAppPath(), "dist", "src", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => { mainWindow?.show(); broadcastState(); });
  mainWindow.on("close", (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "pc-wrapped-tray.png")
    : path.join(app.getAppPath(), "assets", "pc-wrapped-tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip(`${APP_NAME} · paused`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show PC Wrapped", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "Start tracking", click: () => { try { startTracker(); } catch (e) { warning = String(e); broadcastState(); } } },
    { label: "Pause tracking", click: () => stopTracker() },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; stopTracker(); app.quit(); } }
  ]));
  tray.on("double-click", () => mainWindow?.show());
}

async function askStartupPreferenceOnce(): Promise<void> {
  if (store.settings.startupPrompted) return;
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    title: "Start PC Wrapped with Windows?",
    message: "Would you like PC Wrapped to open when you sign in? This does not start activity tracking.",
    detail: "Startup is off by default. You can change this later in Settings.",
    buttons: ["Keep off", "Enable at login"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  store.settings.startupPrompted = true;
  store.settings.startAtLogin = response.response === 1;
  app.setLoginItemSettings({ openAtLogin: store.settings.startAtLogin, name: APP_NAME });
  store.saveSettings();
  broadcastState();
}

async function previewCard(format: CardFormat, period: "day" | "week"): Promise<string> {
  const buffer = renderCard(aggregateForPeriod(period), format, period, new Set(Object.keys(store.settings.hiddenApps)));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

ipcMain.handle("state:get", () => currentState());
ipcMain.handle("tracking:set", (_event, enabled: boolean) => {
  try {
    if (enabled) startTracker(); else stopTracker();
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
  }
  return currentState();
});
ipcMain.handle("settings:startup", (_event, enabled: boolean) => {
  store.settings.startAtLogin = enabled;
  store.settings.startupPrompted = true;
  app.setLoginItemSettings({ openAtLogin: enabled, name: APP_NAME });
  store.saveSettings();
  broadcastState();
});
ipcMain.handle("settings:excluded-app", (_event, executableId: unknown, label: unknown, excluded: unknown) => {
  const id = normalizeExecutableId(executableId);
  if (!id || typeof excluded !== "boolean") throw new Error("Invalid app exclusion setting.");
  const safeLabel = normalizeAppLabel(label, id);
  if (excluded) setPreference(store.settings.excludedApps, id, safeLabel);
  else delete store.settings.excludedApps[id];
  store.saveSettings();
  aggregator.resetContinuity();
  broadcastState();
  return currentState();
});
ipcMain.handle("settings:hidden-app", (_event, executableId: unknown, label: unknown, hidden: unknown) => {
  const id = normalizeExecutableId(executableId);
  if (!id || typeof hidden !== "boolean") throw new Error("Invalid card visibility setting.");
  const safeLabel = normalizeAppLabel(label, id);
  if (hidden) setPreference(store.settings.hiddenApps, id, safeLabel);
  else delete store.settings.hiddenApps[id];
  store.saveSettings();
  broadcastState();
  return currentState();
});
ipcMain.handle("history:remove-app", async (_event, executableId: unknown) => {
  const id = normalizeExecutableId(executableId);
  if (!id || !Object.hasOwn(store.settings.excludedApps, id)) throw new Error("Exclude this app before removing its past data.");
  const label = store.settings.excludedApps[id];
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: "Also remove this app from past data?",
    message: `Permanently remove ${label} from saved daily summaries?`,
    detail: "This is separate from excluding future tracking and cannot be undone. Older summaries do not identify which app changes involved this app, so those ambiguous change counts will also be cleared.",
    buttons: ["Cancel", "Remove past data"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (response.response !== 1) return removeAppFromHistory(store.history, id, false);
  aggregator.resetContinuity();
  const result = removeAppFromHistory(store.history, id, true);
  store.saveHistory();
  warning = `Past summaries for ${label} were removed.`;
  broadcastState();
  return result;
});
ipcMain.handle("history:delete", async () => {
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: "Delete all history?",
    message: "This permanently deletes all locally saved daily summaries.",
    detail: "Tracking will pause. This cannot be undone.",
    buttons: ["Cancel", "Delete all history"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (response.response !== 1) return false;
  stopTracker();
  store.deleteAllHistory();
  aggregator = new ActivityAggregator(store.history);
  warning = "History deleted. Tracking is paused.";
  broadcastState();
  return true;
});
ipcMain.handle("card:preview", async (_event, format: CardFormat, period: "day" | "week") => {
  if (!isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported card option.");
  try {
    const dataUrl = await previewCard(format, period);
    if (!app.isPackaged) console.info(`[main] Rendered synthetic-testable ${format} preview for ${period} (${Buffer.byteLength(dataUrl, "utf8")} data URL bytes).`);
    return dataUrl;
  } catch (error) {
    if (!app.isPackaged) console.error("[main] Card preview rendering failed:", error);
    throw error;
  }
});
ipcMain.handle("card:save", async (_event, format: CardFormat, period: "day" | "week") => {
  if (!isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported card option.");
  const buffer = renderCard(aggregateForPeriod(period), format, period, new Set(Object.keys(store.settings.hiddenApps)));
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Save recap card",
    defaultPath: `pc-wrapped-${period}-${format}.png`,
    filters: [{ name: "PNG image", extensions: ["png"] }]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, buffer);
  return result.filePath;
});

app.whenReady().then(async () => {
  if (!isWindows) {
    await dialog.showMessageBox({ type: "info", title: APP_NAME, message: "This prototype currently runs on Windows." });
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  store.load();
  aggregator = new ActivityAggregator(store.history);
  createWindow();
  createTray();
  await new Promise<void>((resolve) => mainWindow?.once("ready-to-show", () => resolve()));
  await askStartupPreferenceOnce();
  if (store.historyReadOnlyReason) warning = store.historyReadOnlyReason;
});

app.on("activate", () => { if (mainWindow) mainWindow.show(); else createWindow(); });
app.on("before-quit", () => {
  quitting = true;
  if (tracking) stopTracker(); else saveHistory();
});

const broadcastTimer = setInterval(() => {
  if (tracking) broadcastState();
}, SAMPLE_INTERVAL_MS * 2);
broadcastTimer.unref();

function isCardFormat(value: unknown): value is CardFormat { return value === "story" || value === "square"; }
function isPeriod(value: unknown): value is "day" | "week" { return value === "day" || value === "week"; }
function normalizeExecutableId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(id) && id !== "pc-wrapped" ? id : undefined;
}
function normalizeAppLabel(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, 80) || fallback : fallback;
}
function setPreference(preferences: Record<string, string>, id: string, label: string): void {
  Object.defineProperty(preferences, id, { value: label, enumerable: true, configurable: true, writable: true });
}
