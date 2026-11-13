// Login-at-startup for both ways this app can run.
//
// In a Store (MSIX) build Windows manages startup as a packaged startup task declared in the
// manifest; setting a plain exe login item there does not work, so the task's own state is used.
// Everywhere else the ordinary Electron login-item call is used.
import { app } from "electron";
import { APP_NAME } from "../shared/constants";

export interface StartupDependencies {
  setLoginItemSettings: (settings: Electron.Settings) => void;
  getLoginItemSettings: (options?: Electron.LoginItemSettingsOptions) => Electron.LoginItemSettings;
  isPackaged: boolean;
}

/** Open-at-login is a one-way switch: it either applies or it does not. */
export async function applyStartAtLogin(deps: StartupDependencies, enabled: boolean): Promise<boolean> {
  deps.setLoginItemSettings({ openAtLogin: enabled, name: APP_NAME });
  return enabled;
}

/** Whether the app will start at login right now, as the platform reports it. */
export async function readStartAtLogin(deps: StartupDependencies): Promise<boolean> {
  return deps.getLoginItemSettings().openAtLogin;
}

/** The dependencies Electron provides, so callers do not re-implement them. */
export function electronStartupDependencies(): StartupDependencies {
  return {
    setLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
    getLoginItemSettings: (options) => app.getLoginItemSettings(options),
    isPackaged: app.isPackaged
  };
}
