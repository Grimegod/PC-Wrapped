import {
  MAX_CREDITED_INTERVAL_MS,
  MAX_PENDING_INTERRUPTS,
  MAX_SAMPLE_GAP_MS,
  MIN_INTERRUPTION_STREAK_MS,
  RETURN_STABILITY_MS,
  RETENTION_DAYS
} from "./constants";
import { dayKeysEndingAt, localDateKey, nextLocalMidnight } from "./dates";
import type { AppDayAggregate, DayAggregate, History, RecapStats, Snapshot } from "./model";

export function emptyDay(): DayAggregate {
  return { appChanges: 0, apps: {}, transitions: {} };
}

export function transitionKey(fromId: string, toId: string): string {
  return JSON.stringify([fromId, toId]);
}

function emptyApp(label: string): AppDayAggregate {
  return { label, activeMs: 0, longestStreakMs: 0, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 };
}

export class ActivityAggregator {
  readonly history: History;
  private previous?: Snapshot;
  private streakMs = 0;
  private pending: Array<{ appId: string; dayKey: string; elapsedActiveMs: number; candidate: boolean; stableMs: number }> = [];

  constructor(history: History = {}) {
    this.history = history;
  }

  ingest(snapshot: Snapshot): void {
    if (!Number.isFinite(snapshot.at) || !snapshot.appId) return;
    if (!this.previous) {
      this.previous = { ...snapshot };
      this.streakMs = 0;
      return;
    }

    const previous = this.previous;
    const rawDelta = snapshot.at - previous.at;
    if (rawDelta <= 0) return;
    // Never credit more than one sample interval per sample: a resumed laptop, a clock change or a
    // stalled adapter must not inflate app time past wall-clock time.
    const delta = Math.min(rawDelta, MAX_CREDITED_INTERVAL_MS);

    if (rawDelta > MAX_SAMPLE_GAP_MS) {
      this.streakMs = 0;
      this.pending = [];
      this.previous = { ...snapshot };
      return;
    }

    const previousInactive = previous.idle || previous.excluded === true;
    const currentInactive = snapshot.idle || snapshot.excluded === true;
    if (!previousInactive) {
      this.addActiveInterval(previous.appId, previous.label, previous.at, previous.at + delta);
      this.streakMs += delta;
      this.recordStreak(previous.appId, previous.label, previous.at, previous.at + delta, this.streakMs);
    }

    this.advanceInterruptions(previous, delta);

    const appChanged = previous.appId !== snapshot.appId;
    const becameIdle = !previousInactive && currentInactive;
    const woke = previousInactive && !currentInactive;
    if (!currentInactive && (appChanged || previousInactive)) {
      for (const pending of this.pending) {
        if (pending.appId === snapshot.appId) {
          pending.candidate = true;
          pending.stableMs = 0;
        }
      }
    }
    if (appChanged && !previousInactive && !currentInactive) {
      const day = this.getDay(localDateKey(snapshot.at));
      day.appChanges += 1;
      const key = transitionKey(previous.appId, snapshot.appId);
      day.transitions ??= {};
      day.transitions[key] = (day.transitions[key] ?? 0) + 1;
      if (this.streakMs >= MIN_INTERRUPTION_STREAK_MS) {
        const sourceApp = this.getApp(localDateKey(snapshot.at), previous.appId, previous.label);
        sourceApp.interruptionsStarted += 1;
        this.pending.push({ appId: previous.appId, dayKey: localDateKey(snapshot.at), elapsedActiveMs: 0, candidate: false, stableMs: 0 });
        if (this.pending.length > MAX_PENDING_INTERRUPTS) this.pending.shift();
      }
    }

    // A new app, going idle or coming back each start a fresh uninterrupted stretch.
    if (appChanged || becameIdle || woke) this.streakMs = 0;
    this.previous = { ...snapshot };
  }

  resetContinuity(): void {
    this.streakMs = 0;
    this.pending = [];
    this.previous = undefined;
  }

  private addActiveInterval(appId: string, label: string, from: number, to: number): void {
    // `to` is already clamped to the credited interval by ingest(); this is the day-splitting loop.
    let cursor = from;
    while (cursor < to) {
      const key = localDateKey(cursor);
      const end = Math.min(to, nextLocalMidnight(cursor));
      this.getApp(key, appId, label).activeMs += end - cursor;
      cursor = end;
    }
  }

  private recordStreak(appId: string, label: string, from: number, to: number, streakMs: number): void {
    let cursor = from;
    while (cursor < to) {
      const key = localDateKey(cursor);
      const end = Math.min(to, nextLocalMidnight(cursor));
      const app = this.getApp(key, appId, label);
      app.longestStreakMs = Math.max(app.longestStreakMs, streakMs);
      cursor = end;
    }
  }

