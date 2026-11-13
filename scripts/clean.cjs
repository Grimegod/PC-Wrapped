// Remove the TypeScript build output. Kept as a file so the build does not depend on a shell
// one-liner or on how `node -e` is quoted on Windows.
const fs = require("node:fs");
const path = require("node:path");

fs.rmSync(path.join(__dirname, "..", "dist"), { recursive: true, force: true });
