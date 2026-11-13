# PC Wrapped — MVP implementation plan

## Phase 0: decisions and setup

<div align="justify">

Keep the first milestone Windows-only and preserve a small platform-independent activity model: timestamp, app identifier, idle state, and event type. Put OS foreground and idle detection behind an adapter so later platforms can be added without changing aggregation or card rendering. Cross-platform support is a future validation target, not an automatic consequence of choosing a framework.

</div>

### Framework recommendation

Use Electron with TypeScript for the first desktop shell if the goal remains a quick Windows build with a plausible path to macOS and Linux. Keep tracking in the main process, use a narrow typed IPC surface, and sandbox the renderer. Use a small local store; do not introduce a server. Package size and native-module maintenance are tradeoffs to measure before committing to Electron. A lightweight native Windows implementation may be preferable if Electron overhead outweighs cross-platform reuse.

## Three-day prototype target

| Day | Deliverable                                                                                 | Exit check                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tray shell, foreground-app adapter, idle detector, start/pause state, local aggregate store | Synthetic activity timeline has exact expected durations; idle periods and excluded apps add zero time                            |
| 2   | Daily/weekly recap and local PNG card export                                                | Story and square exports have correct dimensions; preview matches saved image; no network requests                                |
| 3   | Installer/portable packaging, privacy and deletion controls, manual QA                      | Clean install and uninstall in a disposable Windows profile; pause, restart persistence, delete history, and offline use verified |

<div align="justify">

This is a prototype schedule, not a guarantee of a polished Store-ready release. Microsoft Store certification, product identity, privacy-policy requirements, signing path, accessibility, localization, and testing on other computers are separate work. Do not launch or post promotional material until the tests and privacy claims match the actual implementation.

</div>

## Technical boundaries

- Windows adapter: foreground process identity and last-input/idle state only. Drop the window title at collection time.
- Aggregator: split intervals on app changes, idle transitions, midnight, pause/resume, and sleep/wake; use monotonic elapsed time for duration and wall time only for calendar grouping.
- Store: write aggregate records atomically; handle corrupt or locked state without deleting history silently.
- UI: clearly disclose tracking state; minimize to tray only after user configuration; do not enable startup-on-login by default.
- Card renderer: render a local template from aggregate values; no remote fonts or images.
- Tests: deterministic synthetic timelines, midnight and daylight-saving boundaries, idle threshold edges, exclusion changes, restart persistence, deletion, and image dimensions.

## Open decisions before implementation

1. Final name and logo.
2. Default history retention period.
3. Whether the app starts tracking only on explicit launch or offers opt-in start-at-login.
4. Whether application display labels are resolved locally from executable metadata or shown as executable names.
5. Whether the first public preview is a portable build, a per-user installer, or both.
