export const APP_NAME = "PC Wrapped";
/** Windows application identity. The package `appId`, the MSIX manifest and the AppUserModelId all derive from this. */
export const APP_ID = "com.grimegod.pcwrapped";
export const RETENTION_DAYS = 365;
export const SAMPLE_INTERVAL_MS = 2_000;
export const MAX_SAMPLE_GAP_MS = 10_000;
/** The most time one sample may ever credit, so a stalled adapter or a clock change cannot inflate app time. */
export const MAX_CREDITED_INTERVAL_MS = SAMPLE_INTERVAL_MS * 2;
export const IDLE_THRESHOLD_SECONDS = 60;
export const MIN_INTERRUPTION_STREAK_MS = 10 * 60_000;
export const RETURN_STABILITY_MS = 30_000;
export const MAX_PENDING_INTERRUPTS = 64;
export const STORY_CARD = { width: 1080, height: 1920 } as const;
export const SQUARE_CARD = { width: 1080, height: 1080 } as const;

export type CardFormat = "story" | "square";
