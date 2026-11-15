# PC Wrapped 1.1.0 — what is done, what I could not do

Date: 15 November 2026

## Done and verified

| Item | Evidence |
| --- | --- |
| Version bumped to **1.1.0** in `package.json` and in the MSIX manifest | `Identity Version="1.1.0.0"` read from the packaged `AppxManifest.xml` |
| **Month and year** ranges in the period switch | `src/shared/dates.ts` (`monthKeys`, `yearKeysToDate`), `tests/csv.test.ts` |
| **CSV export** in Settings | `src/main/csv.ts`, six tests covering ordering, quoting, BOM and the empty case |
| Period switch wraps instead of overflowing with four ranges | `.period-switch { flex-wrap: wrap }` |
| Tests | **64 passing** |
| Types and lint | `tsc --noEmit` clean on both configs, ESLint `--max-warnings 0` clean, Prettier clean |
| Portable build | runs — window titled "PC Wrapped", 4 processes |
| **Unsigned Store package** | `release/PC-Wrapped-1.1.0-x64.msix`, 156.8 MB, correct Store identity |
| **Store upload package** | `release/PC-Wrapped-1.1.0-x64.msixupload`, 156.4 MB — this is the file Partner Center wants |
| Commit and tag | `9e5670d`, tag `v1.1.0` |

## The MSIX launch problem: solved

Earlier this project believed the Store build could not run. That is no longer true. The
`build:msix` script already contained the answer and I had not been reading it:

```
--config.asar=false --config.electronFuses.onlyLoadAppFromAsar=false
```

With no asar there is no integrity resource to mismatch, so the check cannot fail. Built with those
flags the package **installs and launches** — verified on this machine:

```
found: PCWrapped.Test_1.1.0.0_x64__hg23wmq7gw2m6 status=Ok
exited=False
running=4
window=PC Wrapped
```

## What I could not do, and why

**Push to GitHub failed: `repository not found`.** The repository `Grimegod/PC-Wrapped` no longer
exists under that account, and it is not in the account's repository list either (the account has
three other repositories). Nothing of mine can recreate a private repository at that name without
your say-so. The commit and the tag `v1.1.0` are made locally and waiting to be pushed.

**I cannot upload to Partner Center.** That needs your Microsoft account and a signed-in browser;
the seller dashboard is not something an assistant can or should touch. The `.msixupload` file is
ready for you to drop into the submission.

**A signed test package could not be produced.** Signing with the throwaway test certificate now
fails with `SignerSign() failed (0x8007000b)`, while the same certificate still signs the older
0.1.0 package. The certificate appears to have become unusable. This does not matter for the Store —
Partner Center signs the package itself — and it is why the shipped artifact is the unsigned one.

## What you do next

1. Open Partner Center, create the 1.1.0 submission.
2. Upload `release/PC-Wrapped-1.1.0-x64.msixupload`.
3. Write the release notes — "two new ranges (this month, this year) and a CSV export of your own
   history" is accurate.
4. Two new screenshots would help: the four-range switch, and the Export CSV button in Settings.

If you want the tag pushed, tell me where the repository lives now (a new name, or a new repo to
create) and I will push the commit and the tag there.
