// Rules for the IPC boundary, kept free of Electron so they can be tested without starting the
// app. main.ts uses isTrustedSenderUrl through its window-bound wrapper.

/** The one local page the preload bridge is written for. */
export const RENDERER_PAGE_SUFFIX = "/dist/src/renderer/index.html";

/**
 * Whether a frame URL belongs to the app's own page.
 *
 * The app loads a single `file://` page and refuses navigation, so anything else reaching an IPC
 * handler is either a mistake or an attack: both are refused.
 */
export function isTrustedSenderUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.startsWith("file://")) return false;
  const path = url.split("?")[0].split("#")[0];
  return path.endsWith(RENDERER_PAGE_SUFFIX);
}
