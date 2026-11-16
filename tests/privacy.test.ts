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

test("the activity adapter never reads window titles, keystrokes or screen contents", () => {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts", "tracker.ps1"), "utf8");
  assert.doesNotMatch(script, /GetWindowText|MainWindowTitle|GetAsyncKeyState|GetKeyboardState|SetWindowsHookEx|BitBlt|CopyFromScreen/);
  assert.doesNotMatch(script, /ExecutionPolicy/i);
  assert.doesNotMatch(script, /Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|HttpClient/i);
});

test("the activity adapter writes UTF-8 so app names keep their accents and symbols", () => {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts", "tracker.ps1"), "utf8");
  assert.match(script, /\[Console\]::OutputEncoding\s*=\s*New-Object System\.Text\.UTF8Encoding/);
  assert.ok(script.indexOf("OutputEncoding") < script.indexOf("ConvertTo-Json"), "set before anything is written");
});
