// Fail loudly when the installed dependency tree cannot build the app.
//
// The tree this was written for had `.pnpm/` store entries in place but most packages not linked
// into the root `node_modules`, which electron-builder only discovers twenty seconds into a build
// ("Invalid package ... default_app.asar"). Checking first turns that into one clear line.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const required = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {})
  // electron-builder's own helpers are deliberately NOT listed here. pnpm's isolated layout keeps
  // them inside node_modules/.pnpm and electron-builder resolves them from there, so requiring them
  // at the root failed on every CI run while the build itself worked. The list below is only what
  // this repository declares and what the build script loads by name.
];

// A package is present when its manifest is on disk. Requiring it is not the test: `@types/*`
// packages are type declarations with no runnable entry point, so require.resolve() fails on a
// perfect install and used to fail this check on every CI run.
const missing = required.filter((name) => {
  if (!fs.existsSync(path.join(root, "node_modules", name, "package.json"))) return true;
  if (name.startsWith("@types/")) return false;
  // Resolve the way the build does: several of these packages do not export ./package.json and
  // would be reported missing when they load perfectly well.
  try {
    require.resolve(name);
    return false;
  } catch {
    return true;
  }
});

// The installed Electron distribution must ship a real app.asar, not a directory named one:
// a partial install leaves it as a folder and every copy of the distribution fails.
const electronAsar = path.join(root, "node_modules", "electron", "dist", "resources", "default_app.asar");
let electronNote = "";
if (fs.existsSync(electronAsar)) {
  try {
    const stat = fs.lstatSync(electronAsar);
    electronNote = stat.isDirectory()
      ? "node_modules/electron/dist/resources/default_app.asar is a directory, not an archive: the Electron install is incomplete."
      : "";
  } catch {
    electronNote = "node_modules/electron/dist/resources/default_app.asar could not be inspected.";
  }
}

if (missing.length || electronNote) {
  console.error("Dependency check failed.");
  if (missing.length) {
    console.error(`  Packages not linked into node_modules: ${missing.join(", ")}`);
  }
  if (electronNote) console.error(`  ${electronNote}`);
  console.error("  Run `pnpm install --frozen-lockfile` in this folder, then retry.");
  process.exit(1);
}

console.log(`Dependency check passed: ${required.length} packages present, Electron distribution complete.`);
