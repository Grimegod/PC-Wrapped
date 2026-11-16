# PC Wrapped

_A little desktop folklore._

PC Wrapped is a Windows app for a friendly daily or weekly recap of your active time across apps. It turns a few local totals into a story card you can keep or share on your terms.

**[Visit the presentation site](https://grimegod.github.io/PC-Wrapped/)** · **[Microsoft Store listing](https://apps.microsoft.com/detail/9PLJFV595G0X)** · **[GitHub releases](https://github.com/Grimegod/PC-Wrapped/releases/latest)**

[![Watch the PC Wrapped video (2:24)](https://img.youtube.com/vi/-jxWrJk0mPY/maxresdefault.jpg)](https://www.youtube.com/watch?v=-jxWrJk0mPY)

**[Watch the 2-minute video tour on YouTube](https://www.youtube.com/watch?v=-jxWrJk0mPY)**

## What it does

- Tracks which app is in the foreground and when the PC is idle. Tracking stays paused until you start it.
- Recaps today, the last 7 days, this month and this year: app time, the longest single-app stretch, app changes and your top apps,
  with fair comparisons against the previous period.
- Adds playful archetypes and comparisons to keep the recap light; it does not score your productivity.
- Exports a previewed story-size or square recap card as a PNG. Facebook, Instagram, Messenger, TikTok and Snapchat open with the card
  already copied, ready for Ctrl+V; WhatsApp, Telegram, LinkedIn and X open with a short caption.
- Speaks 35 languages, chosen automatically from the Windows display language (Arabic and Hebrew right to left); switch any time from
  the top bar.
- Light turquoise or dark blue, or follows the Windows theme.
- Counts full-screen games and films even without keyboard or mouse input (never while the PC is locked).
- Lets you exclude apps from future tracking or hide app names on cards, and export your history as CSV.

## Privacy

Your activity history stays on your PC. PC Wrapped does not require an account or send your history to a PC Wrapped server. It does not read window titles, browser URLs, screenshots, keyboard input, or document contents. Daily app aggregates are kept for up to 365 days and can be deleted from Settings.

If you choose a sharing route, the app may open an external provider with a short caption based on aggregate recap values, or copy the saved PNG to your clipboard. The app does not upload the image. See the [privacy details](https://grimegod.github.io/PC-Wrapped/privacy.html).

## Get PC Wrapped

PC Wrapped is now available in the [Microsoft Store](https://apps.microsoft.com/detail/9PLJFV595G0X). Direct Windows packages will be attached to [GitHub Releases](https://github.com/Grimegod/PC-Wrapped/releases/latest); release binaries are distributed there rather than committed to the source history.

## Run locally

Install Node.js 22 or later and pnpm (via corepack). From the repository folder:

```powershell
pnpm install
pnpm dev
```

`pnpm dev` builds the TypeScript and renderer files, then launches the app. Closing the window keeps PC Wrapped in the Windows tray; choose **Quit** from the tray menu to exit.

## Build and verify

```powershell
pnpm verify
pnpm build:portable
pnpm build:msix
```

The MSIX uses the publisher identity reserved for the Microsoft Store. The `.msixupload` file is for Partner Center submission; the `.msix` is the installable package for a GitHub Release.

## Repository and license

No license file has been published, so the repository does not currently grant reuse or redistribution rights. Issues and pull requests are welcome.
