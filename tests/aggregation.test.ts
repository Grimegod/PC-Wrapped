import assert from "node:assert/strict";
import test from "node:test";
import { ActivityAggregator, combineDays, emptyDay, recapStats, removeAppFromHistory, transitionKey } from "../src/shared/aggregation";
import { MIN_INTERRUPTION_STREAK_MS } from "../src/shared/constants";
import { localDateKey } from "../src/shared/dates";
import type { Snapshot } from "../src/shared/model";

const base = new Date(2026, 10, 12, 9, 0, 0).getTime();
const snap = (seconds: number, appId: string, idle = false): Snapshot => ({
  at: base + seconds * 1000,
  appId,
  label: appId === "editor" ? "Text Editor" : appId === "browser" ? "Web Browser" : appId,
  idle
});

test("deterministic synthetic timeline counts active intervals and excludes idle", () => {
  const model = new ActivityAggregator();
  [
    snap(0, "editor"),
    snap(2, "editor"),
    snap(6, "browser"),
    snap(10, "browser"),
    snap(12, "browser", true),
    snap(14, "browser", true),
    snap(16, "editor"),
    snap(20, "editor"),
    snap(22, "editor")
  ].forEach((event) => model.ingest(event));
  const day = model.history[Object.keys(model.history)[0]];
  assert.equal(day.apps.editor.activeMs, 12_000);
  assert.equal(day.apps.browser.activeMs, 6_000);
  assert.equal(day.appChanges, 1);
  assert.equal(recapStats(day).totalActiveMs, 18_000);
});

test("longest focus streak ends on app switch and idle", () => {
  const model = new ActivityAggregator();
  [
    snap(0, "editor"),
    snap(2, "editor"),
    snap(6, "editor"),
    snap(8, "browser"),
    snap(10, "browser", true),
    snap(12, "browser", true),
    snap(14, "browser"),
    snap(16, "browser")
  ].forEach((event) => model.ingest(event));
  const day = model.history[Object.keys(model.history)[0]];
  assert.equal(day.apps.editor.longestStreakMs, 8_000);
  assert.equal(day.apps.browser.longestStreakMs, 2_000);
  assert.equal(recapStats(day).longestStreakMs, 8_000);
});

test("interruption return requires a long visit then 30 seconds continuously back", () => {
  const model = new ActivityAggregator();
  for (let t = 0; t <= MIN_INTERRUPTION_STREAK_MS; t += 2_000) model.ingest({ ...snap(t / 1000, "editor"), at: base + t });
  model.ingest({ ...snap(0, "browser"), at: base + MIN_INTERRUPTION_STREAK_MS + 2_000 });
  model.ingest({ ...snap(0, "browser"), at: base + MIN_INTERRUPTION_STREAK_MS + 4_000 });
  model.ingest({ ...snap(0, "editor"), at: base + MIN_INTERRUPTION_STREAK_MS + 6_000 });
  for (let t = MIN_INTERRUPTION_STREAK_MS + 8_000; t <= MIN_INTERRUPTION_STREAK_MS + 36_000; t += 2_000) {
    model.ingest({ ...snap(0, "editor"), at: base + t });
  }
  const day = model.history[Object.keys(model.history)[0]];
  assert.equal(day.apps.editor.interruptionsStarted, 1);
  assert.equal(day.apps.editor.interruptionsCompleted, 1);
  assert.equal(day.apps.editor.returnTimeTotalMs, 4_000);
  assert.equal(recapStats(day).averageReturnMs, 4_000);
});

test("an idle interval is not included in return time", () => {
  const model = new ActivityAggregator();
  for (let t = 0; t <= MIN_INTERRUPTION_STREAK_MS; t += 2_000) model.ingest({ ...snap(t / 1000, "editor"), at: base + t });
  model.ingest({ ...snap(0, "browser"), at: base + MIN_INTERRUPTION_STREAK_MS + 2_000 });
  model.ingest({ ...snap(0, "browser"), at: base + MIN_INTERRUPTION_STREAK_MS + 4_000 });
  for (let t = MIN_INTERRUPTION_STREAK_MS + 6_000; t < MIN_INTERRUPTION_STREAK_MS + 120_000; t += 2_000) {
    model.ingest({ ...snap(0, "browser", true), at: base + t });
  }
  model.ingest({ ...snap(0, "editor"), at: base + MIN_INTERRUPTION_STREAK_MS + 120_000 });
  for (let t = MIN_INTERRUPTION_STREAK_MS + 122_000; t <= MIN_INTERRUPTION_STREAK_MS + 150_000; t += 2_000) {
    model.ingest({ ...snap(0, "editor"), at: base + t });
  }
  const day = model.history[Object.keys(model.history)[0]];
  assert.equal(day.apps.editor.interruptionsCompleted, 1);
  assert.equal(day.apps.editor.returnTimeTotalMs, 4_000);
});

