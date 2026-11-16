import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  powerMonitor,
  screen,
  Tray,
  Menu
} from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { ActivityAggregator, combineDays, emptyDay, recapStats, removeAppFromHistory } from "../shared/aggregation";
import { comparePeriods, type PeriodComparison } from "../shared/comparison";
import { chooseArchetype } from "../shared/archetypes";
import { APP_ID, APP_NAME, IDLE_THRESHOLD_SECONDS, SAMPLE_INTERVAL_MS, type CardFormat, type RecapPeriod } from "../shared/constants";
import { localDateKey } from "../shared/dates";
import type { AppState, DayAggregate, I18nPayload, ShareOutcome, ShareTarget, ToggleSetting } from "../shared/model";
import { languageInfo, pickLocale, type Translator } from "../shared/i18n";
import { periodKeys, previousPeriodKeys } from "../shared/periods";
import { renderCard, isCardFormat, localizeArchetype } from "./card";
import { availableLocales, englishTranslator, loadMessages, translatorFor } from "./locales";
import { historyToCsv } from "./csv";
import { isTrustedSenderUrl } from "./ipc-guard";
import { isIdleSample, parseTrackerLine, sanitizeTrackerLabel } from "./tracker-line";
import { isShareableSavedCard, SavedCardLedger, shareCaption, shareCard } from "./share";
import { applyStartAtLogin, electronStartupDependencies, launchedHidden, readStartAtLogin } from "./startup";
import { isThemeChoice, LocalStore } from "./store";

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let tracker: ChildProcessByStdio<null, Readable, Readable> | undefined;
let aggregator: ActivityAggregator;
let tracking = false;
let quitting = false;
let lastSaveAt = 0;
let warning = "";
let warningTimer: NodeJS.Timeout | undefined;
let screenLocked = false;
const startHidden = launchedHidden(process.argv);
/** The interface language; English until settings are loaded. */
let tr: Translator = englishTranslator();
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

// One process owns the history file. A second launch (the login item plus a click on the Start
// menu, say) hands over to the first and exits, so two processes never overwrite each other.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on("second-instance", () => showMainWindow());

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function aggregateForPeriod(period: RecapPeriod, now = Date.now()): DayAggregate {
  return combineDays(periodKeys(period, now).map((key) => store.history[key] ?? emptyDay()));
}

/** The matching earlier days for the "versus" line (see previousPeriodKeys). */
function previousAggregateForPeriod(period: RecapPeriod, now = Date.now()): DayAggregate {
  return combineDays(previousPeriodKeys(period, now).map((key) => store.history[key] ?? emptyDay()));
}

function comparisonForPeriod(period: RecapPeriod): PeriodComparison {
  return comparePeriods(recapStats(aggregateForPeriod(period)), recapStats(previousAggregateForPeriod(period)), tr.t(`compare.${period}`));
}

/** A message that clears itself: confirmations should not sit on screen for the rest of the day. */
function notify(message: string, clearAfterMs = 12_000): void {
  warning = message;
  if (warningTimer) clearTimeout(warningTimer);
  warningTimer = setTimeout(() => {
    if (warning === message) {
      warning = "";
      broadcastState();
    }
  }, clearAfterMs);
  warningTimer.unref();
}

/** The catalog "auto" picks on this PC: the first Windows display language that has one. */
function autoLocale(): string {
  let preferred: string[] = [];
  try {
    preferred = app.getPreferredSystemLanguages();
  } catch {
    /* Older platforms: fall back to the app locale. */
  }
  if (!preferred.length) preferred = [app.getLocale()];
  return pickLocale(preferred, availableLocales());
}

/** Load the language the settings ask for, falling back to English if its catalog is missing. */
function applyLanguage(): void {
  const available = availableLocales();
  const choice = store.settings.language;
  const locale = choice !== "auto" && available.includes(choice) ? choice : autoLocale();
  tr = translatorFor(locale);
}

function i18nPayload(): I18nPayload {
  const available = availableLocales();
  return {
    choice: store.settings.language,
    locale: tr.locale,
    autoLocale: autoLocale(),
    dir: tr.dir,
    messages: loadMessages(tr.locale),
    fallback: loadMessages("en"),
    languages: available.map((code) => ({ code, nativeName: languageInfo(code).nativeName }))
  };
}

/** The current tracking warning or error, in the interface language. */
function historyWarning(): string {
  return store.historyReadOnlyReason ? tr.t("warning.historyUnreadable", { path: store.historyPath }) : "";
}

