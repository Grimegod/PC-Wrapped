// Login-at-startup.
//
// The ordinary Electron login item is used everywhere. It launches the app with --hidden so a
// login start goes straight to the tray instead of opening a window over the desktop.
//
// TODO(1.3, verify on Windows): a Store (MSIX) install may need a manifest startup task instead of
// a login item. Until that is confirmed on the Store build, this is the only mechanism.
import { app } from "electron";
import { APP_NAME } from "../shared/constants";

export interface StartupDependencies {
  setLoginItemSettings: (settings: Electron.Settings) => void;
  getLoginItemSettings: (options?: Electron.LoginItemSettingsOptions) => Electron.LoginItemSettings;
  isPackaged: boolean;
}

/** The argument a login start passes, so the app opens in the tray rather than as a window. */
export const HIDDEN_LAUNCH_ARG = "--hidden";

/** Open-at-login is a one-way switch: it either applies or it does not. */
export async function applyStartAtLogin(deps: StartupDependencies, enabled: boolean): Promise<boolean> {
  deps.setLoginItemSettings({ openAtLogin: enabled, name: APP_NAME, args: [HIDDEN_LAUNCH_ARG] });
  return enabled;
}

/** Whether the app will start at login right now, as the platform reports it. */
export async function readStartAtLogin(deps: StartupDependencies): Promise<boolean> {
  // Windows matches the login item by path and arguments, so ask with the same arguments.
  return deps.getLoginItemSettings({ args: [HIDDEN_LAUNCH_ARG] }).openAtLogin;
}

/** Whether this process was started by the login item rather than by the user. */
export function launchedHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_LAUNCH_ARG);
}

/** The dependencies Electron provides, so callers do not re-implement them. */
export function electronStartupDependencies(): StartupDependencies {
  return {
    setLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
    getLoginItemSettings: (options) => app.getLoginItemSettings(options),
    isPackaged: app.isPackaged
  };
}
