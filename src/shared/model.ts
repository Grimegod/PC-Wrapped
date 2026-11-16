import type { CardFormat, RecapPeriod } from "./constants";
export type { CardFormat, RecapPeriod } from "./constants";

export interface AppDayAggregate {
  label: string;
  activeMs: number;
  longestStreakMs: number;
  interruptionsStarted: number;
  interruptionsCompleted: number;
  returnTimeTotalMs: number;
}

export interface DayAggregate {
  appChanges: number;
  apps: Record<string, AppDayAggregate>;
  transitions?: Record<string, number>;
  /** How many calendar days this aggregate covers; set by combineDays, absent (one day) in saved history. */
  spanDays?: number;
}

export type AppPreferenceMap = Record<string, string>;

export type History = Record<string, DayAggregate>;

export interface Snapshot {
  at: number;
  appId: string;
  label: string;
  idle: boolean;
  excluded?: boolean;
}

export interface RecapStats {
  totalActiveMs: number;
  appChanges: number;
  longestStreakMs: number;
  topAppShare: number;
  topAppLabel: string;
  uniqueApps: number;
  completedInterruptions: number;
  averageReturnMs: number;
}

export interface Archetype {
  id: string;
  name: string;
  emoji: string;
  line: string;
}

/** A place to post the saved card, offered only after the user has previewed and saved it. */
export type ShareTarget =
  | "whatsapp"
  | "telegram"
  | "telegramApp"
  | "facebook"
  | "messenger"
  | "messengerApp"
  | "instagram"
  | "snapchat"
  | "tiktok"
  | "linkedin"
  | "x";

export interface ShareOutcome {
  /** Whether the app opened a share page or an app-specific hand-off. */
  opened: boolean;
  /** A plain-language note for the UI; never a network request by the app itself. */
  message: string;
  /** The file that was handed to the operating system, when one was. */
  filePath?: string;
}

export interface AppBridge {
  getState(): Promise<AppState>;
  setTracking(enabled: boolean): Promise<AppState>;
  setStartAtLogin(enabled: boolean): Promise<void>;
  setToggle(setting: ToggleSetting, enabled: boolean): Promise<AppState>;
  setTheme(theme: ThemeChoice): Promise<AppState>;
  getI18n(): Promise<I18nPayload>;
  setLanguage(choice: string): Promise<I18nPayload>;
  onI18n(callback: (payload: I18nPayload) => void): () => void;
  setExcludedApp(executableId: string, label: string, excluded: boolean): Promise<AppState>;
  setHiddenOnCard(executableId: string, label: string, hidden: boolean): Promise<AppState>;
  removeAppPastData(executableId: string): Promise<AppRemovalResult>;
  deleteHistory(): Promise<void>;
  exportHistoryCsv(): Promise<string | null>;
  previewCard(format: CardFormat, period: RecapPeriod): Promise<string>;
  exportCard(format: CardFormat, period: RecapPeriod): Promise<string | null>;
  shareCard(target: ShareTarget, format: CardFormat, period: RecapPeriod, savedPath: string | null): Promise<ShareOutcome>;
  onState(callback: (state: AppState) => void): () => void;
}

/** Everything the renderer needs to show the interface in the chosen language. */
export interface I18nPayload {
  /** "auto" or a catalog code. */
  choice: string;
  /** The catalog in use. */
  locale: string;
  /** What "auto" resolves to on this PC, for the menu's "Automatic · Română" entry. */
  autoLocale: string;
  dir: "ltr" | "rtl";
  messages: Record<string, string>;
  /** English, for any key the catalog lacks. */
  fallback: Record<string, string>;
  languages: Array<{ code: string; nativeName: string }>;
}

/** How the window looks: the light turquoise default, dark blue, or whatever Windows uses. */
export type ThemeChoice = "light" | "dark" | "system";

/** On/off settings the renderer may change through `settings:toggle`. */
export type ToggleSetting = "resumeTracking" | "countFullscreen";

export interface AppState {
  tracking: boolean;
  startAtLogin: boolean;
  resumeTracking: boolean;
  countFullscreen: boolean;
  theme: ThemeChoice;
  /** The language setting: "auto" or a catalog code. */
  language: string;
  /** The catalog actually in use. */
  locale: string;
  excludedApps: AppPreferenceMap;
  hiddenApps: AppPreferenceMap;
  today: DayAggregate;
  week: DayAggregate;
  month: DayAggregate;
  year: DayAggregate;
  todayStats: RecapStats;
  weekStats: RecapStats;
  monthStats: RecapStats;
  yearStats: RecapStats;
  todayArchetype: Archetype;
  weekArchetype: Archetype;
  monthArchetype: Archetype;
  yearArchetype: Archetype;
  warning: string;
}

export interface AppRemovalResult {
  confirmed: boolean;
  removedDays: number;
  removedActiveMs: number;
  removedTransitions: number;
}
