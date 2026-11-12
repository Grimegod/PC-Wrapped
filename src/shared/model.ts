import type { CardFormat } from "./constants";
export type { CardFormat } from "./constants";

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

export interface AppBridge {
  getState(): Promise<AppState>;
  setTracking(enabled: boolean): Promise<AppState>;
  setStartAtLogin(enabled: boolean): Promise<void>;
  setExcludedApp(executableId: string, label: string, excluded: boolean): Promise<AppState>;
  setHiddenOnCard(executableId: string, label: string, hidden: boolean): Promise<AppState>;
  removeAppPastData(executableId: string): Promise<AppRemovalResult>;
  deleteHistory(): Promise<void>;
  previewCard(format: CardFormat, period: "day" | "week"): Promise<string>;
  exportCard(format: CardFormat, period: "day" | "week"): Promise<string | null>;
  onState(callback: (state: AppState) => void): () => void;
}

export interface AppState {
  tracking: boolean;
  startAtLogin: boolean;
  excludedApps: AppPreferenceMap;
  hiddenApps: AppPreferenceMap;
  today: DayAggregate;
  week: DayAggregate;
  todayStats: RecapStats;
  weekStats: RecapStats;
  todayArchetype: Archetype;
  weekArchetype: Archetype;
  warning: string;
}

export interface AppRemovalResult {
  confirmed: boolean;
  removedDays: number;
  removedActiveMs: number;
  removedTransitions: number;
}
