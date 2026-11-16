// Pure, Electron-free helpers for the activity adapter, so their behaviour can be tested without
// starting the app. main.ts imports these; nothing here touches Electron or the file system.

/** Normalise an executable id from the activity adapter into the id shape every store accepts. */
export function sanitizeTrackerAppId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64);
  return id === "pc-wrapped" || id === "pcwrapped" ? "" : id;
}

/** Normalise an app label from the adapter: no control characters, no newlines, bounded length. */
export function sanitizeTrackerLabel(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const label = value
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point.
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, 80);
  return label || fallback;
}

export interface ParsedTrackerLine {
  at: number;
  appId: string;
  label: string;
  idle: boolean;
  excluded: boolean;
  /** The foreground window covers its whole monitor (a game or a film), as the adapter reported it. */
  fullscreen: boolean;
}

/** Without keyboard or mouse input, a full-screen app still counts as active for at most this long. */
export const FULLSCREEN_MAX_IDLE_SECONDS = 4 * 60 * 60;

/** Windows' own full-screen surfaces that must never count as watching or playing something. */
const NEVER_ACTIVE_FULLSCREEN = new Set(["lockapp", "logonui", "scrnsave", "screensaverengine"]);

export interface IdleInputs {
  /** Seconds since the last keyboard or mouse input. */
  idleSeconds: number;
  /** The idle threshold for ordinary apps. */
  thresholdSeconds: number;
  /** The session is locked: nothing counts, full screen or not. */
  locked: boolean;
  /** The user's setting: count full-screen games and videos without input. */
  countFullscreen: boolean;
  fullscreen: boolean;
  appId: string;
}

/**
 * Whether one sample is idle.
 *
 * Keyboard and mouse input is the ordinary signal. A controller or a film produces none, so when
 * the user allows it a full-screen app stays active for up to four hours without input, except
 * for Windows' lock and sign-in screens and while the session is locked.
 */
export function isIdleSample(inputs: IdleInputs): boolean {
  if (inputs.locked) return true;
  if (inputs.idleSeconds < inputs.thresholdSeconds) return false;
  const watching =
    inputs.countFullscreen &&
    inputs.fullscreen &&
    !NEVER_ACTIVE_FULLSCREEN.has(inputs.appId) &&
    !inputs.appId.endsWith(".scr") &&
    inputs.idleSeconds < FULLSCREEN_MAX_IDLE_SECONDS;
  return !watching;
}

/**
 * Turn one activity-adapter line into a snapshot, or undefined when the line is malformed.
 *
 * The timestamp in the line is deliberately ignored: the moment the line reaches the app is the
 * only clock that counts, so a skewed or hostile adapter cannot move activity through time.
 */
export function parseTrackerLine(
  line: string,
  at: number,
  idle: boolean | ((appId: string, fullscreen: boolean) => boolean),
  isExcluded: (appId: string) => boolean
): ParsedTrackerLine | undefined {
  try {
    const raw = JSON.parse(line) as { appId?: unknown; label?: unknown; fullscreen?: unknown };
    const appId = sanitizeTrackerAppId(raw.appId);
    if (!appId) return undefined;
    const fullscreen = raw.fullscreen === true;
    return {
      at,
      appId,
      label: sanitizeTrackerLabel(raw.label, appId),
      idle: typeof idle === "function" ? idle(appId, fullscreen) : idle,
      excluded: isExcluded(appId),
      fullscreen
    };
  } catch {
    return undefined;
  }
}
