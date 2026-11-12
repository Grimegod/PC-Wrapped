const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const resultPath = path.join(os.tmpdir(), "pc-wrapped-preview-smoke-result.json");
assert.ok(fs.existsSync(resultPath), "Electron preview smoke test did not write a result.");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
try {
  assert.equal(result.ok, true, result.error ?? "Electron preview smoke test failed.");
  assert.ok(result.image.naturalWidth > 0, "Preview image naturalWidth must be greater than zero.");
  assert.equal(result.image.naturalWidth, 1080);
  assert.ok(result.image.naturalHeight > 0);
  assert.equal(result.image.srcProtocol, "blob:");
  assert.equal(result.emptyState.previewDisabled, true);
  assert.equal(result.emptyState.saveDisabled, true);
  assert.equal(result.emptyState.previewHidden, true);
  assert.deepEqual(result.rendererErrors, []);
  console.info(`[test] Renderer loaded a synthetic ${result.image.naturalWidth}x${result.image.naturalHeight} PNG; naturalWidth > 0.`);
  console.info("[test] Empty-state card controls and CSP-backed blob preview verified.");
} finally {
  fs.rmSync(resultPath, { force: true });
}
