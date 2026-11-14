// Render Microsoft Store screenshots of the real renderer with synthetic data.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const outDir = path.join(root, "audit", "store");
const { renderCard } = require(path.join(root, "dist", "src", "main", "card.js"));

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

const cardPreviewBase64 = renderCard(day, "story", "day").toString("base64");

async function capture(win, name) {
  const image = await win.webContents.capturePage();
  const file = path.join(outDir, name);
  fs.writeFileSync(file, image.toPNG());
  const { width, height } = image.getSize();
  if (width < 1366 || height < 768) throw new Error(`Store screenshot is below the minimum size: ${width}x${height}`);
  console.log(`${name} ${width}x${height}`);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "capture-stub.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const rendererErrors = [];
  win.webContents.on("console-message", (details) => {
    if (details.level === "error") rendererErrors.push(`${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
  const page = path.join(root, "dist", "src", "renderer", "index.html");
  await win.loadFile(page);
  await win.webContents.executeJavaScript(`(async () => {
    const until = Date.now() + 5000;
    while (document.getElementById("active-time")?.textContent === "0m" && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (document.getElementById("active-time")?.textContent === "0m") throw new Error("Synthetic recap state did not render.");
  })()`);

  await capture(win, "store-01-dashboard.png");

  // Second shot: the card-making panel, scrolled into view with a rendered card in place.
  win.showInactive();
  await win.webContents.executeJavaScript(`
    (() => {
      const wrap = document.getElementById("preview-wrap");
      if (wrap) wrap.hidden = false;
      const img = document.getElementById("card-preview");
      if (img) {
        const encoded = ${JSON.stringify(cardPreviewBase64)};
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        img.src = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      }
      const msg = document.getElementById("export-message");
      if (msg) msg.textContent = "Story card · 1080 × 1920 px";
      const row = document.getElementById("share-row");
      if (row) row.hidden = true;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
      return { scrollY: window.scrollY, rootTop: document.scrollingElement.scrollTop, pageHeight: document.scrollingElement.scrollHeight };
    })();
  `);
  const previewStatus = await win.webContents.executeJavaScript(`(async () => {
    const image = document.getElementById("card-preview");
    await image.decode();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      loaded: image.naturalWidth > 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
      scrollY: window.scrollY,
      cardTop: document.getElementById("card-section")?.getBoundingClientRect().top
    };
  })()`);
  if (!previewStatus.loaded) throw new Error("Store card preview did not load.");
  console.log(`card preview ${previewStatus.width}x${previewStatus.height}; scroll ${previewStatus.scrollY}; card top ${previewStatus.cardTop}`);
  await capture(win, "store-02-card-and-sharing.png");
  win.hide();

  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join("; ")}`);

  win.destroy();
  app.quit();
});
