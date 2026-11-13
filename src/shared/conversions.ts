import { CONVERSION_TEMPLATES } from "./conversion-templates.generated.js";

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
