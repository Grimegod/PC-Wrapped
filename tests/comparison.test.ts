import assert from "node:assert/strict";
import test from "node:test";
import { comparePeriods } from "../src/shared/comparison";
import { comparisonLine } from "../src/main/card";
import { previousDayKeys } from "../src/shared/dates";
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
