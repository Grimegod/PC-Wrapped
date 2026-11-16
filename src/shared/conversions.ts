import { CONVERSION_TEMPLATES } from "./conversion-templates.generated.js";
import type { Translator } from "./i18n.js";

export interface ConversionTemplate {
  id: string;
  label: string;
  minutes: number;
  emoji: string;
  plural: string;
}

export const CONVERSIONS: ConversionTemplate[] = [...CONVERSION_TEMPLATES];

export function absurdConversion(minutes: number): string {
  if (minutes < 1) return "A tiny cameo. No conversion required.";
  const template =
    CONVERSIONS.filter((item) => minutes >= item.minutes).sort((a, b) => b.minutes - a.minutes)[0] ??
    [...CONVERSIONS].sort((a, b) => a.minutes - b.minutes)[0];
  const count = minutes / template.minutes;
  const rounded = count < 2 ? count.toFixed(1) : Math.round(count).toString();
  return `${template.emoji} About ${rounded} ${template.plural}`;
}

const UNIT_KEYS: Record<string, string> = {
  "short-flight": "unit.flights",
  film: "unit.films",
  "tv-season": "unit.seasons",
  "tea-break": "unit.teaBreaks"
};

/** The playful comparison in the reader's language, e.g. "🎬 About 3 feature films". */
export function conversionText(minutes: number, translator: Pick<Translator, "t" | "locale">): string {
  const { t, locale } = translator;
  if (minutes < 1) return t("conversion.tiny");
  const template =
    CONVERSIONS.filter((item) => minutes >= item.minutes).sort((a, b) => b.minutes - a.minutes)[0] ??
    [...CONVERSIONS].sort((a, b) => a.minutes - b.minutes)[0];
  const count = minutes / template.minutes;
  let format: Intl.NumberFormat;
  try {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: count < 2 ? 1 : 0, minimumFractionDigits: count < 2 ? 1 : 0 });
  } catch {
    format = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  }
  return t("conversion.about", { emoji: template.emoji, count: format.format(count), unit: t(UNIT_KEYS[template.id] ?? template.plural) });
}
