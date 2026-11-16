// Which calendar days a recap covers, and which earlier days it is fairly compared with.
// Pure and Electron-free so the windows can be tested directly.
import type { RecapPeriod } from "./constants";
import { dayKeysEndingAt, localDateKey } from "./dates";

/** Every day key from `start` through `end` (both local midnights), inclusive. */
function keysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  while (cursor.getTime() <= last) {
    keys.push(localDateKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** The days the current recap covers, ending today. Month and year run from their first day to today. */
export function periodKeys(period: RecapPeriod, now: number): string[] {
  const today = new Date(now);
  if (period === "day") return [localDateKey(now)];
  if (period === "week") return dayKeysEndingAt(now, 7);
  if (period === "month") return keysBetween(new Date(today.getFullYear(), today.getMonth(), 1), today);
  return keysBetween(new Date(today.getFullYear(), 0, 1), today);
}

/**
 * The days the current recap is compared with, chosen so both sides cover the same stretch of the
 * calendar: yesterday for today, the seven days before for the last seven, and the same days of
 * last month for this month (1–16 November against 1–16 October).
 *
 * The year has no comparison: history is kept for 365 days, so last year's matching days are gone.
 */
export function previousPeriodKeys(period: RecapPeriod, now: number): string[] {
  const today = new Date(now);
  if (period === "day") {
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    return [localDateKey(yesterday.getTime())];
  }
  if (period === "week") {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    return dayKeysEndingAt(end.getTime(), 7);
  }
  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfPrevious = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    const end = new Date(start.getFullYear(), start.getMonth(), Math.min(today.getDate(), lastOfPrevious));
    return keysBetween(start, end);
  }
  return [];
}
