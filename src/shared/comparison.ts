import type { RecapStats } from "./model";

/** How this period compares with the one before it, in words the card can print. */
export interface PeriodComparison {
  /** Signed share change, e.g. 0.037 for "+3.7 percent". */
  ratioChange: number;
  currentMs: number;
  previousMs: number;
  /** True when there is no earlier period to compare against. */
  isFirst: boolean;
  /** What the change is measured against, e.g. "Versus the same days last month". */
  label?: string;
}

export function comparePeriods(current: RecapStats, previous: RecapStats, label?: string): PeriodComparison {
  const currentMs = current.totalActiveMs;
  const previousMs = previous.totalActiveMs;
  return {
    currentMs,
    previousMs,
    ratioChange: previousMs > 0 ? (currentMs - previousMs) / previousMs : 0,
    isFirst: previousMs <= 0,
    ...(label ? { label } : {})
  };
}
