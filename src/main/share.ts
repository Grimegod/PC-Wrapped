import { shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { RecapPeriod } from "../shared/constants";
import type { Translator } from "../shared/i18n";
import type { ShareOutcome, ShareTarget } from "../shared/model";
import { englishTranslator } from "./locales";

export interface ShareOptions {
  target: ShareTarget;
  filePath: string;
  /** A pre-written caption the user can edit before posting. */
  caption: string;
  /** Called with the file when the target needs a clipboard hand-off instead of a share page. */
  copyImage?: (filePath: string) => void | Promise<void>;
  /** The language the messages are written in; English when omitted. */
  translator?: Translator;
}

interface ShareRoute {
  /** The service's own name, shown in messages; never translated. */
  name: string;
  /** Opened in the user's browser. Omitted for targets with no usable web share page. */
  url?: (caption: string) => string;
  /** Whether the opened page receives the caption. */
  carriesCaption?: boolean;
  /** For clipboard targets: the site opened right after the card is copied, ready for Ctrl+V. */
  openAfterCopy?: string;
}

/**
 * One entry per offered target. WhatsApp, Telegram, X and LinkedIn have a public web share page; the
 * rest have none that works without an account or an app id (Facebook's sharer needs a public link
 * and Messenger's send dialog an app id), so the card goes to the clipboard, the site opens, and the user pastes it.
 */
const SHARE_ROUTES: Record<ShareTarget, ShareRoute> = {
  whatsapp: { name: "WhatsApp", url: (caption) => `https://wa.me/?text=${encodeURIComponent(caption)}`, carriesCaption: true },
  // Telegram's page needs a link to share; the caption carries the card's own wording.
  telegram: { name: "Telegram", url: (caption) => `https://t.me/share/url?url=${encodeURIComponent(caption)}`, carriesCaption: true },
  x: { name: "X", url: (caption) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`, carriesCaption: true },
  linkedin: { name: "LinkedIn", url: () => "https://www.linkedin.com/feed/?shareActive=true" },
  facebook: { name: "Facebook", openAfterCopy: "https://www.facebook.com/" },
  messenger: { name: "Messenger", openAfterCopy: "https://www.messenger.com/" },
  messengerApp: { name: "Messenger", openAfterCopy: "https://www.messenger.com/" },
  telegramApp: { name: "Telegram", openAfterCopy: "https://web.telegram.org/" },
  instagram: { name: "Instagram", openAfterCopy: "https://www.instagram.com/" },
  snapchat: { name: "Snapchat", openAfterCopy: "https://www.snapchat.com/web" },
  tiktok: { name: "TikTok", openAfterCopy: "https://www.tiktok.com/upload" }
};

/** Whether a target hands the card over through the clipboard (and then opens its site) rather than a share page. */
export function usesClipboard(target: ShareTarget): boolean {
  return !SHARE_ROUTES[target].url;
}

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
  const { t } = options.translator ?? englishTranslator();
  if (!fs.existsSync(filePath)) {
    return { opened: false, message: t("share.saveFirst") };
  }
  const route = SHARE_ROUTES[target];

  if (!route.url) {
    const copied = t("share.copied", { target: route.name });
    if (!options.copyImage) {
      return { opened: false, message: `${copied} ${t("share.clipboardUnavailable")}`, filePath };
    }
    try {
      await options.copyImage(filePath);
    } catch (error) {
      return { opened: false, message: error instanceof Error ? error.message : t("share.copyFailed"), filePath };
    }
    if (route.openAfterCopy) {
      // The card is already on the clipboard; open the platform so the user only has to paste.
      try {
        await shell.openExternal(route.openAfterCopy);
        return { opened: true, message: t("share.copiedOpened", { target: route.name }), filePath };
      } catch {
        /* Fall through: the copy worked even if the browser did not open. */
      }
    }
    return { opened: false, message: `${copied} ${t("share.savedFile", { file: path.basename(filePath) })}`, filePath };
  }

  try {
    await shell.openExternal(route.url(caption));
  } catch (error) {
    return { opened: false, message: error instanceof Error ? error.message : t("share.openFailed"), filePath };
  }
  return { opened: true, message: t(route.carriesCaption ? "share.opened" : "share.openedNoCaption", { target: route.name }), filePath };
}

/** The caption offered with a share page. Aggregate values only, matching what the card shows. */
export function shareCaption(
  period: RecapPeriod,
  totalActiveMs: number,
  archetypeName: string,
  translator: Translator = englishTranslator()
): string {
  return translator.t("share.caption", {
    period: translator.t(`captionPeriod.${period}`),
    duration: translator.duration(totalActiveMs),
    archetype: archetypeName
  });
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
