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
  idle: boolean,
  isExcluded: (appId: string) => boolean
): ParsedTrackerLine | undefined {
  try {
    const raw = JSON.parse(line) as { appId?: unknown; label?: unknown };
    const appId = sanitizeTrackerAppId(raw.appId);
    if (!appId) return undefined;
    return { at, appId, label: sanitizeTrackerLabel(raw.label, appId), idle, excluded: isExcluded(appId) };
  } catch {
    return undefined;
  }
}
