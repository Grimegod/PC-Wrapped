import assert from "node:assert/strict";
import test from "node:test";
import { historyToCsv } from "../src/main/csv";
import { monthKeys, yearKeysToDate, dayKeysEndingAt, localDateKey } from "../src/shared/dates";
import type { History } from "../src/shared/model";

test("month keys cover the whole calendar month, leap years included", () => {
  const feb2024 = monthKeys(new Date(2024, 1, 14, 10, 0, 0).getTime());
  assert.equal(feb2024.length, 29);
  assert.equal(feb2024[0], "2024-02-01");
  assert.equal(feb2024[28], "2024-02-29");

  const feb2023 = monthKeys(new Date(2023, 1, 14).getTime());
  assert.equal(feb2023.length, 28);

  const december = monthKeys(new Date(2026, 11, 31).getTime());
  assert.equal(december.length, 31);
  assert.equal(december[30], "2026-12-31");
});

test("year keys run from 1 January through the given day", () => {
  const keys = yearKeysToDate(new Date(2026, 0, 1).getTime());
  assert.deepEqual(keys, ["2026-01-01"]);

  const midYear = yearKeysToDate(new Date(2026, 6, 2, 23, 59).getTime());
  assert.equal(midYear[0], "2026-01-01");
  assert.equal(midYear[midYear.length - 1], "2026-07-02");
  // 31+28+31+30+31+30 = 181 days to 30 June, plus 1 and 2 July.
  assert.equal(midYear.length, 183);
  assert.equal(new Set(midYear).size, midYear.length, "no day is repeated");
});

test("week keys end on the given day and never overlap the year keys' first day twice", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  const week = dayKeysEndingAt(now, 7);
  assert.equal(week.length, 7);
  assert.equal(week[6], localDateKey(now));
  assert.equal(week[0], "2026-11-07");
});

test("CSV export writes a header plus one row per app per day, newest day first", () => {
  const history: History = {
    "2026-11-12": {
      appChanges: 3,
      apps: {
        "code.exe": {
          label: "Code",
          activeMs: 90_000,
          longestStreakMs: 60_000,
          interruptionsStarted: 1,
          interruptionsCompleted: 1,
          returnTimeTotalMs: 30_000
        },
        "slack.exe": {
          label: "Slack",
          activeMs: 30_000,
          longestStreakMs: 30_000,
          interruptionsStarted: 0,
          interruptionsCompleted: 0,
          returnTimeTotalMs: 0
        }
      }
    },
    "2026-11-13": {
      appChanges: 1,
      apps: {
        "code.exe": {
          label: "Code",
          activeMs: 60_000,
          longestStreakMs: 60_000,
          interruptionsStarted: 0,
          interruptionsCompleted: 0,
          returnTimeTotalMs: 0
        }
      }
    }
  };
  const csv = historyToCsv(history);
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
  assert.equal(
    lines[0],
    "date,executable_id,app_label,active_seconds,longest_streak_seconds,interruptions_started,interruptions_completed,return_time_seconds"
  );
  assert.equal(lines.length, 4, "header plus three rows");
  assert.ok(lines[1].startsWith("2026-11-13,code.exe,Code,60,"), "newest day comes first");
  assert.ok(lines[2].startsWith("2026-11-12,code.exe,Code,90,"), "within a day, the busiest app comes first");
  assert.ok(lines[3].startsWith("2026-11-12,slack.exe,Slack,30,"));
  assert.ok(csv.startsWith("\uFEFF"), "a BOM keeps Excel from mangling non-ASCII names");
});

test("CSV export quotes labels that contain commas or quotes", () => {
  const history: History = {
    "2026-11-13": {
      appChanges: 0,
      apps: {
        "weird.exe": {
          label: 'App, "the" great',
          activeMs: 1000,
          longestStreakMs: 0,
          interruptionsStarted: 0,
          interruptionsCompleted: 0,
          returnTimeTotalMs: 0
        }
      }
    }
  };
  const line = historyToCsv(history).trimEnd().split("\r\n")[1];
  assert.ok(line.includes('"App, ""the"" great"'), line);
});

test("CSV export of an empty history is just the header", () => {
  const lines = historyToCsv({})
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
  assert.equal(lines.length, 1);
});
