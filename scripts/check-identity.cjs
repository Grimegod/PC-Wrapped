// Keep the Electron fuses in step with the app identity: run as part of build:ts and CI.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const constants = fs.readFileSync(path.join(root, "src", "shared", "constants.ts"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "src", "main", "main.ts"), "utf8");
const problems = [];

const appId = pkg.build?.appId;
const declaredId = constants.match(/export const APP_ID = "([^"]+)"/)?.[1];

if (!appId) problems.push("package.json build.appId is missing");
if (appId === "com.example.pcwrapped" || /^com\.example\./.test(appId ?? "")) {
  problems.push(`build.appId is still a placeholder: ${appId}`);
}
if (declaredId !== appId) {
  problems.push(`src/shared/constants.ts APP_ID (${declaredId}) must equal build.appId (${appId})`);
}
if (!mainSource.includes("app.setAppUserModelId(APP_ID)")) {
  problems.push("main.ts must call app.setAppUserModelId(APP_ID) rather than a literal");
}

const identityName = pkg.build?.msix?.identityName;
const publisher = pkg.build?.msix?.publisher;
if (!identityName || /^Example\./i.test(identityName)) {
  problems.push(`msix.identityName has not been reserved yet: ${identityName}`);
}
if (!publisher || publisher === "CN=ms") {
  problems.push(`msix.publisher is still a placeholder: ${publisher}`);
}

const fuses = pkg.build?.electronFuses ?? {};
for (const [fuse, expected] of Object.entries({
  runAsNode: false,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true
})) {
  if (fuses[fuse] !== expected) problems.push(`electronFuses.${fuse} must be ${expected}`);
}

if (problems.length) {
  console.error("Identity check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("Identity check passed: appId, MSIX identity and Electron fuses are final.");
