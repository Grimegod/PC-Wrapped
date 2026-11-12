import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
