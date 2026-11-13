import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, powerMonitor, Tray, Menu } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { ActivityAggregator, combineDays, emptyDay, recapStats, removeAppFromHistory } from "../shared/aggregation";
import { chooseArchetype } from "../shared/archetypes";
import { APP_ID, APP_NAME, IDLE_THRESHOLD_SECONDS, SAMPLE_INTERVAL_MS, type CardFormat } from "../shared/constants";
import { dayKeysEndingAt, localDateKey } from "../shared/dates";
import type { AppState, DayAggregate, ShareOutcome, ShareTarget } from "../shared/model";
import { renderCard, isCardFormat } from "./card";
import { isTrustedSenderUrl } from "./ipc-guard";
import { parseTrackerLine, sanitizeTrackerLabel } from "./tracker-line";
import { isShareableSavedCard, SavedCardLedger, shareCaption, shareCard } from "./share";
import { applyStartAtLogin, electronStartupDependencies } from "./startup";
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
/** Every card this process has written, so sharing can only hand out a file the app produced. */
const savedCards = new SavedCardLedger();
if (!app.isPackaged) console.info(`[main] Local data root: ${appDataRoot}`);

if (isWindows) {
  app.setPath("userData", appDataRoot);
  app.setAppUserModelId(APP_ID);
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
  const script = app.isPackaged ? path.join(process.resourcesPath, "tracker.ps1") : path.join(app.getAppPath(), "scripts", "tracker.ps1");
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
  child.stderr.on("data", () => {
    /* PowerShell errors are not retained as activity data. */
  });
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
  const now = Date.now();
  const snapshot = parseTrackerLine(line, now, powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_SECONDS, (appId) =>
    Object.hasOwn(store.settings.excludedApps, appId)
  );
  if (!snapshot) return;
  aggregator.ingest(snapshot);
  if (now - lastSaveAt >= 15_000) saveHistory();
  if (now - lastUiUpdateAt >= 4_000) {
    lastUiUpdateAt = now;
    broadcastState();
  }
}

function stopTracker(): void {
  tracking = false;
  aggregator.resetContinuity();
  if (tracker) {
    const child = tracker;
    tracker = undefined;
    // PowerShell spawns no children of its own, but killing the tree guarantees no poll loop is
    // left behind if that ever changes.
    if (isWindows && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
    } else {
      child.kill();
    }
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
  // This window only ever shows the local renderer: refuse navigation and new windows so the
  // preload bridge cannot be inherited by a page it was not written for.
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
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
  void mainWindow.loadFile(path.join(app.getAppPath(), "dist", "src", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    broadcastState();
  });
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show PC Wrapped", click: () => mainWindow?.show() },
      { type: "separator" },
      {
        label: "Start tracking",
        click: () => {
          try {
            startTracker();
          } catch (e) {
            warning = String(e);
            broadcastState();
          }
        }
      },
      { label: "Pause tracking", click: () => stopTracker() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          stopTracker();
          app.quit();
        }
      }
    ])
  );
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
  void applyStartAtLogin(electronStartupDependencies(), store.settings.startAtLogin);
  store.saveSettings();
  broadcastState();
}