test("daily summaries split exactly at local midnight", () => {
  const model = new ActivityAggregator();
  const beforeMidnight = new Date(2026, 10, 12, 23, 59, 58).getTime();
  model.ingest({ ...snap(0, "editor"), at: beforeMidnight });
  model.ingest({ ...snap(0, "editor"), at: beforeMidnight + 2_000 });
  model.ingest({ ...snap(0, "editor"), at: beforeMidnight + 4_000 });
  assert.equal(model.history[localDateKey(beforeMidnight)].apps.editor.activeMs, 2_000);
  assert.equal(model.history[localDateKey(beforeMidnight + 2_000)].apps.editor.activeMs, 2_000);
});

test("a daylight-saving clock change does not alter elapsed active time", () => {
  const model = new ActivityAggregator();
  const beforeClockFallback = Date.UTC(2026, 9, 25, 0, 59, 0);
  for (let elapsed = 0; elapsed <= 60_000; elapsed += 2_000) {
    model.ingest({ ...snap(0, "editor"), at: beforeClockFallback + elapsed });
  }
  const dayKey = Object.keys(model.history)[0];
  assert.equal(model.history[dayKey].apps.editor.activeMs, 60_000);
});

test("excluded apps add no time and break a focus streak", () => {
  const model = new ActivityAggregator();
  model.ingest(snap(0, "editor"));
  model.ingest(snap(2, "editor"));
  model.ingest({ ...snap(4, "system-ui"), excluded: true });
  model.ingest({ ...snap(6, "system-ui"), excluded: true });
  model.ingest(snap(8, "editor"));
  model.ingest(snap(10, "editor"));
  const day = model.history[Object.keys(model.history)[0]];
  assert.equal(day.apps.editor.activeMs, 6_000);
  assert.equal(day.apps.editor.longestStreakMs, 4_000);
  assert.equal(day.apps["system-ui"], undefined);
  assert.equal(day.appChanges, 0);
  assert.doesNotMatch(JSON.stringify(model.history), /system-ui/);
});

test("an excluded neutral gap starts no interruption timer and does not count toward return time", () => {
  const model = new ActivityAggregator();
  for (let t = 0; t <= MIN_INTERRUPTION_STREAK_MS; t += 2_000) model.ingest({ ...snap(t / 1000, "editor"), at: base + t });
  model.ingest({ ...snap(0, "private-chat"), at: base + MIN_INTERRUPTION_STREAK_MS + 2_000, excluded: true });
  model.ingest({ ...snap(0, "private-chat"), at: base + MIN_INTERRUPTION_STREAK_MS + 20_000, excluded: true });
  model.ingest({ ...snap(0, "editor"), at: base + MIN_INTERRUPTION_STREAK_MS + 22_000 });
  for (let t = MIN_INTERRUPTION_STREAK_MS + 24_000; t <= MIN_INTERRUPTION_STREAK_MS + 54_000; t += 2_000) {
    model.ingest({ ...snap(0, "editor"), at: base + t });
  }
  const day = model.history[Object.keys(model.history)[0]];
  assert.equal(day.apps["private-chat"], undefined);
  assert.equal(day.apps.editor.interruptionsStarted, 0);
  assert.equal(day.apps.editor.interruptionsCompleted, 0);
  assert.equal(day.appChanges, 0);
  assert.doesNotMatch(JSON.stringify(model.history), /private-chat/);
});

