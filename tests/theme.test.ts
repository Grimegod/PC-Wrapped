import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const css = readFileSync(path.resolve(__dirname, "../src/renderer/style.css"), "utf8");

function lastRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  assert.ok(matches.length > 0, `missing CSS rule: ${selector}`);
  return matches[matches.length - 1][1];
}

function colorFrom(rule: string, property: string): string {
  const match = rule.match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing ${property} color`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("inactive recap period remains readable on the cocoa switch", () => {
  const text = colorFrom(lastRule(".period-button"), "color");
  const surface = colorFrom(lastRule(".period-switch"), "background");
  assert.ok(contrastRatio(text, surface) >= 4.5);
});

test("selected recap period remains readable and keyboard focus is visible", () => {
  const selected = lastRule(".period-button.active");
  assert.ok(contrastRatio(colorFrom(selected, "color"), colorFrom(selected, "background")) >= 4.5);
  assert.match(lastRule(".period-button:focus-visible"), /outline:2px solid var\(--mint\)/);
});
