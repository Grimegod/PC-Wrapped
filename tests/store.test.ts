import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalStore } from "../src/main/store";

/**
 * The store is the one place user data can be lost, so its failure paths matter more than its
 * happy path: a corrupt file must never be overwritten, and a failed write must not leave a
 * half-written history behind.
 */
/** A day inside the retention window, so saving does not prune the fixture away. */
function recentDay(): string {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function storeInTempDir(): { store: LocalStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-wrapped-store-"));
  const store = new LocalStore(dir);
  store.load();
  return { store, dir };
}

test("a fresh install starts with empty history and default settings", () => {
  const { store, dir } = storeInTempDir();
  assert.deepEqual(store.history, {});
  assert.equal(store.historyReadOnlyReason, "");
  assert.equal(store.settings.startAtLogin, false);
  assert.deepEqual(store.settings.excludedApps, {});
  fs.rmSync(dir, { recursive: true, force: true });
});

test("history survives a save and a reload", () => {
  const { store, dir } = storeInTempDir();
  store.history[recentDay()] = {
    appChanges: 3,
    apps: {
      code: {
        label: "Code",
        activeMs: 60_000,
        longestStreakMs: 0,
        interruptionsStarted: 0,
        interruptionsCompleted: 0,
        returnTimeTotalMs: 0
      }
    },
    transitions: {}
  };
  store.saveHistory();
  const reloaded = new LocalStore(dir);
  reloaded.load();
  assert.equal(reloaded.history[recentDay()].apps.code.activeMs, 60_000);
  assert.equal(reloaded.history[recentDay()].appChanges, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a corrupt history file is reported and never overwritten", () => {
  const { dir } = storeInTempDir();
  const file = path.join(dir, "daily-aggregates.json");
  fs.writeFileSync(file, "{ this is not json");
  const store = new LocalStore(dir);
  store.load();
  assert.notEqual(store.historyReadOnlyReason, "", "a corrupt file must make history read-only");
  store.history[recentDay()] = { appChanges: 1, apps: {}, transitions: {} };
  assert.throws(() => store.saveHistory(), /preserved|read/, "saving refuses rather than clobbering the file");
  assert.equal(fs.readFileSync(file, "utf8"), "{ this is not json", "the unreadable file is left untouched");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a history file with the wrong shape is treated as unreadable, not merged", () => {
  const { dir } = storeInTempDir();
  const file = path.join(dir, "daily-aggregates.json");
  fs.writeFileSync(file, JSON.stringify({ [recentDay()]: { appChanges: "many", apps: [] } }));
  const store = new LocalStore(dir);
  store.load();
  assert.notEqual(store.historyReadOnlyReason, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("deleting history clears the file and starts clean", () => {
  const { store, dir } = storeInTempDir();
  store.history[recentDay()] = { appChanges: 1, apps: {}, transitions: {} };
  store.saveHistory();
  store.deleteAllHistory();
  assert.deepEqual(store.history, {});
  const reopened = new LocalStore(dir);
  reopened.load();
  assert.deepEqual(reopened.history, {});
  fs.rmSync(dir, { recursive: true, force: true });
});

test("settings round-trip and reject ids the store cannot accept", () => {
  const { store, dir } = storeInTempDir();
  store.settings.startAtLogin = true;
  store.settings.startupPrompted = true;
  store.settings.excludedApps["steam.exe"] = "Steam";
  store.settings.hiddenApps["steam.exe"] = "Steam";
  store.saveSettings();

  const reloaded = new LocalStore(dir);
  reloaded.load();
  assert.equal(reloaded.settings.startAtLogin, true);
  assert.equal(reloaded.settings.startupPrompted, true);
  assert.equal(reloaded.settings.excludedApps["steam.exe"], "Steam");
  assert.equal(reloaded.settings.hiddenApps["steam.exe"], "Steam");

  // Ids that do not match the accepted shape, and labels with control characters, are dropped
  // or cleaned on load rather than trusted.
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ excludedApps: { "../escape": "x", "ok.exe": "Line\nbreak\u0007" } }));
  const cleaned = new LocalStore(dir);
  cleaned.load();
  assert.deepEqual(Object.keys(cleaned.settings.excludedApps), ["ok.exe"]);
  assert.equal(cleaned.settings.excludedApps["ok.exe"], "Line break");
  fs.rmSync(dir, { recursive: true, force: true });
});
