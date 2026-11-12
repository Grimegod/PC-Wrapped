import assert from "node:assert/strict";
import test from "node:test";
import { chooseArchetype } from "../src/shared/archetypes";
import type { RecapStats } from "../src/shared/model";

const stats = (overrides: Partial<RecapStats> = {}): RecapStats => ({
  totalActiveMs: 60 * 60_000,
  appChanges: 4,
  longestStreakMs: 10 * 60_000,
  topAppShare: 0.4,
  topAppLabel: "Browser",
  uniqueApps: 3,
  completedInterruptions: 0,
  averageReturnMs: 0,
  ...overrides
});

test("archetypes follow stable, mutually ordered aggregate rules", () => {
  assert.equal(chooseArchetype(stats({ appChanges: 18 })).id, "tab-acrobat");
  assert.equal(chooseArchetype(stats({ longestStreakMs: 45 * 60_000 })).id, "deep-diver");
  assert.equal(chooseArchetype(stats({ topAppShare: 0.56 })).id, "home-base");
  assert.equal(chooseArchetype(stats({ topAppShare: 0.2, uniqueApps: 8 })).id, "kaleidoscope");
  assert.equal(chooseArchetype(stats({ totalActiveMs: 90 * 60_000, appChanges: 2 })).id, "cruise-control");
  assert.equal(chooseArchetype(stats()).id, "time-tourist");
});
