import assert from "node:assert/strict";
import test from "node:test";
import { isCardFormat, renderCard } from "../src/main/card";
import { isTrustedSenderUrl } from "../src/main/ipc-guard";
import type { DayAggregate } from "../src/shared/model";

const emptyDay: DayAggregate = { appChanges: 0, apps: {}, transitions: {} };

test("card formats are validated at the boundary", () => {
  assert.equal(isCardFormat("story"), true);
  assert.equal(isCardFormat("square"), true);
  for (const value of ["STORY", "", null, undefined, 42, {}, ["story"]]) assert.equal(isCardFormat(value), false);
});

test("a day with no tracked time renders a quiet card rather than zeroed metrics", () => {
  for (const format of ["story", "square"] as const) {
    const png = renderCard(emptyDay, format, "day");
    assert.ok(png.length > 10_000, `${format} card renders`);
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  }
});

test("a day with a single zero-length app also renders the quiet card", () => {
  const day: DayAggregate = {
    appChanges: 0,
    apps: {
      code: { label: "Code", activeMs: 0, longestStreakMs: 0, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 }
    },
    transitions: {}
  };
  assert.ok(renderCard(day, "square", "week").length > 10_000);
});

test("IPC is refused for anything that is not this app's own page", () => {
  const page = "file:///C:/Program%20Files/PC%20Wrapped/resources/app.asar/dist/src/renderer/index.html";

  assert.equal(isTrustedSenderUrl(page), true, "the app's own page is trusted");
  assert.equal(isTrustedSenderUrl(`${page}?x=1`), true, "query strings do not change the page");
  assert.equal(isTrustedSenderUrl("https://example.com/dist/src/renderer/index.html"), false, "a remote page is refused");
  assert.equal(isTrustedSenderUrl("file:///C:/tmp/evil/index.html"), false, "a different local file is refused");
  assert.equal(isTrustedSenderUrl("file:///C:/x/dist/src/renderer/index.html.evil"), false, "a look-alike path is refused");
  assert.equal(isTrustedSenderUrl("about:blank"), false, "a blank frame is refused");
  assert.equal(isTrustedSenderUrl(undefined), false, "a missing url is refused");
  assert.equal(isTrustedSenderUrl(null), false, "a null url is refused");
});
