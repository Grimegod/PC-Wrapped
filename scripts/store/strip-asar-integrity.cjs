// Strip the embedded asar-integrity resource from the built exe, as a last resort for MSIX builds.
//
// electron-builder 27 alpha writes a hash that Electron never accepts, and the fuse that would
// switch the check off no longer takes effect because the resource is still present. Removing the
// resource is what the fuse-off build is supposed to look like.
const fs = require("node:fs");

const exePath = process.argv[2] ?? "release/win-unpacked/PC Wrapped.exe";
const buffer = fs.readFileSync(exePath);
const marker = '{"file":"resources\\\\app.asar"';
const at = buffer.toString("latin1").indexOf(marker);
if (at < 0) {
  console.log("no integrity resource found — nothing to strip");
  process.exit(0);
}
// The resource is a small JSON array terminated by ']'. Blank it out with spaces of the same length
// so every other offset in the file stays put.
const end = buffer.indexOf(0x5d, at); // ']'
const length = end - at + 1;
buffer.fill(0x20, at, at + length);
fs.writeFileSync(exePath, buffer);
console.log(`stripped ${length} bytes of integrity resource at ${at}`);
