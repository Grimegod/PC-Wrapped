import { contextBridge, ipcRenderer } from "electron";
import type { AppBridge, AppRemovalResult, AppState, CardFormat, ShareOutcome, ShareTarget } from "../shared/model";
import type { RecapPeriod } from "../shared/constants";

const bridge: AppBridge = {
  getState: () => ipcRenderer.invoke("state:get") as Promise<AppState>,
  setTracking: (enabled) => ipcRenderer.invoke("tracking:set", enabled) as Promise<AppState>,
  setStartAtLogin: (enabled) => ipcRenderer.invoke("settings:startup", enabled) as Promise<void>,
  setExcludedApp: (executableId, label, excluded) =>
    ipcRenderer.invoke("settings:excluded-app", executableId, label, excluded) as Promise<AppState>,
  setHiddenOnCard: (executableId, label, hidden) =>
    ipcRenderer.invoke("settings:hidden-app", executableId, label, hidden) as Promise<AppState>,
  removeAppPastData: (executableId) => ipcRenderer.invoke("history:remove-app", executableId) as Promise<AppRemovalResult>,
  deleteHistory: () => ipcRenderer.invoke("history:delete").then(() => undefined),
  exportHistoryCsv: () => ipcRenderer.invoke("history:export-csv") as Promise<string | null>,
  previewCard: (format: CardFormat, period: RecapPeriod) => ipcRenderer.invoke("card:preview", format, period) as Promise<string>,
  exportCard: (format: CardFormat, period: RecapPeriod) => ipcRenderer.invoke("card:save", format, period) as Promise<string | null>,
  shareCard: (target: ShareTarget, format: CardFormat, period: RecapPeriod, savedPath: string | null) =>
    ipcRenderer.invoke("card:share", target, format, period, savedPath) as Promise<ShareOutcome>,
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  }
};

contextBridge.exposeInMainWorld("pcWrapped", bridge);
