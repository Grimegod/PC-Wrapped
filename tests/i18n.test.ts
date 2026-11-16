import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createTranslator, interpolate, LANGUAGES, pickLocale, placeholders } from "../src/shared/i18n";

const dir = path.join(__dirname, "..", "assets", "locales");
const read = (code: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8")) as Record<string, string>;
const english = read("en");
const codes = LANGUAGES.map((language) => language.code);

test("Windows language tags pick the right catalog, most preferred first", () => {
  const all = codes;
  assert.equal(pickLocale(["ro-RO", "en-US"], all), "ro");
  assert.equal(pickLocale(["de-AT"], all), "de");
  assert.equal(pickLocale(["en-GB"], all), "en");
  assert.equal(pickLocale(["fr-CA"], all), "fr");
  assert.equal(pickLocale(["es-MX"], all), "es");
  assert.equal(pickLocale(["pt-BR"], all), "pt-BR");
  assert.equal(pickLocale(["pt-PT"], all), "pt-PT");
  assert.equal(pickLocale(["zh-CN"], all), "zh-Hans");
  assert.equal(pickLocale(["zh-TW"], all), "zh-Hant");
  assert.equal(pickLocale(["zh-Hant-HK"], all), "zh-Hant");
  assert.equal(pickLocale(["sr-Latn-RS"], all), "sr-Latn");
  assert.equal(pickLocale(["nn-NO"], all), "nb");
  assert.equal(pickLocale(["ca-ES", "es-ES"], all), "es", "a partial language pack falls back to its base language");
  assert.equal(pickLocale(["xx-YY"], all), "en", "an unknown language falls back to English");
  assert.equal(pickLocale([], all), "en");
  assert.equal(pickLocale(["ro-RO"], ["en"]), "en", "a missing catalog falls back to English");
});

test("every Windows display language has a complete catalog", () => {
  for (const code of codes) assert.ok(fs.existsSync(path.join(dir, `${code}.json`)), `missing catalog: ${code}`);
});

test("every catalog has exactly the English keys, no empty text and the same placeholders", () => {
  const keys = Object.keys(english).sort();
  for (const code of codes) {
    const catalog = read(code);
    assert.deepEqual(Object.keys(catalog).sort(), keys, `${code}: keys differ from English`);
    for (const key of keys) {
      assert.equal(typeof catalog[key], "string", `${code}.${key}`);
      assert.ok(catalog[key].trim().length > 0, `${code}.${key} is empty`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(english[key]), `${code}.${key}: placeholders differ`);
    }
  }
});

test("messages fill placeholders and fall back to English, then to the key", () => {
  assert.equal(interpolate("{a} and {b}", { a: 1, b: "two" }), "1 and two");
  assert.equal(interpolate("{missing}", {}), "{missing}");
  const translator = createTranslator("ro", { "apps.count": "Aplicații: {count}" }, english);
  assert.equal(translator.t("apps.count", { count: 3 }), "Aplicații: 3");
  assert.equal(translator.t("tray.quit"), "Quit");
  assert.equal(translator.t("no.such.key"), "no.such.key");
  assert.equal(translator.dir, "ltr");
  assert.equal(createTranslator("ar", {}).dir, "rtl");
});

test("durations use each language's own units", () => {
  const ro = createTranslator("ro", read("ro"), english);
  assert.equal(ro.duration(2 * 3_600_000 + 5 * 60_000), interpolate(read("ro")["duration.hm"], { h: 2, m: 5 }));
});
