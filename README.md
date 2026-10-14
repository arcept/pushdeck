<h1 align="center">Push Deck</h1>

<p align="center">
  Use an <b>Ableton Push 2 on its own</b> (no Ableton Live) as a customisable controller and ambient display for your Mac.
</p>

<p align="center">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-aeb0ff?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-13%2B-aeb0ff?style=flat-square">
  <img alt="Apple Silicon" src="https://img.shields.io/badge/Apple%20Silicon-ready-aeb0ff?style=flat-square">
  <img alt="Status: early" src="https://img.shields.io/badge/status-early-ffbe32?style=flat-square">
</p>

<p align="center">
  <img alt="The Push Deck window: a profile list, a replica of the Push 2 with its display, and the controls inspector" src="docs/images/app.png" width="100%">
</p>

<p align="center">
  <img alt="The Push 2 display changing between two profiles: a clock, a Claude Code session with its mascot, and usage meters" src="docs/images/display.gif" width="80%"><br>
  <sub>The real Push 2 display, recorded: the Claude Code profile (a live session with its mascot and usage meters), then ChatGPT / Codex.</sub>
</p>

- **Per-app profiles.** Pads, buttons and encoders run shortcuts, open apps and web addresses, type text, run Shortcuts or shell commands. The profile follows the app you are using, or you pin one.
- **A live display.** The 960×160 screen shows your button labels and a grid of widgets (active profile, clock, Claude and Codex usage, the browser's active tab) next to a **media player**. Arrange the widgets in Settings → Display layout, or with **Arrange display** on the picture of the screen.
- **A media player that works in every profile.** Spotify, YouTube Music (as a Chrome tab or Chrome app) and anything else macOS lists as playing: artwork, progress, play/pause, next/previous, save/like, shuffle and repeat, seek on the touch strip, a **Browse** screen for queues and playlists, and an audio visualizer.
- **A browser UI** at `http://127.0.0.1:8472` with a replica of the Push: edit profiles by clicking a pad, mirror the display, change settings.
- A small **menu bar app** (Swift) to pin a profile, open the UI, and turn the Push on or off.

Everything runs on your Mac. Nothing is synced to a server, and there are no accounts to create.

> Push Deck is an independent project, **not affiliated with, endorsed by, or sponsored by Ableton AG**. "Ableton" and "Push" are trademarks of Ableton AG. See [NOTICE.md](NOTICE.md).

## A look around

<p align="center">
  <img alt="First-run setup, welcome step" src="docs/images/setup-welcome.png" width="48%">
  <img alt="First-run setup, permissions step" src="docs/images/setup-permissions.png" width="48%">
  <br><sub>First-run setup: it checks your Push, asks for the few macOS permissions it needs, explains each one, and offers a quick tour.</sub>
</p>

<p align="center">
  <img alt="The menu bar panel, three tabs" src="docs/images/menu-bar.png" width="90%">
  <br><sub>The menu bar panel: pin a profile, switch the player, set brightness, turn the Push on or off.</sub>
</p>

## Status and contributing

Push Deck is young and built by one person. **Issues are open**: bug reports, ideas and hardware notes are welcome. **Pull requests are by invitation only for now**, so please open an issue first and we can talk about it.

## What you need

**To use the released app:** an Apple Silicon Mac with macOS 13 or newer, and an **Ableton Push 2** connected over USB (the original Push and Push 3 are not supported). That is all. The app carries its own Python, libraries and helpers, so you do not install Python, Homebrew, Xcode or anything else. Two features need a newer macOS: the music visualizer needs macOS 14.2, and the system "now playing" reader needs macOS 15.4 or newer to work as built.

Some features use apps you already have, and are simply off without them: Google Chrome (tab and YouTube Music info), Spotify, and the Claude desktop app (live usage).

**To build from source:** Python 3.9 or newer, Node 18 or newer, [Homebrew](https://brew.sh) (for `libusb`) and the Xcode command line tools (`xcode-select --install`, for the Swift compiler). `./install.sh` fetches its own pinned Python for the app, so the Python on your machine only matters for the dev setup.

## Install

Ready-made downloads (an unsigned `.dmg`, a Homebrew cask and a one-line installer) are planned with the first release. Until then, build it yourself.

**Run from source**

```bash
brew install libusb
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ui && npm install && npm run build && cd ..
./run_daemon.sh
```

Then open <http://127.0.0.1:8472>. Keep the terminal open; closing it stops the daemon. To use another port, set `PUSH_PORT`.

**Build and install the app**

```bash
./install.sh
```

This builds the standalone "Push Deck.app" (it contains the daemon, the UI and its own Python environment) and puts it in `/Applications`. It asks before replacing an installed copy, and offers to quit and relaunch it. The build leftovers live in the git-ignored `build/` folder. The app opens the UI in its own window and keeps your settings and profiles in `~/Library/Application Support/Push Deck`. Its Settings tab has an "Open at login" switch.

Push Deck is signed ad hoc (there is no paid Apple Developer ID behind it), so macOS calls it an unidentified developer the first time. **Right-click the app, choose Open, then Open again.** You only do this once.

### macOS permissions

macOS asks the first time a feature needs one. Allow them for the app you launch Push Deck from (Push Deck.app, or Terminal if you run from source):

| Permission | Needed for |
| --- | --- |
| **Accessibility** | pads and buttons that send keyboard shortcuts or text |
| **Automation** (Spotify, Google Chrome, System Events) | reading and controlling players |
| **System audio capture** | the optional audio visualizer (the audio is analysed on your Mac and never recorded) |

## Using it

**Profiles.** Click a profile in the browser UI, then click any pad, button or encoder on the replica and give it a name, an icon and an action. Profiles are plain JSON in `profiles/`; you can export and import them from the UI. A profile follows the app it is made for (Auto), or you press its scene button to make it the Master.

**Global encoders.** In every profile the Swing encoder changes display and pad brightness together and the Master encoder sets the system volume. You can reassign them in Settings → Knobs.

### Media player

The **Layout** button turns the player **On** or **Off**. On, it takes half the display (4 columns by 2 rows; choose the left or right side in Settings → Media) and your profile's widgets use the other half. Off, the widgets use the whole display.

- **Players:** Spotify (desktop app), YouTube Music, and anything else macOS shows in Now Playing (a video in a Chrome tab, Music, VLC, ...). The display stays on the player you are using until another one starts playing.
- **Buttons:** lower row Play, Prev, Next, Save/Like; upper row Shuffle, Repeat and Browse. The touch strip seeks.
- **Colours:** the player's interface uses the source's colour (Spotify green, YouTube Music red). When nothing plays it shows the last track or "Nothing playing" (Settings → Media).
- **Browse:** shows the queue and your playlists on one half of the display and keeps the player on the other. Encoders above the list scroll it, Select goes into a playlist, Favorite stars a playlist so it shows under Favorites.

**Chrome and YouTube Music.** Turn on Chrome's **View → Developer → Allow JavaScript from Apple Events**. Without it only the tab title can be read. YouTube Music has no official API, so the queue and playlists are read from your own signed-in YouTube Music tab; this can stop working when YouTube changes its page.

**Spotify (optional).** Without signing in, Spotify's desktop app is read and controlled like any other player. Signing in adds Save, the queue and your playlists, and does not need Spotify Premium for those. In the UI, Settings → Media explains it step by step:

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add the redirect address `http://127.0.0.1:8472/spotify/callback`.
3. Paste its **Client ID** into Settings → Media → Spotify and press Connect.

Only the Client ID is needed (PKCE sign-in, no secret). Tokens are stored in `private/spotify.json` on your Mac and nothing is sent anywhere except to Spotify. Because of Spotify's rules for apps in development mode, the app can open the songs of playlists you made or share, but not other people's; those can still be played.

### Claude and Codex usage

The usage widgets show Claude's 5-hour and weekly limits and Codex's rate limits.

- **Codex** comes from its local session logs (`~/.codex/sessions`). Nothing leaves your Mac.
- **Claude, live (Settings → General, `claude_usage_live`):** Push Deck reads the login that the Claude desktop app already has on your Mac (an encrypted token cache, unlocked with the "Claude Safe Storage" Keychain item; macOS asks once) and asks `api.anthropic.com` for your usage about every 90 seconds. The token is held in memory only, is never written to disk or logged, is sent to no one else, and is never refreshed by Push Deck. Turn the setting off and it stops. It is the only feature that touches a login, and the first-run setup will ask you before it is used.
- **Claude, no login:** point Claude Code's status line at `claude_statusline.py`. It writes a small local file (`~/.claude/push_usage.json`) that the display reads. Nothing is polled and no tokens are used.

## Privacy and security

- The daemon only listens on `127.0.0.1`.
- No analytics, no cloud service, no account of ours.
- The only network traffic is to the services you connect: Spotify (if you sign in), `api.anthropic.com` (live Claude usage, if enabled) and the pages you have open in your own Chrome.
- Credentials you enter (the Spotify Client ID and its tokens) live in `private/` on your Mac, which is git-ignored.
- Shell-command actions run exactly what you wrote in a profile. Only import profiles you trust.

## Known limits

- Spotify's queue endpoint returns at most about 20 upcoming songs; playlists load up to 500 songs.
- YouTube Music browsing needs the YouTube Music tab open in Google Chrome.
- "What is playing" for other players uses Apple's private MediaRemote framework, which Apple can change in any macOS update.
- Media keys: after you use the YouTube Music app window, Chrome keeps sending the keyboard media keys to it while that window is in front. That is Chrome and macOS behaviour, not this project.

## Project layout

| Path | What it is |
| --- | --- |
| `daemon/push_daemon/` | the Python daemon: USB/MIDI device, profiles engine, display renderer, media (`media/`), WebSocket and HTTP server |
| `daemon/audiotap/`, `daemon/nowplaying/` | small native helpers (an audio tap for the visualizer, and the "what is playing" lookup), built on first use |
| `ui/` | the browser UI (React, Vite, TypeScript); `ui/src/display/render.ts` mirrors the daemon's display renderer |
| `menubar/` | the Swift menu bar app |
| `profiles/` | example profiles |
| `docs/` | working notes: [PUSH2_NOTES.md](docs/PUSH2_NOTES.md) (every verified fact about the Push 2 hardware and design notes per feature), [ROADMAP.md](docs/ROADMAP.md), [DESIGN.md](docs/DESIGN.md), [PRODUCT.md](docs/PRODUCT.md), [BUTTONS.md](docs/BUTTONS.md) |
| `button_names.json`, `push2_registry.json` | control maps |
| `experiments/` | the original hardware experiments and test scripts (not used by the app) |
| `design/` | logo, icon and fonts (SIL Open Font License) |

## Development

**Dev mode is the test version.** `./dev.sh` runs the daemon from this folder (with the repo's own `settings.json` and `profiles/`) and rebuilds the UI on every save. Test there; run `./install.sh` once you are happy with it.

```bash
./dev.sh                    # the test version: daemon + UI rebuilt on save, at http://127.0.0.1:8472
cd ui && npm run dev        # alternative: the UI with hot reload; it proxies /ws to the daemon
cd ui && npm run build      # type-checks, then builds ui/dist (served by the daemon)
PYTHONPATH=daemon .venv/bin/python -m push_daemon.display.tokens   # rewrite ui/src/display/tokens.json from the Python design tokens
```

The display is drawn twice on purpose: `daemon/push_daemon/display/render.py` draws what the Push shows, and `ui/src/display/render.ts` draws the same scene in the browser. Change both together. Restart the daemon after any Python change.

## Licence

[MIT](LICENSE), copyright Arcept. Fonts and other third-party pieces are credited in [NOTICE.md](NOTICE.md).

Built with AI assistance.
