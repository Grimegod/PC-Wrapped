# MSIX integrity failure — the exact cause

Date: 13 November 2026

## The cause, in one line

`electron-builder 27.0.0-alpha.14` hashes the asar **header without its trailing NUL padding**,
while Electron 39 hashes the header **as stored, padding included**. The two never agree, so the
packaged app aborts at startup.

## The evidence

The exe embeds one expected hash (`release/win-unpacked/PC Wrapped.exe`):

```
[{"file":"resources\\app.asar","alg":"SHA256","value":"7c15b688…c89d8"}]
```

Hashing the real `app.asar` different ways:

| What is hashed | Result |
| --- | --- |
| the whole file | `c73b9fee…` |
| the JSON header text without its 7 NUL bytes | **`7c15b688…` — exactly what the exe expects** |
| the header exactly as stored (10 536 bytes, padding included) | `edd566ba…` |

So electron-builder wrote the hash of a header it had already trimmed, and Electron reads the
header with the padding still on. `app-builder-lib/dist/asar/integrity.js` shows why:

```js
async function hashHeader(file) {
  const { header } = await readAsarHeader(file);
  hash.update(header);   // <- the parsed string, padding already gone
```

Electron's `asar_util.cc` hashes the raw header block instead.

The two error hashes in the crash message confirm the same thing from the other side:

- `23ab3020…` is embedded in the **installed** exe,
- `7c15b688…` is embedded in the **locally built** exe,

so the MSIX target rewrote the exe (and re-hashed the asar) after the first hash was recorded, and
neither value matches what Electron computes at runtime.

## Why pinning to 26.x is not the way out

electron-builder 26.18.1 rejects this project's config outright:

```
configuration has an unknown property 'fileOptions'
configuration has an unknown property 'msix'
```

`fileOptions` and the `msix` target only exist in the 27 alpha. Downgrading means rewriting the
build config for a tool that cannot produce a Store package anyway.

## What actually fixes it

The app itself is fine — the portable build runs from the same code and the same fuses (verified:
window titled "PC Wrapped", 4 processes). Only the packaged-Msix path is broken.

Options, cheapest first:

1. **Wait for a fixed electron-builder 27 beta** and bump the pin. One line in `package.json`.
2. **Turn the integrity check off for the MSIX build only**
   (`electronFuses.enableEmbeddedAsarIntegrityValidation: false`). The app then starts, at the cost
   of one tamper-detection layer. A Store submission does not require this fuse, and the Store
   re-signs the package anyway.
3. **Patch the resource after packing** — rewrite the embedded hash to `edd566ba…` so it matches
   what Electron computes. Fragile: it depends on Electron internals staying the same.

Recommendation: option 2 for a testable Store build now, option 1 as the real fix.
