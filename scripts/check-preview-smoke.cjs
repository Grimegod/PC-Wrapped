const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const resultPath = path.join(os.tmpdir(), "pc-wrapped-preview-smoke-result.json");
assert.ok(fs.existsSync(resultPath), "Electron preview smoke test did not write a result.");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
try {
  assert.equal(result.ok, true, result.error ?? "Electron preview smoke test failed.");
  assert.equal(result.images.length, 2, "Both card shapes must render.");
  const expected = [
    { format: "story", width: 1080, height: 1920 },
    { format: "square", width: 1080, height: 1080 }
  ];
  for (const item of expected) {
    const image = result.images.find((candidate) => candidate.format === item.format);
    assert.ok(image, "Missing " + item.format + " renderer result.");
    assert.ok(image.naturalWidth > 0, item.format + " naturalWidth must be greater than zero.");
    assert.equal(image.naturalWidth, item.width);
    assert.equal(image.naturalHeight, item.height);
    assert.equal(image.srcProtocol, "blob:");
  }
  assert.match(result.csp, /default-src 'none'/);
  assert.match(result.csp, /img-src 'self' blob:/);
  assert.match(result.csp, /connect-src 'none'/);
  assert.doesNotMatch(result.csp, /https?:|wss?:/i);
  assert.equal(result.emptyState.previewDisabled, true);
  assert.equal(result.emptyState.saveDisabled, true);
  assert.equal(result.emptyState.previewHidden, true);
  assert.deepEqual(result.rendererErrors, []);
  console.info("[test] Story 1080x1920 and square 1080x1080 PNGs loaded in Electron; naturalWidth > 0.");
  console.info("[test] Local blob CSP, blocked remote connections and empty-state controls verified.");
} finally {
  fs.rmSync(resultPath, { force: true });
}
