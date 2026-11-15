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

export interface AppState {
  tracking: boolean;
  startAtLogin: boolean;
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
