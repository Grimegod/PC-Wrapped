const fs = require("node:fs");
const path = require("node:path");

function validateMsixLayout(appOutDir) {
  const resourcesDir = path.join(appOutDir, "resources");
  const appDir = path.join(resourcesDir, "app");
  const asarPath = path.join(resourcesDir, "app.asar");

  if (fs.existsSync(asarPath)) {
    throw new Error("MSIX workaround expects resources/app.asar to be absent.");
  }

  const appPackagePath = path.join(appDir, "package.json");
  if (!fs.existsSync(appPackagePath)) {
    throw new Error("MSIX app files are missing from resources/app.");
  }

  const appPackage = JSON.parse(fs.readFileSync(appPackagePath, "utf8"));
  if (typeof appPackage.main !== "string" || appPackage.main.length === 0) {
    throw new Error("Packaged app package.json has no valid main entry.");
  }

  const mainPath = path.resolve(appDir, appPackage.main);
  const relativeMainPath = path.relative(appDir, mainPath);
  if (relativeMainPath === ".." || relativeMainPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeMainPath)) {
    throw new Error("Packaged app main entry resolves outside resources/app.");
  }
  if (!fs.existsSync(mainPath)) {
    throw new Error(`Packaged app main entry is missing: ${appPackage.main}`);
  }

  return { appDir, mainPath };
}

if (require.main === module) {
  const appOutDir = path.resolve(process.argv[2] ?? "release/win-unpacked");
  try {
    const { appDir, mainPath } = validateMsixLayout(appOutDir);
    console.log(`MSIX no-ASAR layout passed: ${path.relative(appOutDir, appDir)} contains ${path.relative(appDir, mainPath)}.`);
  } catch (error) {
    console.error(`MSIX layout check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

module.exports = { validateMsixLayout };