test("past app removal changes nothing until confirmed, then removes app totals and related switches", () => {
  const history = { "2026-11-12": emptyDay() };
  const day = history["2026-11-12"];
  day.apps.editor = {
    label: "Text Editor",
    activeMs: 60_000,
    longestStreakMs: 30_000,
    interruptionsStarted: 1,
    interruptionsCompleted: 1,
    returnTimeTotalMs: 8_000
  };
  day.apps.browser = {
    label: "Web Browser",
    activeMs: 20_000,
    longestStreakMs: 12_000,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  day.transitions![transitionKey("editor", "browser")] = 3;
  day.transitions![transitionKey("browser", "editor")] = 2;
  day.transitions![transitionKey("browser", "terminal")] = 4;
  day.appChanges = 9;
  const before = JSON.stringify(history);
  const cancelled = removeAppFromHistory(history, "editor", false);
  assert.deepEqual(cancelled, { confirmed: false, removedDays: 0, removedActiveMs: 0, removedTransitions: 0 });
  assert.equal(JSON.stringify(history), before);
  const removed = removeAppFromHistory(history, "editor", true);
  assert.deepEqual(removed, { confirmed: true, removedDays: 1, removedActiveMs: 60_000, removedTransitions: 5 });
  assert.equal(day.apps.editor, undefined);
  assert.equal(day.apps.browser.activeMs, 20_000);
  assert.equal(day.appChanges, 4);
  assert.deepEqual(Object.keys(day.transitions!), [transitionKey("browser", "terminal")]);
});

test("removing an app from a legacy day clears ambiguous app-change totals", () => {
  const history = {
    "2026-11-12": {
      appChanges: 7,
      apps: {
        editor: {
          label: "Text Editor",
          activeMs: 1_000,
          longestStreakMs: 1_000,
          interruptionsStarted: 0,
          interruptionsCompleted: 0,
          returnTimeTotalMs: 0
        }
      }
    }
  };
  removeAppFromHistory(history, "editor", true);
  assert.equal(history["2026-11-12"].appChanges, 0);
});

test("app time can never exceed the wall-clock time a sample stream spans", () => {
  // Ten minutes of samples arriving twice as fast as they should (a stalled adapter catching up,
  // a resumed laptop, a clock step): app time must still not exceed the ten minutes that passed.
  const model = new ActivityAggregator();
  for (let second = 0; second <= 600; second += 1) model.ingest(snap(second, second % 2 ? "editor" : "browser"));
  const day = model.history[localDateKey(base)];
  const totals = Object.values(day.apps).reduce((sum, app) => sum + app.activeMs, 0);
  assert.ok(totals <= 600_000, `credited ${totals}ms for a 600000ms span`);
});

test("one stalled sample cannot credit more than one sample interval", () => {
  const model = new ActivityAggregator();
  model.ingest(snap(0, "editor"));
  // A 9-second gap is still a continuous sample (below the gap threshold) but may only credit the
  // adapter's own cadence, never nine seconds of a single 2-second sample.
  model.ingest(snap(9, "editor"));
  model.ingest(snap(11, "editor"));
  const day = model.history[localDateKey(base)];
  // 9s sample credits 4s (the cap), 11s sample credits its full 2s: 6s total.
  assert.equal(day.apps.editor.activeMs, 6_000);
});

test("a single day never reports more active time than a day holds", () => {
  const stats = recapStats({
    apps: {
      a: { label: "A", activeMs: 900_000_000, longestStreakMs: 0, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 }
    },
    appChanges: 0
  });
  assert.equal(stats.totalActiveMs, 86_400_000);
});

test("a full day of samples lands inside one calendar day and never overflows it", () => {
  // 24 hours of one-second samples from local midnight: the day rolls over exactly once and no
  // single day can be credited more time than it holds.
  const midnight = new Date(2026, 10, 12, 0, 0, 0).getTime();
  const model = new ActivityAggregator();
  // Half past midnight to half past midnight, so the run genuinely spans two calendar days.
  for (let second = 0; second <= 86_400; second += 1) {
    model.ingest({ at: midnight + 1_800_000 + second * 1000, appId: "editor", label: "Text Editor", idle: false });
  }
  const days = Object.values(model.history);
  assert.equal(days.length, 2, "midnight splits the samples into two days");
  for (const day of days) {
    const stats = recapStats(day);
    assert.ok(stats.totalActiveMs <= 86_400_000, `a day reported ${stats.totalActiveMs}ms`);
  }
});

test("a week's total is not cut to one day's 24 hours, and the top app never exceeds 100%", () => {
  const HOUR = 3_600_000;
  const workday = () => {
    const day = emptyDay();
    day.apps.code = {
      label: "VS Code",
      activeMs: 8 * HOUR,
      longestStreakMs: 0,
      interruptionsStarted: 0,
      interruptionsCompleted: 0,
      returnTimeTotalMs: 0
    };
    day.apps.chrome = {
      label: "Chrome",
      activeMs: 1 * HOUR,
      longestStreakMs: 0,
      interruptionsStarted: 0,
      interruptionsCompleted: 0,
      returnTimeTotalMs: 0
    };
    return day;
  };
  const week = combineDays(Array.from({ length: 7 }, workday));
  assert.equal(week.spanDays, 7);
  const stats = recapStats(week);
  assert.equal(stats.totalActiveMs, 63 * HOUR);
  assert.ok(stats.topAppShare <= 1);
  assert.equal(Math.round(stats.topAppShare * 100), 89);
});

test("each day still cannot hold more than 24 hours, combined or not", () => {
  const HOUR = 3_600_000;
  const broken = emptyDay();
  broken.apps.a = {
    label: "A",
    activeMs: 30 * HOUR,
    longestStreakMs: 0,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  assert.equal(recapStats(broken).totalActiveMs, 24 * HOUR);
  assert.equal(recapStats(combineDays([broken])).totalActiveMs, 24 * HOUR);
  assert.equal(recapStats(combineDays([broken, emptyDay()])).totalActiveMs, 30 * HOUR);
  assert.equal(recapStats(broken).topAppShare, 1);
});
