import assert from "node:assert/strict";
import test from "node:test";
import { comparePeriods } from "../src/shared/comparison";
import { comparisonLine } from "../src/main/card";
import { previousDayKeys } from "../src/shared/dates";
import { periodKeys, previousPeriodKeys } from "../src/shared/periods";
import type { RecapStats } from "../src/shared/model";

const stats = (totalActiveMs: number): RecapStats => ({
  totalActiveMs,
  appChanges: 0,
  longestStreakMs: 0,
  topAppShare: 0,
  topAppLabel: "None",
  uniqueApps: 0,
  completedInterruptions: 0,
  averageReturnMs: 0
});

const HOUR = 3_600_000;

test("a longer period reads as a rise", () => {
  const result = comparePeriods(stats(4 * HOUR), stats(2 * HOUR));
  assert.equal(result.isFirst, false);
  assert.equal(result.ratioChange, 1);
  assert.equal(comparisonLine(result), "+100%");
});

test("a shorter period reads as a fall with a minus sign", () => {
  const result = comparePeriods(stats(1 * HOUR), stats(2 * HOUR));
  assert.equal(comparisonLine(result), "−50%");
});

test("an equal period says about the same", () => {
  assert.equal(comparisonLine(comparePeriods(stats(3 * HOUR), stats(3 * HOUR))), "about the same");
});

test("with no earlier period there is no line", () => {
  const result = comparePeriods(stats(5 * HOUR), stats(0));
  assert.equal(result.isFirst, true);
  assert.equal(comparisonLine(result), null);
});

test("no comparison at all prints nothing", () => {
  assert.equal(comparisonLine(undefined), null);
});

test("the previous window is the same length as the current one and sits before it", () => {
  const now = new Date(2026, 10, 15, 12, 0, 0).getTime();
  const day = previousDayKeys(now, 1);
  const week = previousDayKeys(now, 7);
  assert.equal(day.length, 1);
  assert.equal(week.length, 7);
  assert.notEqual(day[0], "2026-11-15");
});

test("this month is compared with the same days of last month, not with a sliding 30 days", () => {
  const now = new Date(2026, 10, 16, 10, 0, 0).getTime();
  const current = periodKeys("month", now);
  const previous = previousPeriodKeys("month", now);
  assert.equal(current[0], "2026-11-01");
  assert.equal(current.at(-1), "2026-11-16");
  assert.equal(current.length, 16);
  assert.deepEqual([previous[0], previous.at(-1), previous.length], ["2026-10-01", "2026-10-16", 16]);
});

test("a long month's last days are compared with the whole of a shorter month", () => {
  const now = new Date(2026, 2, 31, 9, 0, 0).getTime();
  const previous = previousPeriodKeys("month", now);
  assert.deepEqual([previous[0], previous.at(-1)], ["2026-02-01", "2026-02-28"]);
  const january = previousPeriodKeys("month", new Date(2026, 0, 10).getTime());
  assert.deepEqual([january[0], january.at(-1)], ["2025-12-01", "2025-12-10"]);
});

test("today is compared with yesterday, the last 7 days with the 7 before, and the year not at all", () => {
  const now = new Date(2026, 10, 16, 0, 30, 0).getTime();
  assert.deepEqual(periodKeys("day", now), ["2026-11-16"]);
  assert.deepEqual(previousPeriodKeys("day", now), ["2026-11-15"]);
  const week = periodKeys("week", now);
  const before = previousPeriodKeys("week", now);
  assert.deepEqual([week[0], week.at(-1)], ["2026-11-10", "2026-11-16"]);
  assert.deepEqual([before[0], before.at(-1), before.length], ["2026-11-03", "2026-11-09", 7]);
  assert.deepEqual(previousPeriodKeys("year", now), []);
  const year = periodKeys("year", now);
  assert.deepEqual([year[0], year.at(-1)], ["2026-01-01", "2026-11-16"]);
});

test("the day after the autumn clock change still compares with the right yesterday", () => {
  // Romania leaves summer time on 25 October 2026; that day has 25 hours.
  const now = new Date(2026, 9, 26, 0, 30, 0).getTime();
  assert.deepEqual(previousPeriodKeys("day", now), ["2026-10-25"]);
});

test("the comparison carries its label so the card can say what it is measured against", () => {
  assert.equal(comparePeriods(stats(HOUR), stats(HOUR), "Versus the same days last month").label, "Versus the same days last month");
  assert.equal(comparePeriods(stats(HOUR), stats(HOUR)).label, undefined);
});