/** Remember whether the user wants tracking on, for "resume tracking when the app starts". */
function rememberTrackingIntent(on: boolean): void {
  if (store.settings.wasTracking === on) return;
  store.settings.wasTracking = on;
  try {
    store.saveSettings();
  } catch {
    /* The intent is a convenience; failing to save it must not stop tracking. */
  }
}

function currentState(): AppState {
  const aggregates: Record<RecapPeriod, DayAggregate> = {
    day: aggregateForPeriod("day"),
    week: aggregateForPeriod("week"),
    month: aggregateForPeriod("month"),
    year: aggregateForPeriod("year")
  };
  const stats: Record<RecapPeriod, ReturnType<typeof recapStats>> = {
    day: recapStats(aggregates.day),
    week: recapStats(aggregates.week),
    month: recapStats(aggregates.month),
    year: recapStats(aggregates.year)
  };
  return {
    tracking,
    startAtLogin: store.settings.startAtLogin,
    resumeTracking: store.settings.resumeTracking,
    countFullscreen: store.settings.countFullscreen,
    theme: store.settings.theme,
    language: store.settings.language,
    locale: tr.locale,
    excludedApps: { ...store.settings.excludedApps },
    hiddenApps: { ...store.settings.hiddenApps },
    today: aggregates.day,
    week: aggregates.week,
    month: aggregates.month,
    year: aggregates.year,
    todayStats: stats.day,
    weekStats: stats.week,
    monthStats: stats.month,
    yearStats: stats.year,
    todayArchetype: localizeArchetype(chooseArchetype(stats.day), tr),
    weekArchetype: localizeArchetype(chooseArchetype(stats.week), tr),
    monthArchetype: localizeArchetype(chooseArchetype(stats.month), tr),
    yearArchetype: localizeArchetype(chooseArchetype(stats.year), tr),
    warning: warning || historyWarning()
  };
}

function broadcastState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("state:changed", currentState());
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(tr.t(tracking ? "tray.tooltipOn" : "tray.tooltipPaused"));
    updateTrayMenu();
  }
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
  if (!isWindows) throw new Error(tr.t("warning.windowsOnly"));
  if (store.historyReadOnlyReason) throw new Error(historyWarning());
  if (tracker) return;
  const script = app.isPackaged ? path.join(process.resourcesPath, "tracker.ps1") : path.join(app.getAppPath(), "scripts", "tracker.ps1");
  if (!fs.existsSync(script)) throw new Error(tr.t("warning.adapterMissing", { path: script }));
  // No -ExecutionPolicy Bypass: the script is ours, and that flag is the exact pattern every
  // antivirus (Bitdefender included) flags as "malicious command line". It buys nothing here.
  const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", script], {
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
    warning = tr.t("warning.cannotStart", { error: error.message });
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
      warning = code === null ? tr.t("warning.stopped") : `${tr.t("warning.stopped")} (exit ${code})`;
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
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const snapshot = parseTrackerLine(
    line,
    now,
    (appId, fullscreen) =>
      isIdleSample({
        idleSeconds,
        thresholdSeconds: IDLE_THRESHOLD_SECONDS,
        locked: screenLocked,
        countFullscreen: store.settings.countFullscreen,
        fullscreen,
        appId
      }),
    (appId) => Object.hasOwn(store.settings.excludedApps, appId)
  );
  if (!snapshot) return;
  aggregator.ingest(snapshot);
  if (now - lastSaveAt >= 15_000) saveHistory();
  // The UI is refreshed by broadcastTimer below; one timer, not one per line.
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
  // Wide rather than tall, so the settings sit in two columns; never larger than the screen's work area.
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1400, workArea.width - 40),
    height: Math.min(860, workArea.height - 40),
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: windowBackground(),
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
    // A login start stays in the tray; the user opens the window when they want it.
    if (!startHidden) mainWindow?.show();
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
  tray.setToolTip(tr.t("tray.tooltipPaused"));
  updateTrayMenu();
  tray.on("double-click", () => showMainWindow());
}

/** The tray menu shows one tracking item that matches the current state. */
function updateTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: tr.t("tray.show"), click: () => showMainWindow() },
      { type: "separator" },
      {
        label: tr.t(tracking ? "button.pauseTracking" : "button.startTracking"),
        click: () => setTrackingFromUser(!tracking)
      },
      { type: "separator" },
      {
        label: tr.t("tray.quit"),
        click: () => {
          quitting = true;
          stopTracker();
          app.quit();
        }
      }
    ])
  );
}

