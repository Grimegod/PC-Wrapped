import assert from "node:assert/strict";
import test from "node:test";
import { applyStartAtLogin, readStartAtLogin, type StartupDependencies } from "../src/main/startup";

function fakeDeps(openAtLogin = false): StartupDependencies & { calls: unknown[] } {
  const calls: unknown[] = [];
  let state = openAtLogin;
  return {
    calls,
    isPackaged: false,
    setLoginItemSettings: (settings) => {
      calls.push(settings);
      state = settings.openAtLogin ?? false;
    },
    getLoginItemSettings: () => ({ openAtLogin: state }) as never
  };
}

test("start-at-login is off by default and turning it on is reported back", async () => {
  const deps = fakeDeps();
  assert.equal(await readStartAtLogin(deps), false);
  assert.equal(await applyStartAtLogin(deps, true), true);
  assert.equal(await readStartAtLogin(deps), true);
  assert.deepEqual(deps.calls, [{ openAtLogin: true, name: "PCWrapped" }]);
});

test("turning start-at-login off is a real off, not an ignored call", async () => {
  const deps = fakeDeps(true);
  assert.equal(await applyStartAtLogin(deps, false), false);
  assert.equal(await readStartAtLogin(deps), false);
});
