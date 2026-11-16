// Languages, locale matching and message formatting. Pure and Electron-free: the main process
// loads the catalogs from assets/locales and sends the chosen one to the renderer.

export type Messages = Record<string, string>;

export interface LanguageInfo {
  /** Catalog code: the file name in assets/locales without .json. */
  code: string;
  /** The language's name in itself, for the language menu. */
  nativeName: string;
  /** Text direction. */
  dir: "ltr" | "rtl";
}

/**
 * Every full Windows display language. Regional variants that Windows offers separately (English
 * UK, French Canada, Spanish Mexico) use their base catalog; Windows' partial language packs always
 * list a base language from this set after themselves, so automatic matching still finds one.
 */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "ar", nativeName: "العربية", dir: "rtl" },
  { code: "bg", nativeName: "Български", dir: "ltr" },
  { code: "cs", nativeName: "Čeština", dir: "ltr" },
  { code: "da", nativeName: "Dansk", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", dir: "ltr" },
  { code: "el", nativeName: "Ελληνικά", dir: "ltr" },
  { code: "en", nativeName: "English", dir: "ltr" },
  { code: "es", nativeName: "Español", dir: "ltr" },
  { code: "et", nativeName: "Eesti", dir: "ltr" },
  { code: "fi", nativeName: "Suomi", dir: "ltr" },
  { code: "fr", nativeName: "Français", dir: "ltr" },
  { code: "he", nativeName: "עברית", dir: "rtl" },
  { code: "hr", nativeName: "Hrvatski", dir: "ltr" },
  { code: "hu", nativeName: "Magyar", dir: "ltr" },
  { code: "it", nativeName: "Italiano", dir: "ltr" },
  { code: "ja", nativeName: "日本語", dir: "ltr" },
  { code: "ko", nativeName: "한국어", dir: "ltr" },
  { code: "lt", nativeName: "Lietuvių", dir: "ltr" },
  { code: "lv", nativeName: "Latviešu", dir: "ltr" },
  { code: "nb", nativeName: "Norsk bokmål", dir: "ltr" },
  { code: "nl", nativeName: "Nederlands", dir: "ltr" },
  { code: "pl", nativeName: "Polski", dir: "ltr" },
  { code: "pt-BR", nativeName: "Português (Brasil)", dir: "ltr" },
  { code: "pt-PT", nativeName: "Português (Portugal)", dir: "ltr" },
  { code: "ro", nativeName: "Română", dir: "ltr" },
  { code: "ru", nativeName: "Русский", dir: "ltr" },
  { code: "sk", nativeName: "Slovenčina", dir: "ltr" },
  { code: "sl", nativeName: "Slovenščina", dir: "ltr" },
  { code: "sr-Latn", nativeName: "Srpski (latinica)", dir: "ltr" },
  { code: "sv", nativeName: "Svenska", dir: "ltr" },
  { code: "th", nativeName: "ไทย", dir: "ltr" },
  { code: "tr", nativeName: "Türkçe", dir: "ltr" },
  { code: "uk", nativeName: "Українська", dir: "ltr" },
  { code: "zh-Hans", nativeName: "简体中文", dir: "ltr" },
  { code: "zh-Hant", nativeName: "繁體中文", dir: "ltr" }
];

export const DEFAULT_LOCALE = "en";

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES.find((language) => language.code === DEFAULT_LOCALE)!;
}

/** Map a Windows / BCP 47 tag onto the catalog that should serve it, before checking availability. */
function candidatesFor(tag: string): string[] {
  const parts = tag.replace(/_/g, "-").split("-").filter(Boolean);
  if (!parts.length) return [];
  const language = parts[0].toLowerCase();
  const rest = parts.slice(1).map((part) => part.toLowerCase());
  const region = rest.find((part) => part.length === 2 || /^\d{3}$/.test(part));
  const script = rest.find((part) => part.length === 4);
  const out: string[] = [];
  if (language === "zh") {
    const traditional = script === "hant" || (!script && (region === "tw" || region === "hk" || region === "mo"));
    out.push(traditional ? "zh-Hant" : "zh-Hans");
  } else if (language === "pt") {
    out.push(region === "br" || !region ? "pt-BR" : "pt-PT");
  } else if (language === "sr" || language === "bs") {
    // Bosnian and Serbian readers both read Serbian Latin; Cyrillic Serbian falls back to it too.
    out.push("sr-Latn");
  } else if (language === "no" || language === "nn" || language === "nb") {
    out.push("nb");
  } else if (language === "iw") {
    out.push("he");
  } else {
    out.push(language);
  }
  return out;
}

/**
 * Choose the catalog for a list of preferred languages, most preferred first (as Windows reports
 * them). The first language with a catalog wins; English when none has one.
 */
export function pickLocale(preferred: readonly string[], available: readonly string[]): string {
  const byLower = new Map(available.map((code) => [code.toLowerCase(), code]));
  for (const tag of preferred) {
    if (typeof tag !== "string") continue;
    for (const candidate of candidatesFor(tag)) {
      const hit = byLower.get(candidate.toLowerCase());
      if (hit) return hit;
    }
  }
  return byLower.get(DEFAULT_LOCALE) ?? available[0] ?? DEFAULT_LOCALE;
}

/** Replace {name} placeholders. Unknown placeholders are left as they are. */
export function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

/** The placeholder names a message uses, for checking translations. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => match[1]).sort();
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface Translator {
  locale: string;
  dir: "ltr" | "rtl";
  t: Translate;
  /** "6h 54m" in the locale's own units. */
  duration: (ms: number) => string;
  /** A whole number with the locale's grouping. */
  number: (value: number) => string;
}

/** A translator that falls back to English for any key the chosen catalog lacks, then to the key. */
export function createTranslator(locale: string, messages: Messages, fallback: Messages = {}): Translator {
  const t: Translate = (key, params) => interpolate(messages[key] ?? fallback[key] ?? key, params);
  let numberFormat: Intl.NumberFormat;
  try {
    numberFormat = new Intl.NumberFormat(locale);
  } catch {
    numberFormat = new Intl.NumberFormat("en");
  }
  const number = (value: number): string => numberFormat.format(value);
  return {
    locale,
    dir: languageInfo(locale).dir,
    t,
    number,
    duration: (ms) => {
      const minutes = Math.max(0, Math.round(ms / 60_000));
      const hours = Math.floor(minutes / 60);
      return hours ? t("duration.hm", { h: number(hours), m: minutes % 60 }) : t("duration.m", { m: minutes });
    }
  };
}
