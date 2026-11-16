import fs from "node:fs";
import path from "node:path";
import { pruneHistory } from "../shared/aggregation";
import type { AppPreferenceMap, History, ThemeChoice } from "../shared/model";

export interface Settings {
  startAtLogin: boolean;
  startupPrompted: boolean;
  /** Opt-in: when the app starts, resume tracking if it was on when the app last closed. */
  resumeTracking: boolean;
  /** Whether tracking was on when the app last saved its settings; read only when resumeTracking is on. */
  wasTracking: boolean;
  /** Count full-screen games and videos as active even without keyboard or mouse input. */
  countFullscreen: boolean;
  theme: ThemeChoice;
  /** "auto" (follow Windows) or a catalog code such as "ro". */
  language: string;
  excludedApps: AppPreferenceMap;
  hiddenApps: AppPreferenceMap;
}

const DEFAULT_SETTINGS: Settings = {
  startAtLogin: false,
  startupPrompted: false,
  resumeTracking: false,
  wasTracking: false,
  countFullscreen: true,
  theme: "light",
  language: "auto",
  excludedApps: {},
  hiddenApps: {}
};

export class LocalStore {
  readonly historyPath: string;
  readonly settingsPath: string;
  history: History = {};
  settings: Settings = { ...DEFAULT_SETTINGS };
  historyReadOnlyReason = "";

  constructor(private readonly root: string) {
    this.historyPath = path.join(root, "daily-aggregates.json");
    this.settingsPath = path.join(root, "settings.json");
  }

  load(now = Date.now()): void {
    fs.mkdirSync(this.root, { recursive: true });
    if (fs.existsSync(this.historyPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.historyPath, "utf8")) as unknown;
        if (!isHistory(parsed)) throw new Error("History file has an unknown shape.");
        this.history = pruneHistory(parsed, now);
        if (Object.keys(this.history).length !== Object.keys(parsed).length) {
          this.atomicWrite(this.historyPath, JSON.stringify(this.history));
        }
      } catch {
        this.historyReadOnlyReason = `Saved history could not be read or safely maintained. It was preserved at ${this.historyPath}; tracking is paused to avoid overwriting it.`;
        this.history = {};
      }
    }
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")) as Partial<Settings>;
        this.settings = {
          startAtLogin: settings.startAtLogin === true,
          startupPrompted: settings.startupPrompted === true,
          resumeTracking: settings.resumeTracking === true,
          wasTracking: settings.wasTracking === true,
          countFullscreen: settings.countFullscreen !== false,
          theme: isThemeChoice(settings.theme) ? settings.theme : "light",
          language:
            typeof settings.language === "string" && /^(auto|[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?)$/.test(settings.language)
              ? settings.language
              : "auto",
          excludedApps: normalizePreferenceMap(settings.excludedApps),
          hiddenApps: normalizePreferenceMap(settings.hiddenApps)
        };
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  saveHistory(now = Date.now()): void {
    if (this.historyReadOnlyReason) throw new Error(this.historyReadOnlyReason);
    const retained = pruneHistory(this.history, now);
    for (const key of Object.keys(this.history)) {
      if (!(key in retained)) delete this.history[key];
    }
    this.atomicWrite(this.historyPath, JSON.stringify(this.history));
  }

  saveSettings(): void {
    this.atomicWrite(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }

  deleteAllHistory(): void {
    this.history = {};
    this.historyReadOnlyReason = "";
    if (fs.existsSync(this.historyPath)) fs.unlinkSync(this.historyPath);
  }

  private atomicWrite(filePath: string, contents: string): void {
    fs.mkdirSync(this.root, { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, contents, { encoding: "utf8", flag: "w" });
    try {
      fs.renameSync(temp, filePath);
    } catch (error) {
      try {
        fs.unlinkSync(temp);
      } catch {
        // The temporary file may already be gone; the original error is the one worth reporting.
      }
      throw error;
    }
  }
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function normalizePreferenceMap(value: unknown): AppPreferenceMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: AppPreferenceMap = {};
  for (const [rawId, rawLabel] of Object.entries(value as Record<string, unknown>)) {
    const id = rawId.toLowerCase();
    if (!/^[a-z0-9._-]{1,64}$/.test(id) || typeof rawLabel !== "string") continue;
    const label = rawLabel
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point.
      .replace(/[\r\n\u0000-\u001f]/g, " ")
      .trim()
      .slice(0, 80);
    Object.defineProperty(result, id, { value: label || id, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

function isHistory(value: unknown): value is History {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([key, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== "object") return false;
    const candidate = day as { appChanges?: unknown; apps?: unknown; transitions?: unknown };
    if (!Number.isFinite(candidate.appChanges) || !candidate.apps || typeof candidate.apps !== "object") return false;
    if (candidate.transitions !== undefined) {
      if (!candidate.transitions || typeof candidate.transitions !== "object" || Array.isArray(candidate.transitions)) return false;
      for (const [key, count] of Object.entries(candidate.transitions as Record<string, unknown>)) {
        if (!Number.isSafeInteger(count) || (count as number) < 0) return false;
        try {
          const pair = JSON.parse(key) as unknown;
          if (!Array.isArray(pair) || pair.length !== 2 || pair.some((id) => typeof id !== "string")) return false;
        } catch {
          return false;
        }
      }
    }
    return Object.values(candidate.apps as Record<string, unknown>).every((app) => {
      if (!app || typeof app !== "object") return false;
      const a = app as Record<string, unknown>;
      return (
        typeof a.label === "string" &&
        ["activeMs", "longestStreakMs", "interruptionsStarted", "interruptionsCompleted", "returnTimeTotalMs"].every((field) =>
          Number.isFinite(a[field])
        )
      );
    });
  });
}
