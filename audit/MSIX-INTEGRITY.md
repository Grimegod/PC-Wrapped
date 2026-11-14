# MSIX integrity failure — verified status

Date: 13 November 2026

## What the failure proves

The earlier launch logs report an Electron ASAR-integrity mismatch:

```text
Integrity check failed for asar archive (23ab3020… vs 7c15b688…)
```

This proves that the digest embedded in the executable did not match the digest Electron
calculated from the packaged `app.asar`. It does **not** prove that Electron hashes the ASAR
header's Pickle padding. The previous report's padding explanation was incorrect: electron-builder
hashes the parsed header string, and Electron's runtime validation receives the parsed header string
as bytes. Those are the same logical bytes, so adding NUL padding to electron-builder's digest would
be the wrong fix.

The existing evidence does not isolate which exact packaging step changed the embedded digest from
the value calculated for the ASAR. The target or a later executable-resource rewrite remains a
hypothesis until the executable resource is captured at each build stage.

## Workaround implemented and tested

The MSIX build now disables ASAR and `onlyLoadAppFromAsar` for that target only. The general build
configuration still uses ASAR, so the portable build retains its existing layout. A post-build check
requires `resources/app/package.json` and the declared main entry to exist, and fails if
`resources/app.asar` reappears.

Local test results:

- electron-builder 27.0.0-alpha.14 produced `release-msix-test/PC-Wrapped-1.0.0-x64.msix` (156,749,136 bytes).
- The package contains `app/resources/app/...` and no `resources/app.asar`.
- The unpacked executable opened the `PC Wrapped` window using isolated data under `%TEMP%`; its
  captured stderr was empty and it did not report an ASAR-integrity failure.
- 58 application tests pass, including the MSIX layout regression test. Both TypeScript projects
  type-check.

This verifies the workaround's build layout and Electron startup from the unpacked output. The test
MSIX is unsigned, so it has **not** been installed or launched through Windows package activation;
this run also does not certify the package or verify the packaged tracker/start-at-login path.

## Trade-offs and remaining work

Without ASAR, application files are unpacked under `resources/app`; ASAR does not encrypt source
files, but the archive boundary is lost. `onlyLoadAppFromAsar` must be disabled for this target.
Embedded ASAR integrity cannot protect an archive that is not present. The portable target remains
unchanged.

Before a Store submission, reserve the real Partner Center identity, rebuild with it, install and
exercise the signed package, and rerun certification against that exact package. Separately,
capture the executable's integrity resource before and after the MSIX target to identify the
original mismatch and restore ASAR for MSIX if the build toolchain fixes it.
