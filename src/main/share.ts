import { shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { RecapPeriod } from "../shared/constants";
import type { ShareOutcome, ShareTarget } from "../shared/model";

export interface ShareOptions {
  target: ShareTarget;
  filePath: string;
  /** A pre-written caption the user can edit before posting. */
  caption: string;
  /** Called with the file when the target needs a clipboard hand-off instead of a share page. */
  copyImage?: (filePath: string) => void;
}

interface ShareRoute {
  /** Opened in the user's browser. Omitted for targets with no usable web share page. */
  url?: (caption: string) => string;
  /** What the app does when the page is open, so the user knows the next step. */
  afterOpen: string;
  /** What the app does when there is no share page: put the PNG on the clipboard. */
  clipboard: string;
}

/**
 * One entry per offered target. Only the first five have a public web share page that accepts a
 * pre-written caption; the rest have none that works without an account, so the card goes to the
 * clipboard and the app is opened for the user to paste into.
 */
const SHARE_ROUTES: Record<ShareTarget, ShareRoute> = {
  whatsapp: {
    url: (caption) => `https://wa.me/?text=${encodeURIComponent(caption)}`,
    afterOpen: "WhatsApp opened with your caption ready. Attach the saved PNG to send it.",
    clipboard: ""
  },
  telegram: {
    // Telegram's page needs a link to share; the caption carries the card's own wording.
    url: (caption) => `https://t.me/share/url?url=${encodeURIComponent(caption)}`,
    afterOpen: "Telegram opened with your caption ready. Attach the saved PNG to send it.",
    clipboard: ""
  },
  facebook: {
    url: () => "https://www.facebook.com/sharer/sharer.php",
    afterOpen: "Facebook opened in your browser. Add the saved PNG with its photo picker.",
    clipboard: ""
  },
  messenger: {
    url: () => "https://www.facebook.com/dialog/send",
    afterOpen: "Messenger opened in your browser. Add the saved PNG with its photo picker.",
    clipboard: ""
  },
  x: {
    url: (caption) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`,
    afterOpen: "X opened with your caption ready. Attach the saved PNG to post it.",
    clipboard: ""
  },
  linkedin: {
    url: () => "https://www.linkedin.com/feed/?shareActive=true",
    afterOpen: "LinkedIn opened in your browser. Add the saved PNG to your post.",
    clipboard: ""
  },
  instagram: {
    afterOpen: "",
    clipboard: "Card copied. Open Instagram, then paste it into a story or post."
  },
  snapchat: {
    afterOpen: "",
    clipboard: "Card copied. Open Snapchat and paste it into a Snap."
  },
  tiktok: {
    afterOpen: "",
    clipboard: "Card copied. Open TikTok and add it as a photo post."
  },
  telegramApp: {
    afterOpen: "",
    clipboard: "Card copied. Open Telegram and paste it into a chat."
  },
  messengerApp: {
    afterOpen: "",
    clipboard: "Card copied. Open Messenger and paste it into a chat."
  }
};

/** Whether a path is a PNG this app could have written; anything else is never handed to a share route. */
export function isShareablePng(filePath: unknown): filePath is string {
  return typeof filePath === "string" && /[\\/][^\\/]+\.png$/i.test(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Hand a saved card to the operating system's share route.
 *
 * The app itself never uploads anything: it opens a share page in the user's browser, or puts the
 * PNG on the clipboard for apps that have no share page. The image only travels where the user
 * chooses to paste or attach it.
 */
export async function shareCard(options: ShareOptions): Promise<ShareOutcome> {
  const { target, filePath, caption } = options;
  if (!fs.existsSync(filePath)) {
    return { opened: false, message: "Save the card first, then share the saved PNG." };
  }
  const route = SHARE_ROUTES[target];

  if (!route.url) {
    if (!options.copyImage) {
      return { opened: false, message: `${route.clipboard} The clipboard is unavailable here.`, filePath };
    }
    try {
      options.copyImage(filePath);
    } catch (error) {
      return { opened: false, message: error instanceof Error ? error.message : "The card could not be copied.", filePath };
    }
    return { opened: false, message: `${route.clipboard} The saved file is ${path.basename(filePath)}.`, filePath };
  }

  try {
    await shell.openExternal(route.url(caption));
  } catch (error) {
    return { opened: false, message: error instanceof Error ? error.message : "The share page could not be opened.", filePath };
  }
  return { opened: true, message: route.afterOpen, filePath };
}

/** How a period is named in the card heading and in the share caption. */
export const PERIOD_WORD: Record<RecapPeriod, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year"
};

/** The caption offered with a share page. Aggregate values only, matching what the card shows. */
export function shareCaption(period: RecapPeriod, totalActiveMs: number, archetypeName: string): string {
  const minutes = Math.max(0, Math.round(totalActiveMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const duration = hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  return `My ${PERIOD_WORD[period]} on the desktop: ${duration} of app time and I'm "${archetypeName}". Made with PC Wrapped, locally.`;
}

/**
 * The card files this process wrote, so `card:share` can hand out only a PNG the app itself saved.
 *
 * Paths are compared after `path.resolve` and lowercased on Windows, where the same file can be
 * spelled two ways.
 */
export class SavedCardLedger {
  private readonly paths = new Set<string>();

  private key(filePath: string): string {
    const resolved = path.resolve(filePath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  remember(filePath: string): void {
    this.paths.add(this.key(filePath));
  }

  forget(filePath: string): void {
    this.paths.delete(this.key(filePath));
  }

  has(filePath: unknown): filePath is string {
    return typeof filePath === "string" && this.paths.has(this.key(filePath));
  }
}

/** Whether a path is both in the ledger and a PNG file that still exists. */
export function isShareableSavedCard(ledger: SavedCardLedger, filePath: unknown): filePath is string {
  return ledger.has(filePath) && isShareablePng(filePath);
}
