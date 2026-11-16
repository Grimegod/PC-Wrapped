// Loads the translation catalogs from assets/locales. Main-process only (it reads files).
import fs from "node:fs";
import path from "node:path";
import { createTranslator, DEFAULT_LOCALE, LANGUAGES, type Messages, type Translator } from "../shared/i18n";

/** The catalogs folder: next to the sources in development and tests, inside the app when built. */
export function localesDir(): string {
  const candidates = [path.join(__dirname, "..", "..", "assets", "locales"), path.join(__dirname, "..", "..", "..", "assets", "locales")];
  return candidates.find((dir) => fs.existsSync(path.join(dir, `${DEFAULT_LOCALE}.json`))) ?? candidates[0];
}

const cache = new Map<string, Messages>();

/** One catalog, or an empty one if it is missing or unreadable (English then fills every gap). */
export function loadMessages(code: string, dir = localesDir()): Messages {
  const key = `${dir}|${code}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let messages: Messages = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      messages = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as Messages;
    }
  } catch {
    /* A missing catalog falls back to English. */
  }
  cache.set(key, messages);
  return messages;
}

/** The catalog codes that exist on disk, in menu order. */
export function availableLocales(dir = localesDir()): string[] {
  return LANGUAGES.map((language) => language.code).filter((code) => fs.existsSync(path.join(dir, `${code}.json`)));
}

export function translatorFor(code: string, dir = localesDir()): Translator {
  return createTranslator(code, loadMessages(code, dir), loadMessages(DEFAULT_LOCALE, dir));
}

let english: Translator | undefined;
/** English, for callers (and tests) that do not pass a translator. */
export function englishTranslator(): Translator {
  english ??= translatorFor(DEFAULT_LOCALE);
  return english;
}
