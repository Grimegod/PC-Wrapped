# Development scratch scripts

Throwaway scripts used while diagnosing the build chain in this project. They are kept for
reference, not for use:

- `_build-trace.cjs`, `_copy-trace.cjs`, `_open-trace.cjs`, `_rename-trace.cjs`,
  `_stream-trace.cjs` — traced `fs` calls to find where a file copy failed inside the Electron
  distribution.
- `_prep-dist.cjs`, `_prepack.cjs` — staged a clean `electronDist` (see "Build environment" in
  the README).
- `_builder.cjs` — wrapper that invokes electron-builder through Electron's Node.

They assume the same `ELECTRON_RUN_AS_NODE=1` invocation as the scripts in `scripts/`. Delete
this folder once the dependency install is healthy; nothing in the build depends on it.
