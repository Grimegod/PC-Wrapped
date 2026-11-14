// Preload for the screenshot capture: a stub of the IPC bridge so the renderer's own scripts run
// without a main process. Nothing here reads or writes data; it exists so the UI renders.
const { contextBridge } = require("electron");

const day = {
  appChanges: 137,
  apps: {
    "code.exe": { label: "Visual Studio Code", activeMs: 14_400_000, longestStreakMs: 9_000_000, interruptionsStarted: 6, interruptionsCompleted: 5, returnTimeTotalMs: 720_000 },
    "chrome.exe": { label: "Google Chrome", activeMs: 8_640_000, longestStreakMs: 3_000_000, interruptionsStarted: 9, interruptionsCompleted: 8, returnTimeTotalMs: 540_000 },
    "slack.exe": { label: "Slack", activeMs: 4_320_000, longestStreakMs: 1_320_000, interruptionsStarted: 11, interruptionsCompleted: 9, returnTimeTotalMs: 420_000 },
    "spotify.exe": { label: "Spotify", activeMs: 2_880_000, longestStreakMs: 2_400_000, interruptionsStarted: 3, interruptionsCompleted: 3, returnTimeTotalMs: 240_000 }
  },
  transitions: {}
};
const stats = {
  totalActiveMs: 30_240_000,
  appChanges: 137,
  longestStreakMs: 9_000_000,
  topAppShare: 14_400_000 / 30_240_000,
  topAppLabel: "Visual Studio Code",
  uniqueApps: 4,
  completedInterruptions: 25,
  averageReturnMs: 76_800
};
const archetype = { id: "tab-acrobat", name: "The Tab Acrobat", emoji: "🤸", line: "Your apps got a curtain call. Several times." };
const state = {
  tracking: false,
  startAtLogin: false,
  excludedApps: {},
  hiddenApps: {},
  warning: "",
  today: day,
  week: day,
  todayStats: stats,
  weekStats: stats,
  todayArchetype: archetype,
  weekArchetype: archetype
};

contextBridge.exposeInMainWorld("pcWrapped", {
  getState: async () => state,
  setTracking: async (enabled) => ({ ...state, tracking: enabled }),
  setStartAtLogin: async () => {},
  setExcludedApp: async () => {},
  setHiddenApp: async () => {},
  removeAppPastData: async () => ({ removedDays: 0, removedActiveMs: 0, removedTransitions: 0 }),
  deleteHistory: async () => {},
  previewCard: async () => "",
  exportCard: async () => "",
  shareCard: async () => ({ opened: false, copied: false, message: "" }),
  onState: () => () => {}
});
