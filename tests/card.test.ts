import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import test from "node:test";
import { emptyDay } from "../src/shared/aggregation";
import { ARCHETYPES } from "../src/shared/archetypes";
import { absurdConversion } from "../src/shared/conversions";
import { buildCardData, fitCardText, measureCardText, renderCard, splitEmojiRuns, topAppRows } from "../src/main/card";

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
  day.apps["private-browser"] = {
    label: "Private Browser Name",
    activeMs: 90_000,
    longestStreakMs: 40_000,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  day.apps.editor = {
    label: "Text Editor",
    activeMs: 30_000,
    longestStreakMs: 20_000,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
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

test("the cast rows keep shares and never reveal a hidden app name", () => {
  const day = emptyDay();
  day.apps.editor = {
    label: "Text Editor",
    activeMs: 300_000,
    longestStreakMs: 0,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  day.apps["private-browser"] = {
    label: "Private Browser Name",
    activeMs: 100_000,
    longestStreakMs: 0,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  day.apps.terminal = {
    label: "Terminal",
    activeMs: 50_000,
    longestStreakMs: 0,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  day.apps.mail = {
    label: "Mail",
    activeMs: 10_000,
    longestStreakMs: 0,
    interruptionsStarted: 0,
    interruptionsCompleted: 0,
    returnTimeTotalMs: 0
  };
  const rows = topAppRows(day, new Set(["private-browser"]), 3);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Text Editor", "Hidden app", "Terminal"]
  );
  assert.deepEqual(
    rows.map((row) => Math.round(row.share * 100)),
    [65, 22, 11]
  );
  assert.doesNotMatch(JSON.stringify(rows), /Private Browser Name|private-browser/);
  assert.deepEqual(topAppRows(emptyDay(), new Set(), 3), []);
});

test("emoji runs are split so they can be drawn with a face that has glyphs for them", () => {
  assert.deepEqual(
    splitEmojiRuns("🤸  The Tab Acrobat").map((run) => run.emoji),
    [true, false]
  );
  assert.deepEqual(
    splitEmojiRuns("About 1.2 seasons").map((run) => run.emoji),
    [false]
  );
  assert.deepEqual(
    splitEmojiRuns("↩ return").map((run) => run.emoji),
    [true, false]
  );
});

test("long app names are shortened to fit instead of being cut at a fixed width", () => {
  const ctx = createCanvas(1080, 1080).getContext("2d");
  const long = "A Very Long Application Name For Testing Overflow";
  const fitted = fitCardText(ctx, long, 300, 27, 700);
  assert.notEqual(fitted, long);
  assert.ok(fitted.endsWith("…"));
  assert.ok(measureCardText(ctx, fitted, 27, 700) <= 300);
  assert.equal(fitCardText(ctx, "Slack", 300, 27, 700), "Slack");
  const emoji = fitCardText(ctx, "🤸 The Tab Acrobat With A Very Long Name", 120, 38, 700);
  assert.ok(measureCardText(ctx, emoji, 38, 700) <= 120);
});

test("every archetype renders on both card shapes with a legible name", () => {
  for (const archetype of ARCHETYPES) {
    const day = emptyDay();
    day.apps.editor = {
      label: archetype.name,
      activeMs: 120 * 60_000,
      longestStreakMs: 90 * 60_000,
      interruptionsStarted: 1,
      interruptionsCompleted: 1,
      returnTimeTotalMs: 60_000
    };
    const name = `${archetype.emoji}  ${archetype.name}`;
    assert.deepEqual(splitEmojiRuns(name)[0], { text: archetype.emoji, emoji: true });
    assert.ok(archetype.line.length > 0);
    assert.deepEqual(pngSize(renderCard(day, "story", "day")), { width: 1080, height: 1920 });
    assert.deepEqual(pngSize(renderCard(day, "square", "week")), { width: 1080, height: 1080 });
  }
  assert.match(absurdConversion(120), /film/);
});
