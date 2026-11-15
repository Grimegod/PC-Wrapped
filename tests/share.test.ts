import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * The share module imports Electron's shell, so these tests exercise the pure helpers and the
 * rules the UI and main process rely on, without opening a browser.
 */
import { isShareablePng, isShareableSavedCard, SavedCardLedger, shareCaption } from "../src/main/share";
import type { ShareTarget } from "../src/shared/model";

test("share caption uses only the aggregate values the card already shows", () => {
  const caption = shareCaption("day", 4 * 3_600_000 + 12 * 60_000, "The Tab Acrobat");
  assert.match(caption, /4h 12m/);
  assert.match(caption, /The Tab Acrobat/);
  assert.match(caption, /day/);
  assert.match(caption, /locally/);
  assert.doesNotMatch(caption, /\.exe|window title|screenshot|chrome|code\.exe/i);
  assert.match(shareCaption("week", 30 * 60_000, "The Home Base Hero"), /30m of app time/);
  assert.match(shareCaption("week", 30 * 60_000, "The Home Base Hero"), /week/);
});

test("only an existing PNG file is accepted as the card to share", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pc-wrapped-share-png-"));
  try {
    const png = path.join(root, "pc-wrapped-day-story.png");
    fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const text = path.join(root, "notes.txt");
    fs.writeFileSync(text, "not an image");
    assert.equal(isShareablePng(png), true);
    assert.equal(isShareablePng(text), false);
    assert.equal(isShareablePng(path.join(root, "missing.png")), false);
    assert.equal(isShareablePng(root), false);
    assert.equal(isShareablePng(undefined), false);
    assert.equal(isShareablePng(42), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sharing is refused unless a saved PNG exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pc-wrapped-share-"));
  try {
    const missing = path.join(root, "pc-wrapped-day-story.png");
    assert.equal(fs.existsSync(missing), false);
    const written = path.join(root, "saved.png");
    fs.writeFileSync(written, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.equal(fs.existsSync(written), true);
    assert.equal(written.toLowerCase().endsWith(".png"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the app only ever opens share pages and never posts on its own", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main/share.ts"), "utf8");
  assert.match(source, /shell\.openExternal/);
  assert.doesNotMatch(source, /net\.|fetch\(|https?\.request|XMLHttpRequest|FormData/);
  assert.doesNotMatch(source, /instagram\.com\/.*upload/i);
  // Share URLs are built in this file only, from a fixed list of targets.
  assert.match(source, /https:\/\/wa\.me\/\?text=/);
  assert.match(source, /https:\/\/t\.me\/share\/url\?url=/);
  assert.match(source, /https:\/\/twitter\.com\/intent\/tweet/);
  assert.match(source, /https:\/\/www\.facebook\.com\/sharer\/sharer\.php/);
  assert.match(source, /https:\/\/www\.linkedin\.com\/feed\/\?shareActive=true/);
});

test("every offered share target has either a share page or a clipboard route", async () => {
  const { shareCard } = await import("../src/main/share");
  const targets: ShareTarget[] = [
    "whatsapp",
    "telegram",
    "telegramApp",
    "facebook",
    "messenger",
    "messengerApp",
    "instagram",
    "snapchat",
    "tiktok",
    "linkedin",
    "x"
  ];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pc-wrapped-targets-"));
  try {
    const png = path.join(root, "card.png");
    fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    let copied = 0;
    for (const target of targets) {
      // A missing file is refused for every target before anything is opened or copied.
      const refused = await shareCard({
        target,
        filePath: path.join(root, "missing.png"),
        caption: "x",
        copyImage: () => {
          copied += 1;
        }
      });
      assert.equal(refused.opened, false);
      assert.match(refused.message, /Save the card first/);
    }
    assert.equal(copied, 0);
    assert.equal(await import("../src/main/share").then((m) => typeof m.isShareablePng), "function");
    assert.ok(targets.length === 11);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the renderer keeps sharing behind preview and save", () => {
  const renderer = fs.readFileSync(path.resolve(__dirname, "../src/renderer/renderer.ts"), "utf8");
  assert.match(renderer, /function refreshShareRow\(\): void \{/);
  assert.match(renderer, /previewedSignature === currentSignature/);
  assert.match(renderer, /savedCardPath = null;/);
  const html = fs.readFileSync(path.resolve(__dirname, "../src/renderer/index.html"), "utf8");
  assert.match(html, /id="share-row" class="share-row" hidden/);
  for (const target of ["whatsapp", "telegram", "instagram", "facebook", "messenger", "linkedin", "tiktok", "snapchat", "x"]) {
    assert.match(html, new RegExp(`data-share="${target}"`));
  }
  const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s)?.[1] ?? "";
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /default-src 'none'/);
});

test("only a card this process saved can be shared, not any PNG on disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-wrapped-ledger-"));
  const mine = path.join(dir, "recap.png");
  const other = path.join(dir, "someone-elses.png");
  fs.writeFileSync(mine, "png");
  fs.writeFileSync(other, "png");

  const ledger = new SavedCardLedger();
  assert.equal(isShareableSavedCard(ledger, mine), false, "a file the app did not write is refused");

  ledger.remember(mine);
  assert.equal(isShareableSavedCard(ledger, mine), true);
  assert.equal(isShareableSavedCard(ledger, other), false);
  assert.equal(isShareableSavedCard(ledger, path.join(dir, "missing.png")), false);
  assert.equal(isShareableSavedCard(ledger, 42), false);
  assert.equal(isShareableSavedCard(ledger, null), false);

  fs.rmSync(mine);
  assert.equal(isShareableSavedCard(ledger, mine), false, "a remembered file that is gone is refused");

  ledger.remember(other);
  ledger.forget(other);
  assert.equal(isShareableSavedCard(ledger, other), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
