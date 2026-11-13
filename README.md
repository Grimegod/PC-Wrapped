# PC Wrapped

_Your computer’s year in review. Funny, private, yours._

Ever wonder where your day actually went? PC Wrapped shows how your time splits across apps, how long you can really stay focused, and how long it takes you to get back after you get pulled away. Then it turns those numbers into a card you can share, or keep to yourself.

## What it does

- Tracks which app is in the foreground and when you are idle.
- Finds your longest focus streak and your return time after a long app visit.
- Gives you an archetype and absurd comparisons for your screen time.
- Exports a story-size or square card as a PNG, with colour emoji and a short top-three app cast.
- Offers a share hand-off for WhatsApp, Telegram, Instagram, Facebook, Messenger, LinkedIn, TikTok, Snapchat and X after you preview and save the card. Instagram, TikTok and Snapchat get the PNG on your clipboard, since they have no share page that accepts an image.
- Lets you exclude apps from future tracking or hide app names on cards.

## What it does not do

- It does not read window titles, take screenshots, or monitor keystrokes.
- It does not need an account or send activity to a server.
- Sharing opens the site in your browser, or copies the PNG for Instagram. You attach the saved image there yourself, so nothing leaves the app on its own.
- It does not judge whether your time was productive.

## Your data stays on your computer

- Only daily totals per app are stored, for up to 365 days.
- Excluded apps add no future time, switches, streak time, or return time. Existing history changes only if you separately confirm **Also remove past data**.
- Hidden apps remain in your totals and percentages but appear as **Hidden app** on cards. This is off until you choose it.
- Use **Delete all history** to remove saved activity.
- Tracking starts only when you press **Start tracking**. Start-at-login is off by default.

**Open source.** The code lives in the [PC Wrapped repository](https://github.com/Grimegod/PC-Wrapped), and the repository is public. Issues and pull requests are welcome.

**Windows first.** macOS and Linux may come later.

## Run

Install Node.js 20 or later and pnpm. Then, from this folder, run:

```powershell
pnpm install
pnpm dev
```

`pnpm dev` generates the app icons, builds the TypeScript and renderer files, and launches the app. Closing the window keeps PC Wrapped in the Windows tray; choose **Quit** from the tray menu to exit.

## Test and build

```powershell
pnpm test
pnpm build:portable
pnpm build:msix
```

Build outputs go to `release/`. The MSIX identity is a preview placeholder and must be replaced with the publisher identity reserved for the Microsoft Store before submission.
