import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalStore } from "../src/main/store";
import { ActivityAggregator } from "../src/shared/aggregation";

test("local store keeps only daily aggregates and supports deletion", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pc-wrapped-test-"));
  try {
    const store = new LocalStore(root);
    store.load();
    assert.equal(store.settings.startAtLogin, false);
    assert.equal(store.settings.startupPrompted, false);
    assert.deepEqual(store.settings.excludedApps, {});
    assert.deepEqual(store.settings.hiddenApps, {});
    store.history["2026-11-12"] = {
      appChanges: 3,
      apps: { editor: { label: "Text Editor", activeMs: 1_000, longestStreakMs: 800, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 } }
    };
    store.history["2024-01-01"] = {
      appChanges: 0,
      apps: { editor: { label: "Text Editor", activeMs: 2, longestStreakMs: 2, interruptionsStarted: 0, interruptionsCompleted: 0, returnTimeTotalMs: 0 } }
    };
    const historyReference = store.history;
    store.saveHistory(new Date(2026, 10, 12).getTime());
    assert.equal(store.history, historyReference);
    assert.equal("2024-01-01" in store.history, false);
    const raw = fs.readFileSync(store.historyPath, "utf8");
    assert.match(raw, /"appChanges"/);
    assert.doesNotMatch(raw, /windowTitle|screenshot|keyboard|rawEvent|executablePath/i);
    const beforeExclusion = JSON.stringify(store.history);
    store.settings.excludedApps.editor = "Text Editor";
    store.saveSettings();
    assert.equal(JSON.stringify(store.history), beforeExclusion, "adding an exclusion must not rewrite past summaries");
    const reloaded = new LocalStore(root);
    reloaded.load(new Date(2026, 10, 12).getTime());
    assert.equal(reloaded.history["2026-11-12"].apps.editor.activeMs, 1_000);
    reloaded.settings.excludedApps["private-chat"] = "Private Chat";
    reloaded.settings.hiddenApps["browser"] = "Web Browser";
    reloaded.saveSettings();
    const preferencesAfterRestart = new LocalStore(root);
    preferencesAfterRestart.load(new Date(2026, 10, 12).getTime());
    assert.deepEqual(preferencesAfterRestart.settings.excludedApps, { "private-chat": "Private Chat", editor: "Text Editor" });
    assert.deepEqual(preferencesAfterRestart.settings.hiddenApps, { browser: "Web Browser" });

    const privateActivity = new ActivityAggregator();
    privateActivity.ingest({ at: 1000, appId: "private-chat", label: "Private Chat", idle: false, excluded: true });
    store.history = privateActivity.history;
    store.saveHistory(new Date(2026, 10, 12).getTime());
    const dailyStorage = fs.readFileSync(store.historyPath, "utf8");
    assert.doesNotMatch(dailyStorage, /private-chat|Private Chat/);
    assert.match(fs.readFileSync(store.settingsPath, "utf8"), /private-chat/);
    store.deleteAllHistory();
    assert.equal(fs.existsSync(store.historyPath), false);
    assert.deepEqual(store.history, {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
