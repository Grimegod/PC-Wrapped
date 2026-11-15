import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("renderer CSP uses a deny-by-default policy and blocks remote connections", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "src", "renderer", "index.html"), "utf8");
  const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s)?.[1];
  assert.ok(policy, "Content Security Policy meta tag exists");
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /img-src 'self' blob:/);
  assert.doesNotMatch(policy, /img-src[^;]*data:/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.doesNotMatch(policy, /https?:|wss?:/i);
});
