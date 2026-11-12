# PC Wrapped — product brief

**Working title:** PC Wrapped. Name and visual identity are not final.

<div align="justify">

PC Wrapped is a small desktop app that turns a user's locally collected computer-activity totals into a friendly daily or weekly recap card. The product shows where active time went without claiming to measure attention, productivity, or intent. The first release targets Windows; other operating systems need their own tested activity adapters and permission flows.

</div>

## User promise

> See which apps took your active time, understand your app-switching pattern, and export a recap card. Your detailed activity stays on your computer.

## MVP scope

- Optional foreground-app tracking, visibly marked as on or paused.
- Aggregate active time by application and local calendar day.
- Treat the user as idle after 60 seconds without input; do not count idle time.
- Record the app identity only. Do not read or persist window titles, URLs, keystrokes, screenshots, document names, or clipboard data.
- Local-only storage with a clear delete-history control and a configurable exclusion list.
- A recap view with time per app, longest uninterrupted app session, and foreground app changes. Label these as observations, not productivity scores.
- Export a user-previewed PNG card in story and square layouts. No automatic sharing or upload.
- Work offline and require no account.

## Explicitly out of scope for the first release

- “Interruption cost,” focus diagnosis, personality labels, or claims about how long a user took to return to work. Foreground changes alone cannot establish those facts.
- Alt+Tab counts or keyboard monitoring.
- Browser tab/site tracking, screenshots, cloud sync, leaderboards, telemetry, and background uploads.
- QR “duels.” If revisited, the user must preview the exact aggregate fields before exporting or importing them.
- A promise that the app is open-source, viral, or uniquely original before the license and competitor review support that claim.
- Linux, macOS, Android, iOS, or ChromeOS support in the Windows MVP.

## Privacy and safety requirements

1. Tracking starts only after a clear user choice; pause is always available from the tray and main window.
2. No data leaves the device. The app has no network client in the MVP.
3. Persist only date, normalized app identifier, and accumulated seconds. Do not persist raw executable paths or window titles.
4. Excluded apps contribute no activity records. Let users add and remove exclusions.
5. Provide “delete all history” and a short retention default; do not keep more detail than the recap needs.
6. Explain idle detection, sampling limits, storage location, and deletion in plain language.
7. A user must preview the card before saving. The card contains only aggregate data and no account or device identifier.

## Product language

Use “active time,” “app changes,” and “longest uninterrupted session.” Avoid “attention stolen,” “addiction,” or “productivity” claims unless the user explicitly chooses humorous copy and the interface makes clear that it is playful interpretation.

## Success criteria for the first usable build

- A user can start, pause, resume, and stop tracking without opening settings.
- A synthetic session produces exact per-app/day totals, excludes idle intervals, and respects the exclusion list.
- Restarting the app retains local totals; deleting history removes them.
- The app never stores a window title, URL, key event, screenshot, or raw process path.
- PNG export produces readable 1080×1920 and square cards, and does not transmit data.
- A code review confirms there is no network access path in the MVP.

## Name and originality

“PC Wrapped” is a temporary working title. Similar time trackers and recap cards exist, so originality must be checked before branding or public claims. The possible differentiator is a deliberately simple, private, humorous recap with a user-controlled export—not a claim that no comparable product exists.
