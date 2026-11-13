// The whole TypeScript build in one file, so `dev`, `test:preview` and both packaging scripts run
// exactly the same steps and none of them depends on a package manager being on PATH.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function run(label, args) {
  process.stdout.write(`[build] ${label}\n`);
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
}

run("clean", [path.join(__dirname, "clean.cjs")]);
run("icons", [path.join(__dirname, "generate-icons.cjs")]);
run("conversions", [path.join(__dirname, "generate-conversions.cjs")]);
run("typecheck (main)", [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"]);
run("typecheck (renderer)", [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.renderer.json"]);
run("static assets", [path.join(__dirname, "copy-static.cjs")]);
process.stdout.write("[build] done\n");
