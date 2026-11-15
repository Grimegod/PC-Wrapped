import type { History } from "../shared/model";

/** Quote a field for CSV, doubling any embedded quote. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The whole saved history as CSV, one row per app per day, newest day first.
 *
 * Only what is already stored is written: no window titles, no screenshots, no process paths.
 * Durations are in whole seconds so the file opens cleanly in a spreadsheet.
 */
export function historyToCsv(history: History): string {
  const header = [
    "date",
    "executable_id",
    "app_label",
    "active_seconds",
    "longest_streak_seconds",
    "interruptions_started",
    "interruptions_completed",
    "return_time_seconds"
  ];
  const rows: string[][] = [header];
  const days = Object.keys(history).sort().reverse();
  for (const day of days) {
    const apps = history[day]?.apps ?? {};
    const entries = Object.entries(apps).sort((a, b) => b[1].activeMs - a[1].activeMs);
    for (const [id, app] of entries) {
      rows.push([
        day,
        id,
        app.label,
        String(Math.round(app.activeMs / 1000)),
        String(Math.round(app.longestStreakMs / 1000)),
        String(app.interruptionsStarted),
        String(app.interruptionsCompleted),
        String(Math.round(app.returnTimeTotalMs / 1000))
      ]);
    }
  }
  // A BOM keeps Excel from mangling non-ASCII app names.
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