  private advanceInterruptions(previous: Snapshot, delta: number): void {
    if (previous.idle || previous.excluded) {
      this.pending.forEach((p) => {
        p.candidate = false;
        p.stableMs = 0;
      });
      return;
    }
    const completed = new Set<number>();
    this.pending.forEach((p, index) => {
      p.elapsedActiveMs += delta;
      if (!p.candidate) return;
      if (previous.appId !== p.appId) {
        p.candidate = false;
        p.stableMs = 0;
        return;
      }
      p.stableMs += delta;
      if (p.stableMs >= RETURN_STABILITY_MS) {
        const app = this.getApp(p.dayKey, p.appId, previous.label);
        app.interruptionsCompleted += 1;
        app.returnTimeTotalMs += Math.max(0, p.elapsedActiveMs - p.stableMs);
        completed.add(index);
      }
    });
    if (completed.size) this.pending = this.pending.filter((_, index) => !completed.has(index));
  }

  private getDay(key: string): DayAggregate {
    return this.history[key] ?? (this.history[key] = emptyDay());
  }

  private getApp(key: string, appId: string, label: string): AppDayAggregate {
    const day = this.getDay(key);
    const app = day.apps[appId] ?? (day.apps[appId] = emptyApp(label));
    if (label && app.label !== label) app.label = label;
    return app;
  }
}

export function pruneHistory(history: History, now: number, retentionDays = RETENTION_DAYS): History {
  const allowed = new Set(dayKeysEndingAt(now, retentionDays));
  return Object.fromEntries(Object.entries(history).filter(([key]) => allowed.has(key)));
}

export function combineDays(days: DayAggregate[]): DayAggregate {
  const result: DayAggregate = { ...emptyDay(), spanDays: 0 };
  for (const day of days) {
    result.spanDays! += Math.max(1, day.spanDays ?? 1);
    result.appChanges += day.appChanges;
    for (const [key, count] of Object.entries(day.transitions ?? {})) {
      result.transitions![key] = (result.transitions![key] ?? 0) + count;
    }
    for (const [id, source] of Object.entries(day.apps)) {
      const target = result.apps[id] ?? (result.apps[id] = emptyApp(source.label));
      target.label = source.label || target.label;
      target.activeMs += source.activeMs;
      target.longestStreakMs = Math.max(target.longestStreakMs, source.longestStreakMs);
      target.interruptionsStarted += source.interruptionsStarted;
      target.interruptionsCompleted += source.interruptionsCompleted;
      target.returnTimeTotalMs += source.returnTimeTotalMs;
    }
  }
  return result;
}

export function removeAppFromHistory(history: History, executableId: string, confirmed: boolean): import("./model").AppRemovalResult {
  const result = { confirmed, removedDays: 0, removedActiveMs: 0, removedTransitions: 0 };
  if (!confirmed) return result;
  for (const day of Object.values(history)) {
    const app = day.apps[executableId];
    if (app) {
      result.removedDays += 1;
      result.removedActiveMs += app.activeMs;
      delete day.apps[executableId];
    }
    if (day.transitions) {
      for (const [key, count] of Object.entries(day.transitions)) {
        try {
          const pair = JSON.parse(key) as unknown;
          if (Array.isArray(pair) && pair.includes(executableId)) {
            result.removedTransitions += count;
            delete day.transitions[key];
          }
        } catch {
          /* Keep unknown transition keys intact. */
        }
      }
      day.appChanges = Object.values(day.transitions).reduce((sum, count) => sum + count, 0);
    } else if (app) {
      // Older summaries do not identify which app changes involved this app.
      // Clear the ambiguous total rather than retaining a count linked to it.
      day.appChanges = 0;
    }
  }
  return result;
}

/** One day can never hold more active app time than a day has: two apps cannot both claim the same minute. */
export const MAX_DAY_ACTIVE_MS = 24 * 60 * 60 * 1000;

/**
 * Totals for a day or for several combined days.
 *
 * The wall-clock cap scales with the number of days the aggregate covers: a week can hold up to
 * 7 × 24 hours, not 24. The top app's share is measured against the uncapped sum so it can never
 * read above 100%.
 */
export function recapStats(day: DayAggregate): RecapStats {
  const apps = Object.values(day.apps);
  const summedMs = apps.reduce((sum, app) => sum + app.activeMs, 0);
  const totalActiveMs = Math.min(summedMs, MAX_DAY_ACTIVE_MS * Math.max(1, day.spanDays ?? 1));
  const top = [...apps].sort((a, b) => b.activeMs - a.activeMs)[0];
  const completedInterruptions = apps.reduce((sum, app) => sum + app.interruptionsCompleted, 0);
  const returnTimeTotalMs = apps.reduce((sum, app) => sum + app.returnTimeTotalMs, 0);
  return {
    totalActiveMs,
    appChanges: day.appChanges,
    longestStreakMs: apps.reduce((max, app) => Math.max(max, app.longestStreakMs), 0),
    topAppShare: summedMs > 0 && top ? Math.min(1, top.activeMs / summedMs) : 0,
    topAppLabel: top?.label ?? "No app yet",
    uniqueApps: apps.filter((app) => app.activeMs > 0).length,
    completedInterruptions,
    averageReturnMs: completedInterruptions ? returnTimeTotalMs / completedInterruptions : 0
  };
}
