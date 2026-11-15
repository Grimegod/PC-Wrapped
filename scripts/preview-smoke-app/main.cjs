const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const root = path.resolve(__dirname, "..", "..");
const { renderCard } = require(path.join(root, "dist", "src", "main", "card.js"));
const { emptyDay, recapStats } = require(path.join(root, "dist", "src", "shared", "aggregation.js"));
const { chooseArchetype } = require(path.join(root, "dist", "src", "shared", "archetypes.js"));
const populatedDay = {
  appChanges: 3,
  apps: {
    "synthetic-editor": {
      label: "Synthetic Editor",
      activeMs: 1_800_000,
      longestStreakMs: 840_000,
      interruptionsStarted: 1,
      interruptionsCompleted: 1,
      returnTimeTotalMs: 45_000
    },
    "synthetic-browser": {
      label: "Synthetic Browser",
      activeMs: 720_000,
      longestStreakMs: 300_000,
      interruptionsStarted: 0,
      interruptionsCompleted: 0,
      returnTimeTotalMs: 0
    }
  },
  transitions: {}
};

let activeDay = populatedDay;
let rendererErrors = [];
const resultPath = path.join(os.tmpdir(), "pc-wrapped-preview-smoke-result.json");
const stateForDay = (day) => {
  const stats = recapStats(day);
  const archetype = chooseArchetype(stats);
  return {
    tracking: false,
    startAtLogin: false,
    excludedApps: {},
    hiddenApps: {},
    today: day,
    week: day,
    todayStats: stats,
    weekStats: stats,
    todayArchetype: archetype,
    weekArchetype: archetype,
    warning: ""
  };
};

ipcMain.handle("state:get", () => stateForDay(activeDay));
ipcMain.handle("card:preview", (_event, format, period) => {
  const png = renderCard(activeDay, format, period);
  return `data:image/png;base64,${png.toString("base64")}`;
});

async function openTestWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(root, "dist", "src", "main", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.on("console-message", (details) => {
    if (details.level === "error") {
      const line = `[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`;
      rendererErrors.push(line);
      console.error(line);
    }
  });
  await window.loadFile(path.join(root, "dist", "src", "renderer", "index.html"));
  return window;
}

async function waitForRendererImage(window, format) {
  const script = [
    "(async () => {",
    "const until = Date.now() + 8000;",
    "const button = document.getElementById('preview-button');",
    "while (button.disabled && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 25));",
    "if (button.disabled) throw new Error('Renderer did not enable preview from the synthetic recap data.');",
    "const shape = document.getElementById('card-format');",
    "shape.value = " + JSON.stringify(format) + ";",
    "const image = document.getElementById('card-preview');",
    "const loaded = new Promise((resolve, reject) => {",
    "const timer = setTimeout(() => reject(new Error('Preview image did not finish loading.')), 8000);",
    "image.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });",
    "image.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Preview image emitted an error event.')); }, { once: true });",
    "});",
    "button.click();",
    "await loaded;",
    "const policy = Array.from(document.querySelectorAll('meta')).find((meta) => meta.httpEquiv.toLowerCase() === 'content-security-policy')?.content ?? '';",
    "return { format: shape.value, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, srcProtocol: new URL(image.src).protocol, policy };",
    "})()"
  ].join("\n");
  return window.webContents.executeJavaScript(script);
}

async function verifyEmptyState(window) {
  window.webContents.send("state:changed", stateForDay(emptyDay()));
  return window.webContents.executeJavaScript(`(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const preview = document.getElementById("preview-button");
    const save = document.getElementById("save-button");
    const wrap = document.getElementById("preview-wrap");
    return {
      previewDisabled: preview.disabled,
      saveDisabled: save.disabled,
      previewHidden: wrap.hidden && getComputedStyle(wrap).display === "none",
      emptyMessage: document.getElementById("card-empty-message").textContent.trim()
    };
  })()`);
}

app.whenReady().then(async () => {
  try {
    const populatedWindow = await openTestWindow();
    const images = [];
    for (const format of ["story", "square"]) {
      const image = await waitForRendererImage(populatedWindow, format);
      const expectedHeight = format === "story" ? 1920 : 1080;
      assert.ok(image.naturalWidth > 0, "Expected a loaded " + format + " image, got naturalWidth=" + image.naturalWidth);
      assert.equal(image.naturalWidth, 1080);
      assert.equal(image.naturalHeight, expectedHeight);
      assert.equal(image.srcProtocol, "blob:");
      assert.deepEqual(rendererErrors, []);
      images.push(image);
      console.info("[main] Synthetic " + format + " card preview loaded in renderer: " + image.naturalWidth + "x" + image.naturalHeight + ", " + image.srcProtocol);
    }
    const csp = images[0].policy;
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /img-src 'self' blob:/);
    assert.match(csp, /connect-src 'none'/);
    assert.doesNotMatch(csp, /https?:|wss?:/i);
    assert.deepEqual(rendererErrors, []);
    activeDay = emptyDay();
    const emptyState = await verifyEmptyState(populatedWindow);
    assert.equal(emptyState.previewDisabled, true);
    assert.equal(emptyState.saveDisabled, true);
    assert.equal(emptyState.previewHidden, true);
    assert.equal(emptyState.emptyMessage, "Track for a while to create a card");
    assert.deepEqual(rendererErrors, []);
    console.info("[main] Empty recap keeps the preview hidden and both card actions disabled.");
    fs.writeFileSync(resultPath, JSON.stringify({ ok: true, images, csp, emptyState, rendererErrors }), "utf8");
    populatedWindow.destroy();
    app.quit();
  } catch (error) {
    console.error("[main] Preview smoke test failed:", error);
    fs.writeFileSync(
      resultPath,
      JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error), rendererErrors }),
      "utf8"
    );
    app.exit(1);
  }
});
