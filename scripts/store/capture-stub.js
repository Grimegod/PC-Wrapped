// Preload for the screenshot capture: a stub of the IPC bridge so the renderer's own scripts run
// without a main process. Nothing here reads or writes data; it exists so the UI renders.
const { contextBridge } = require("electron");

const empty = { apps: {}, appChanges: 0, transitions: {} };
const state = {
  tracking: false,
  periods: { day: empty, week: empty },
  startAtLogin: false,
  excludedApps: {},
  hiddenApps: {},
  warning: "",
  dayArchetype: "deep-diver",
  weekArchetype: "deep-diver"
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
