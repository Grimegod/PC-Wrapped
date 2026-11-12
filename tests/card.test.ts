import assert from "node:assert/strict";
import test from "node:test";
import { emptyDay } from "../src/shared/aggregation";
import { buildCardData, renderCard } from "../src/main/card";

function pngSize(buffer: Buffer): { width: number; height: number } {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("card renderer works with zero tracked apps and produces a 1080 by 1920 PNG", () => {
  assert.equal(buildCardData(emptyDay()).archetype, undefined);
  assert.deepEqual(pngSize(renderCard(emptyDay(), "story", "day")), { width: 1080, height: 1920 });
});

test("square card is PNG at 1080 by 1080", () => {
  assert.deepEqual(pngSize(renderCard(emptyDay(), "square", "week")), { width: 1080, height: 1080 });
});

test("hidden app name is absent from card view data while its time and share stay in totals", () => {
  const day = emptyDay();
  day.apps["private-browser"] = { label: "Private Browser Name", activeMs: 90_000, longestStreakMs: 40_000, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 };
  day.apps.editor = { label: "Text Editor", activeMs: 30_000, longestStreakMs: 20_000, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 };
  const shownByDefault = buildCardData(day);
  assert.equal(shownByDefault.stats.topAppLabel, "Private Browser Name");
  const hidden = buildCardData(day, new Set(["private-browser"]));
  const serializedCardData = JSON.stringify(hidden);
  assert.equal(hidden.stats.topAppLabel, "Hidden app");
  assert.equal(hidden.stats.totalActiveMs, 120_000);
  assert.equal(hidden.stats.topAppShare, 0.75);
  assert.equal(hidden.stats.uniqueApps, 2);
  assert.doesNotMatch(serializedCardData, /private-browser|Private Browser Name/);
});
