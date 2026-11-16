import assert from "node:assert/strict";
import test from "node:test";
import {
  FULLSCREEN_MAX_IDLE_SECONDS,
  isIdleSample,
  parseTrackerLine,
  sanitizeTrackerAppId,
  sanitizeTrackerLabel
} from "../src/main/tracker-line";

const excluded = (appId: string) => appId === "secret";
const parse = (line: string, idle = false) => parseTrackerLine(line, 1_800_000_000_000, idle, excluded);

test("a well-formed adapter line becomes a snapshot", () => {
  const snapshot = parse(JSON.stringify({ appId: "code", label: "Visual Studio Code", at: 1 }));
  assert.deepEqual(snapshot, {
    at: 1_800_000_000_000,
    appId: "code",
    label: "Visual Studio Code",
    idle: false,
    excluded: false,
    fullscreen: false
  });
});

test("the adapter clock is replaced by the moment the line arrives", () => {
  // A skewed or hostile timestamp in the line must never move recorded activity through time.
  const snapshot = parse(JSON.stringify({ appId: "code", label: "Code", at: 99_999 }));
  assert.equal(snapshot?.at, 1_800_000_000_000);
});

test("malformed lines are dropped, never thrown", () => {
  for (const line of ["", "not json", "[]", "null", JSON.stringify({ appId: 5, label: "x" }), JSON.stringify({ appId: "", label: "x" })]) {
    assert.equal(parse(line), undefined, line);
  }
});

test("ids are reduced to the store's accepted shape and the app itself is ignored", () => {
  assert.equal(sanitizeTrackerAppId("Code.EXE"), "code.exe");
  assert.equal(sanitizeTrackerAppId("../../etc/passwd"), "....etcpasswd");
  assert.equal(sanitizeTrackerAppId("a".repeat(200)).length, 64);
  assert.equal(sanitizeTrackerAppId("pc-wrapped"), "");
  assert.equal(sanitizeTrackerAppId(42), "");
  const snapshot = parse(JSON.stringify({ appId: "pc-wrapped", label: "PC Wrapped" }));
  assert.equal(snapshot, undefined);
});

test("labels lose control characters, newlines and unbounded length", () => {
  // \r and \n each become a space rather than being collapsed: labels are shown as-is.
  assert.equal(sanitizeTrackerLabel("Line\r\nbreak\u0007here"), "Line  break here");
  assert.equal(sanitizeTrackerLabel("   "), "");
  assert.equal(sanitizeTrackerLabel("x".repeat(200)).length, 80);
  assert.equal(sanitizeTrackerLabel(undefined, "code"), "code");
  // A line without a label still records activity: the executable id is the honest fallback.
  assert.equal(parse(JSON.stringify({ appId: "code", label: "" }))?.label, "code");
});

test("exclusion is resolved at parse time from the current settings", () => {
  assert.equal(parse(JSON.stringify({ appId: "secret", label: "Secret" }))?.excluded, true);
  assert.equal(parse(JSON.stringify({ appId: "code", label: "Code" }))?.excluded, false);
});

test("idle comes from the caller, not from the line", () => {
  assert.equal(parse(JSON.stringify({ appId: "code", label: "Code", idle: false }), true)?.idle, true);
});

test("the adapter's full-screen flag reaches the idle decision", () => {
  const line = JSON.stringify({ appId: "eldenring", label: "ELDEN RING", fullscreen: true });
  const seen: Array<[string, boolean]> = [];
  const snapshot = parseTrackerLine(
    line,
    1,
    (appId, fullscreen) => {
      seen.push([appId, fullscreen]);
      return false;
    },
    () => false
  );
  assert.deepEqual(seen, [["eldenring", true]]);
  assert.equal(snapshot?.fullscreen, true);
  assert.equal(parseTrackerLine(JSON.stringify({ appId: "x", fullscreen: "yes" }), 1, false, () => false)?.fullscreen, false);
});

test("a full-screen game or film stays active without input, within limits", () => {
  const base = { idleSeconds: 600, thresholdSeconds: 60, locked: false, countFullscreen: true, fullscreen: true, appId: "vlc" };
  assert.equal(isIdleSample(base), false, "a film with no input still counts");
  assert.equal(isIdleSample({ ...base, fullscreen: false }), true, "a windowed app without input is idle");
  assert.equal(isIdleSample({ ...base, countFullscreen: false }), true, "the user can turn it off");
  assert.equal(isIdleSample({ ...base, locked: true }), true, "nothing counts while locked");
  assert.equal(isIdleSample({ ...base, locked: true, idleSeconds: 0 }), true, "not even with input");
  assert.equal(isIdleSample({ ...base, appId: "lockapp" }), true, "the lock screen is never a film");
  assert.equal(isIdleSample({ ...base, idleSeconds: FULLSCREEN_MAX_IDLE_SECONDS }), true, "four hours without input is idle");
  assert.equal(isIdleSample({ ...base, fullscreen: false, idleSeconds: 10 }), false, "recent input is active");
});