async function previewCard(format: CardFormat, period: "day" | "week"): Promise<string> {
  const buffer = renderCard(aggregateForPeriod(period), format, period, new Set(Object.keys(store.settings.hiddenApps)));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

handle("state:get", () => currentState());
handle("tracking:set", (event, enabled: boolean) => {
  try {
    if (enabled) startTracker();
    else stopTracker();
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
  }
  return currentState();
});
handle("settings:startup", async (event, enabled: boolean) => {
  store.settings.startAtLogin = enabled;
  store.settings.startupPrompted = true;
  // A Store build cannot use a plain login item; the startup helper picks the right mechanism and
  // the stored setting records what the user asked for.
  await applyStartAtLogin(electronStartupDependencies(), enabled);
  store.saveSettings();
  broadcastState();
});
handle("settings:excluded-app", (event, executableId: unknown, label: unknown, excluded: unknown) => {
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
handle("settings:hidden-app", (event, executableId: unknown, label: unknown, hidden: unknown) => {
  const id = normalizeExecutableId(executableId);
  if (!id || typeof hidden !== "boolean") throw new Error("Invalid card visibility setting.");
  const safeLabel = normalizeAppLabel(label, id);
  if (hidden) setPreference(store.settings.hiddenApps, id, safeLabel);
  else delete store.settings.hiddenApps[id];
  store.saveSettings();
  broadcastState();
  return currentState();
});
handle("history:remove-app", async (event, executableId: unknown) => {
  const id = normalizeExecutableId(executableId);
  if (!id || !Object.hasOwn(store.settings.excludedApps, id)) throw new Error("Exclude this app before removing its past data.");
  const label = store.settings.excludedApps[id];
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: "Also remove this app from past data?",
    message: `Permanently remove ${label} from saved daily summaries?`,
    detail:
      "This is separate from excluding future tracking and cannot be undone. Older summaries do not identify which app changes involved this app, so those ambiguous change counts will also be cleared.",
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
handle("history:delete", async () => {
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
handle("card:preview", async (event, format: CardFormat, period: "day" | "week") => {
  if (!isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported card option.");
  try {
    const dataUrl = await previewCard(format, period);
    if (!app.isPackaged)
      console.info(
        `[main] Rendered synthetic-testable ${format} preview for ${period} (${Buffer.byteLength(dataUrl, "utf8")} data URL bytes).`
      );
    return dataUrl;
  } catch (error) {
    if (!app.isPackaged) console.error("[main] Card preview rendering failed:", error);
    throw error;
  }
});
handle("card:save", async (event, format: CardFormat, period: "day" | "week") => {
  if (!isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported card option.");
  const buffer = renderCard(aggregateForPeriod(period), format, period, new Set(Object.keys(store.settings.hiddenApps)));
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Save recap card",
    defaultPath: `pc-wrapped-${period}-${format}.png`,
    filters: [{ name: "PNG image", extensions: ["png"] }]
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, buffer);
  savedCards.remember(result.filePath);
  return result.filePath;
});

handle(
  "card:share",
  async (event, target: unknown, format: CardFormat, period: "day" | "week", savedPath: unknown): Promise<ShareOutcome> => {
    if (!isShareTarget(target) || !isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported share option.");
    const aggregate = aggregateForPeriod(period);
    const stats = recapStats(aggregate);
    if (stats.totalActiveMs <= 0) return { opened: false, message: "Track for a while to create a card first." };
    // Only a PNG this app saved a moment ago is ever handed out.
    const filePath = isShareableSavedCard(savedCards, savedPath) ? savedPath : "";
    return shareCard({
      target,
      filePath,
      caption: shareCaption(period, stats.totalActiveMs, chooseArchetype(stats).name),
      copyImage: (source) => {
        const image = nativeImage.createFromPath(source);
        if (image.isEmpty()) throw new Error("The saved card could not be read for the clipboard.");
        clipboard.writeImage(image);
      }
    });
  }
);

void app.whenReady().then(async () => {
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

app.on("activate", () => {
  if (mainWindow) mainWindow.show();
  else createWindow();
});
app.on("before-quit", () => {
  quitting = true;
  if (tracking) stopTracker();
  else saveHistory();
});

const broadcastTimer = setInterval(() => {
  if (tracking) broadcastState();
}, SAMPLE_INTERVAL_MS * 2);
broadcastTimer.unref();

function isPeriod(value: unknown): value is "day" | "week" {
  return value === "day" || value === "week";
}
const SHARE_TARGETS: readonly ShareTarget[] = [
  "whatsapp",
  "telegram",
  "telegramApp",
  "facebook",
  "messenger",
  "messengerApp",
  "instagram",
  "snapchat",
  "tiktok",
  "linkedin",
  "x"
];
function isShareTarget(value: unknown): value is ShareTarget {
  return typeof value === "string" && (SHARE_TARGETS as readonly string[]).includes(value);
}
function normalizeExecutableId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(id) && id !== "pc-wrapped" ? id : undefined;
}
function normalizeAppLabel(value: unknown, fallback: string): string {
  return sanitizeTrackerLabel(value, fallback);
}
function setPreference(preferences: Record<string, string>, id: string, label: string): void {
  Object.defineProperty(preferences, id, { value: label, enumerable: true, configurable: true, writable: true });
}

/**
 * Register an IPC channel that only the app's own window may call.
 *
 * Every handler in this file runs privileged work on behalf of the renderer, so each one checks
 * that the call came from the local page before doing anything.
 */
function handle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error(`Refused ${channel}: the request did not come from the app window.`);
    return listener(event, ...(args as never[]));
  });
}

/** Whether an IPC event came from this app's own window on its own local file. */
export function isTrustedSender(
  event: { senderFrame?: { url?: string } | null; sender?: unknown },
  window: BrowserWindow | undefined = mainWindow
): boolean {
  if (!window || event.sender !== window.webContents) return false;
  return isTrustedSenderUrl(event.senderFrame?.url);
}