/** Start or pause because the user asked to (window or tray), and remember that choice. */
function setTrackingFromUser(enabled: boolean): void {
  try {
    if (enabled) startTracker();
    else stopTracker();
    rememberTrackingIntent(enabled);
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
    broadcastState();
  }
}

async function askStartupPreferenceOnce(): Promise<void> {
  if (store.settings.startupPrompted || startHidden) return;
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    title: tr.t("dialog.startupTitle"),
    message: tr.t("dialog.startupMessage"),
    detail: tr.t("dialog.startupDetail"),
    buttons: [tr.t("dialog.startupKeepOff"), tr.t("dialog.startupEnable")],
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

async function previewCard(format: CardFormat, period: RecapPeriod): Promise<string> {
  const buffer = renderCard(
    aggregateForPeriod(period),
    format,
    period,
    new Set(Object.keys(store.settings.hiddenApps)),
    comparisonForPeriod(period),
    tr
  );
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

handle("state:get", () => currentState());
handle("tracking:set", (event, enabled: unknown) => {
  if (typeof enabled !== "boolean") throw new Error("Invalid tracking setting.");
  setTrackingFromUser(enabled);
  return currentState();
});
handle("settings:toggle", (event, setting: unknown, enabled: unknown) => {
  if (!isToggleSetting(setting) || typeof enabled !== "boolean") throw new Error("Invalid setting.");
  store.settings[setting] = enabled;
  if (setting === "resumeTracking") store.settings.wasTracking = tracking;
  store.saveSettings();
  broadcastState();
  return currentState();
});
handle("i18n:get", () => i18nPayload());
handle("settings:language", (event, choice: unknown) => {
  if (typeof choice !== "string" || (choice !== "auto" && !availableLocales().includes(choice))) throw new Error("Invalid language.");
  store.settings.language = choice;
  store.saveSettings();
  applyLanguage();
  const payload = i18nPayload();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("i18n:changed", payload);
  broadcastState();
  return payload;
});
handle("settings:theme", (event, theme: unknown) => {
  if (!isThemeChoice(theme)) throw new Error("Invalid theme.");
  store.settings.theme = theme;
  store.saveSettings();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(windowBackground());
  broadcastState();
  return currentState();
});
handle("settings:startup", async (event, enabled: unknown) => {
  if (typeof enabled !== "boolean") throw new Error("Invalid startup setting.");
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
  if (!id || !Object.hasOwn(store.settings.excludedApps, id)) throw new Error(tr.t("error.excludeFirst"));
  const label = store.settings.excludedApps[id];
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: tr.t("dialog.removeTitle"),
    message: tr.t("dialog.removeMessage", { app: label }),
    detail: tr.t("dialog.removeDetail"),
    buttons: [tr.t("dialog.cancel"), tr.t("dialog.removeConfirm")],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (response.response !== 1) return removeAppFromHistory(store.history, id, false);
  aggregator.resetContinuity();
  const result = removeAppFromHistory(store.history, id, true);
  store.saveHistory();
  notify(tr.t("notice.pastRemoved", { app: label }));
  broadcastState();
  return result;
});
handle("history:delete", async () => {
  const response = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: tr.t("dialog.deleteTitle"),
    message: tr.t("dialog.deleteMessage"),
    detail: tr.t("dialog.deleteDetail"),
    buttons: [tr.t("dialog.cancel"), tr.t("settings.delete")],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (response.response !== 1) return false;
  stopTracker();
  rememberTrackingIntent(false);
  store.deleteAllHistory();
  aggregator = new ActivityAggregator(store.history);
  notify(tr.t("notice.historyDeleted"));
  broadcastState();
  return true;
});
handle("history:export-csv", async () => {
  const days = Object.keys(store.history).length;
  if (!days) return null;
  const stamp = localDateKey(Date.now());
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: tr.t("dialog.csvTitle"),
    defaultPath: `pc-wrapped-history-${stamp}.csv`,
    filters: [{ name: tr.t("dialog.csvFilter"), extensions: ["csv"] }]
  });
  if (result.canceled || !result.filePath) return null;
  writeUserFile(result.filePath, historyToCsv(store.history), "error.csvSave");
  return result.filePath;
});

