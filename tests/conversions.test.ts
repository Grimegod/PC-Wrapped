import assert from "node:assert/strict";
import test from "node:test";
import { absurdConversion, CONVERSIONS } from "../src/shared/conversions";

test("absurd comparison templates are local and selected deterministically", () => {
  assert.ok(CONVERSIONS.some((item) => item.id === "short-flight"));
  assert.ok(CONVERSIONS.some((item) => item.id === "tv-season"));
  assert.match(absurdConversion(120), /film/);
  assert.match(absurdConversion(720), /seasons/);
  assert.match(absurdConversion(0), /tiny cameo/);
});
