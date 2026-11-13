// Render Microsoft Store screenshots of the real renderer, headlessly.
//
// Electron loads dist/src/renderer/index.html with the real stylesheet and a script that fills in
// sample numbers, then captures at 1920x1080 (which stores reject). The IPC bridge is replaced by a
// stub before any page script runs, because this is a capture of the UI, not the running app.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const outDir = path.join(root, "audit", "store");

const day = {
  appChanges: 137,
  apps: {
    "code.exe": { label: "Visual Studio Code", activeMs: 4 * 3600e3, longestStreakMs: 2.5 * 3600e3, interruptionsStarted: 6, interruptionsCompleted: 5, returnTimeTotalMs: 12 * 60e3 },
    "chrome.exe": { label: "Google Chrome", activeMs: 2.4 * 3600e3, longestStreakMs: 50 * 60e3, interruptionsStarted: 9, interruptionsCompleted: 8, returnTimeTotalMs: 9 * 60e3 },
    "slack.exe": { label: "Slack", activeMs: 1.2 * 3600e3, longestStreakMs: 22 * 60e3, interruptionsStarted: 11, interruptionsCompleted: 9, returnTimeTotalMs: 7 * 60e3 },
    "spotify.exe": { label: "Spotify", activeMs: 0.8 * 3600e3, longestStreakMs: 40 * 60e3, interruptionsStarted: 3, interruptionsCompleted: 3, returnTimeTotalMs: 4 * 60e3 }
  },
  transitions: {}
};

const state = {
  tracking: false,
  periods: { day, week: day },
  startAtLogin: false,
  excludedApps: {},
  hiddenApps: {},
  warning: "",
  dayArchetype: "deep-diver",
  weekArchetype: "deep-diver"
};

/** Fill the page the way the app does, using the same element ids the renderer writes. */
const FILL = `
(() => {
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  text("status-text", "Tracking is paused");
  text("active-time", "9h 24m");
  text("longest-streak", "2h 30m");
  text("app-changes", "137");
  text("archetype-name", "The Deep Diver");
  text("archetype-line", "One app, one long scenic route.");
  const emoji = byId("archetype-emoji");
  if (emoji) { emoji.textContent = "🕵️"; emoji.hidden = false; }
  text("conversion", "🎬 About 1.7 seasons of a series");
  text("return-summary", "Average steady return: 9m");
  text("app-count", "4 apps");
  const list = byId("apps-list");
  if (list) {
    list.innerHTML = [
      ["Visual Studio Code", "4h 0m · 43%", 43],
      ["Google Chrome", "2h 24m · 26%", 26],
      ["Slack", "1h 12m · 13%", 13],
      ["Spotify", "48m · 8%", 8]
    ].map(([label, time, share]) => `
      <div class="app-row">
        <span class="app-name">${label}</span>
        <div class="app-bar"><progress max="100" value="${share}" aria-label="${label} share"></progress></div>
        <span class="app-time">${time}</span>
      </div>`).join("");
  }
})();
`;

async function capture(win, name) {
  const image = await win.webContents.capturePage();
  const file = path.join(outDir, name);
  fs.writeFileSync(file, image.toPNG());
  const { width, height } = image.getSize();
  console.log(`${name} ${width}x${height}`);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "capture-stub.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  const page = path.join(root, "dist", "src", "renderer", "index.html");
  await win.loadFile(page);
  const filled = await win.webContents.executeJavaScript(FILL + "; 'filled'").catch((error) => String(error));
  console.log("fill:", filled);
  await new Promise((resolve) => setTimeout(resolve, 900));

  await capture(win, "store-01-dashboard.png");

  // Second shot: the card-making panel, scrolled into view with a rendered card in place.
  await win.webContents.executeJavaScript(`
    (() => {
      const wrap = document.getElementById("preview-wrap");
      if (wrap) wrap.hidden = false;
      const img = document.getElementById("card-preview");
      if (img) img.src = "card-preview.png";
      const msg = document.getElementById("export-message");
      if (msg) msg.textContent = "Saved locally: C:\\\\Users\\\\You\\\\Pictures\\\\pc-wrapped-story.png";
      const row = document.getElementById("share-row");
      if (row) row.hidden = false;
      document.getElementById("card-section")?.scrollIntoView({ block: "start" });
    })();
  `);
  await new Promise((resolve) => setTimeout(resolve, 700));
  await capture(win, "store-02-card-and-sharing.png");

  win.destroy();
  app.quit();
});