handle("card:preview", async (event, format: CardFormat, period: RecapPeriod) => {
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
handle("card:save", async (event, format: CardFormat, period: RecapPeriod) => {
  if (!isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported card option.");
  const buffer = renderCard(
    aggregateForPeriod(period),
    format,
    period,
    new Set(Object.keys(store.settings.hiddenApps)),
    comparisonForPeriod(period),
    tr
  );
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: tr.t("dialog.cardTitle"),
    defaultPath: `pc-wrapped-${period}-${format}.png`,
    filters: [{ name: tr.t("dialog.cardFilter"), extensions: ["png"] }]
  });
  if (result.canceled || !result.filePath) return null;
  writeUserFile(result.filePath, buffer, "error.cardSave");
  savedCards.remember(result.filePath);
  return result.filePath;
});

handle("card:share", async (event, target: unknown, format: CardFormat, period: RecapPeriod, savedPath: unknown): Promise<ShareOutcome> => {
  if (!isShareTarget(target) || !isCardFormat(format) || !isPeriod(period)) throw new Error("Unsupported share option.");
  const aggregate = aggregateForPeriod(period);
  const stats = recapStats(aggregate);
  if (stats.totalActiveMs <= 0) return { opened: false, message: tr.t("share.trackFirst") };
  // Only a PNG this app saved a moment ago is ever handed out.
  const filePath = isShareableSavedCard(savedCards, savedPath) ? savedPath : "";
  return shareCard({
    target,
    filePath,
    caption: shareCaption(period, stats.totalActiveMs, localizeArchetype(chooseArchetype(stats), tr).name, tr),
    translator: tr,
    copyImage: async (source) => {
      const image = nativeImage.createFromPath(source);
      if (image.isEmpty()) throw new Error(tr.t("share.clipboardRead"));
      // Electron 44+ clipboard: W3C-style items keyed by MIME type, and the write is asynchronous.
      await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(image.toPNG())], { type: "image/png" }) })]);
    }
  });
});

void app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  if (!isWindows) {
    await dialog.showMessageBox({ type: "info", title: APP_NAME, message: tr.t("warning.windowsOnly") });
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  store.load();
  applyLanguage();
  aggregator = new ActivityAggregator(store.history);
  // Nothing counts while the session is locked, even a full-screen app behind the lock screen.
  powerMonitor.on("lock-screen", () => {
    screenLocked = true;
  });
  powerMonitor.on("unlock-screen", () => {
    screenLocked = false;
  });
  powerMonitor.on("suspend", () => {
    aggregator.resetContinuity();
    saveHistory();
  });
  // The stored setting follows what Windows reports, so a login item removed in Task Manager or a
  // stale one left by another build does not leave the toggle lying.
  if (!process.windowsStore) {
    try {
      const actual = await readStartAtLogin(electronStartupDependencies());
      if (actual !== store.settings.startAtLogin) {
        store.settings.startAtLogin = actual;
        store.saveSettings();
      }
    } catch {
      /* Keep the stored value. */
    }
  }
  createWindow();
  const windowReady = new Promise<void>((resolve) => mainWindow?.once("ready-to-show", () => resolve()));
  createTray();
  if (store.settings.resumeTracking && store.settings.wasTracking && !store.historyReadOnlyReason) {
    try {
      startTracker();
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
    }
  }
  await windowReady;
  await askStartupPreferenceOnce();
  if (store.historyReadOnlyReason) warning = historyWarning();
});

app.on("activate", () => {
  if (mainWindow) showMainWindow();
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

/** The colour shown before the page paints, matching the chosen theme so there is no flash. */
function windowBackground(): string {
  const dark = store.settings.theme === "dark" || (store.settings.theme === "system" && nativeTheme.shouldUseDarkColors);
  return dark ? "#0a1628" : "#d6f5f2";
}

function isToggleSetting(value: unknown): value is ToggleSetting {
  return value === "resumeTracking" || value === "countFullscreen";
}

/** Write a file the user chose in a save dialog, with a message they can act on if it fails. */
function writeUserFile(filePath: string, contents: string | Buffer, messageKey: "error.cardSave" | "error.csvSave"): void {
  try {
    fs.writeFileSync(filePath, contents, typeof contents === "string" ? "utf8" : undefined);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason =
      code === "EACCES" || code === "EPERM"
        ? "reason.access"
        : code === "EBUSY"
          ? "reason.busy"
          : code === "ENOSPC"
            ? "reason.full"
            : "reason.other";
    throw new Error(tr.t(messageKey, { reason: tr.t(reason) }));
  }
}

function isPeriod(value: unknown): value is RecapPeriod {
  return value === "day" || value === "week" || value === "month" || value === "year";
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
