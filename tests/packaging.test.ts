import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

test("Windows package includes the custom window and tray icons as runtime resources", () => {
  const resources = packageJson.build.fileOptions.extraResources as Array<{ from: string; to: string }>;
  assert.ok(resources.some((resource) => resource.from === "assets/pc-wrapped.ico" && resource.to === "pc-wrapped.ico"));
  assert.ok(resources.some((resource) => resource.from === "assets/pc-wrapped-tray.png" && resource.to === "pc-wrapped-tray.png"));
  assert.ok(packageJson.build.fileOptions.files.includes("assets/**/*"));
  assert.equal(packageJson.build.win.icon, "assets/pc-wrapped.ico");
  assert.equal(packageJson.build.directories.buildResources, "build");
});

test("MSIX build uses the no-ASAR workaround without changing the portable build", () => {
  const msixScript = packageJson.scripts["build:msix"] as string;
  assert.equal(packageJson.build.asar, true);
  assert.match(msixScript, /--win msix/);
  assert.match(msixScript, /--config\.asar=false/);
  assert.match(msixScript, /--config\.electronFuses\.onlyLoadAppFromAsar=false/);
  assert.match(msixScript, /check-msix-layout\.cjs/);
});

test("MSIX layout check accepts the unpacked app and rejects a stray ASAR archive", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pcw-msix-layout-"));
  const resources = path.join(root, "resources");
  const appDir = path.join(resources, "app");
  const mainFile = path.join(appDir, "dist", "main.js");
  try {
    mkdirSync(path.dirname(mainFile), { recursive: true });
    writeFileSync(path.join(appDir, "package.json"), JSON.stringify({ main: "dist/main.js" }));
    writeFileSync(mainFile, "// synthetic smoke fixture\n");
    const checkScript = path.join(projectRoot, "scripts", "check-msix-layout.cjs");
    const validResult = spawnSync(process.execPath, [checkScript, root], { encoding: "utf8" });
    assert.equal(validResult.status, 0, validResult.stderr);
    assert.match(validResult.stdout, /MSIX no-ASAR layout passed/);

    writeFileSync(path.join(resources, "app.asar"), "unexpected");
    const invalidResult = spawnSync(process.execPath, [checkScript, root], { encoding: "utf8" });
    assert.equal(invalidResult.status, 1);
    assert.match(invalidResult.stderr, /MSIX workaround expects resources\/app\.asar to be absent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated app and tray icon PNGs have the expected dimensions", () => {
  const files = [
    { name: "pc-wrapped.png", size: 256 },
    { name: "pc-wrapped-tray.png", size: 64 }
  ];
  for (const file of files) {
    const iconPath = path.join(projectRoot, "assets", file.name);
    assert.ok(existsSync(iconPath), `${file.name} must be generated before tests`);
    const png = readFileSync(iconPath);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), file.size);
    assert.equal(png.readUInt32BE(20), file.size);
  }
});
