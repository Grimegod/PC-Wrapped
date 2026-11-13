// Check that a packaged app.asar is internally consistent, using the layout Electron actually
// reads: uint32 headerSize, uint32 pickleSize, uint32 jsonSize, JSON padded to jsonSize bytes,
// then the file data. Every packed file's bytes must hash to the value recorded in the header,
// and the bytes must fill the archive exactly.
const fs = require("node:fs");
const crypto = require("node:crypto");

const asarPath = process.argv[2] ?? "release/win-unpacked/resources/app.asar";
const b = fs.readFileSync(asarPath);
const jsonSize = b.readUInt32LE(8);
const text = b.subarray(16, 16 + jsonSize).toString("utf8");
const nul = text.indexOf("\u0000");
const header = JSON.parse(text.slice(0, nul === -1 ? undefined : nul));
const payloadStart = 12 + jsonSize;

let files = 0;
let mismatched = 0;
let end = 0;
const walk = (node, prefix) => {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    if (value.files) {
      walk(value, `${prefix}${name}/`);
      continue;
    }
    if (value.unpacked) continue;
    files += 1;
    const start = payloadStart + Number(value.offset);
    end = Math.max(end, start + value.size);
    const actual = crypto
      .createHash("sha256")
      .update(b.subarray(start, start + value.size))
      .digest("hex");
    if (actual !== value.integrity?.hash) {
      mismatched += 1;
      if (mismatched <= 3) console.log(`mismatch: ${prefix}${name}`);
    }
  }
};
walk(header, "");

console.log(`packed files: ${files}, mismatched: ${mismatched}`);
console.log(`payload start: ${payloadStart}, last file ends at: ${end}, archive: ${b.length}`);
console.log(`consistent: ${mismatched === 0 && end === b.length}`);
console.log(`sha256: ${crypto.createHash("sha256").update(b).digest("hex")}`);
process.exitCode = mismatched === 0 && end === b.length ? 0 : 1;
