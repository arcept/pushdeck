# Push Deck

Use an **Ableton Push 2 on its own** (no Ableton Live) as a customisable controller and ambient display for your Mac.

- **Per-app profiles.** Pads, buttons and encoders run shortcuts, open apps and web addresses, type text, run Shortcuts or shell commands. The profile follows the app you are using, or you pin one.
- **A live display.** The 960×160 screen shows your button labels and a grid of widgets (active profile, clock, Claude and Codex usage, the browser's active tab) next to a **media player**. Arrange the widgets in Settings → Display layout, or with **Arrange display** on the picture of the screen.
- **A media player that works in every profile.** Spotify, YouTube Music (as a Chrome tab or Chrome app) and anything else macOS lists as playing: artwork, progress, play/pause, next/previous, save/like, shuffle and repeat, seek on the touch strip, and a **Browse** screen for queues and playlists.
- **A browser UI** at `http://127.0.0.1:8472` with a replica of the Push: edit profiles by clicking a pad, mirror the display, change settings.
- A small **menu bar app** (Swift) to pin a profile, open the UI, and turn the Push on or off.

Everything runs on your Mac. Nothing is synced to a server, and there are no accounts to create (Spotify's optional sign-in is described below).

> Push Deck is an independent project, **not affiliated with, endorsed by, or sponsored by Ableton AG**. "Ableton" and "Push" are trademarks of Ableton AG. See [NOTICE.md](NOTICE.md).

## What you need

- A Mac (the project is macOS only) and an **Ableton Push 2** connected over USB.
- Python 3.9 or newer, Node 18 or newer, [Homebrew](https://brew.sh), and the Xcode command line tools (`xcode-select --install`): two tiny helpers are compiled the first time they are needed.

## Install

```bash
brew install libusb
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ui && npm install && npm run build && cd ..
./run_daemon.sh
```

Then open <http://127.0.0.1:8472>. Keep the terminal open; closing it stops the daemon. To use another port, set `PUSH_PORT`.

Optional pieces:

- **The app:** `menubar/build_app.sh --install` builds the standalone "Push Deck.app" into `/Applications`. It contains the daemon, the UI and its own Python environment, opens the UI in its own window, and keeps your settings and profiles in `~/Library/Application Support/Push Deck`. Open it. Its Settings tab has an "Open at login" switch. It is signed ad hoc, so macOS still calls the developer unidentified (that needs a paid Apple Developer ID). `menubar/make_icon.py` redraws the icon and the browser favicon.
- **Start at login:** turn on "Open at login" in the app's menu bar panel.
- **Claude usage on the display:** point Claude Code's status line at `claude_statusline.py`. It writes a small local file that the display reads. Nothing is polled and no tokens are used.

### macOS permissions

macOS asks the first time a feature needs one. Allow them for the app you launch the daemon from (Terminal, iTerm, ...):

| Permission | Needed for |
| --- | --- |
| **Accessibility** | pads and buttons that send keyboard shortcuts or text |
| **Automation** (Spotify, Google Chrome, System Events) | reading and controlling players |

## Using it

**Profiles.** Click a profile in the browser UI, then click any pad, button or encoder on the replica and give it a name, an icon and an action. Profiles are plain JSON in `profiles/`; you can export and import them from the UI. A profile follows the app it is made for (Auto), or you press its scene button to make it the Master.

**Global encoders.** In every profile the Swing encoder changes display and pad brightness together and the Master encoder sets the system volume. You can reassign them in Settings → Knobs.

### Media player

The **Layout** button turns the player **On** or **Off**. On, it takes half the display (4 columns by 2 rows; choose the left or right side in Settings → Media) and your profile's widgets use the other half. Off, the widgets use the whole display.

- **Players:** Spotify (desktop app), YouTube Music, and anything else macOS shows in Now Playing (a video in a Chrome tab, Music, VLC, ...). The display stays on the player you are using until another one starts playing.
- **Buttons:** lower row Play, Prev, Next, Save/Like; upper row Shuffle, Repeat and Browse. The touch strip seeks.
- **Colours:** the player's interface uses the source's colour (Spotify green, YouTube Music red). When nothing plays it shows the last track or "Nothing playing" (Settings → Media).
- **Usage widgets:** Claude's 5-hour and weekly limits fill in once Claude Code has run its status line in a terminal (see below); Codex's come from its local session logs. Neither talks to a server.
- **Browse:** shows the queue and your playlists on one half of the display and keeps the player on the other. Encoders above the list scroll it, Select goes into a playlist, Favorite stars a playlist so it shows under Favorites.

**Chrome and YouTube Music.** Turn on Chrome's **View → Developer → Allow JavaScript from Apple Events**. Without it only the tab title can be read. YouTube Music has no official API, so the queue and playlists are read from your own signed-in YouTube Music tab; this can stop working when YouTube changes its page.

**Spotify (optional).** Without signing in, Spotify's desktop app is read and controlled like any other player. Signing in adds Save, the queue and your playlists, and does not need Spotify Premium for those. In the UI, Settings → Media explains it step by step:

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add the redirect address `http://127.0.0.1:8472/spotify/callback`.
3. Paste its **Client ID** into Settings → Media → Spotify and press Connect.

Only the Client ID is needed (PKCE sign-in, no secret). Tokens are stored in `private/spotify.json` on your Mac and nothing is sent anywhere except to Spotify. Because of Spotify's rules for apps in development mode, the app can open the songs of playlists you made or share, but not other people's; those can still be played.

## Privacy and security

- The daemon only listens on `127.0.0.1`.
- No analytics, no cloud service, no account of ours.
- Credentials you enter (the Spotify Client ID and its tokens) live in `private/`, which is git-ignored.
- Usage is read from local files only (`~/.claude/push_usage.json`, `~/.codex/sessions`).
- Shell-command actions run exactly what you wrote in a profile. Only import profiles you trust.

## Known limits

- Spotify's queue endpoint returns at most about 20 upcoming songs; playlists load up to 500 songs.
- YouTube Music browsing needs the YouTube Music tab open in Google Chrome.
- Media keys: after you use the YouTube Music app window, Chrome keeps sending the keyboard media keys to it while that window is in front. That is Chrome and macOS behaviour, not this project.
- Only the Push 2 is supported (the original Push and Push 3 are not).

## Project layout

| Path | What it is |
| --- | --- |
| `daemon/push_daemon/` | the Python daemon: USB/MIDI device, profiles engine, display renderer, media (`media/`), WebSocket and HTTP server |
| `daemon/audiotap/`, `daemon/nowplaying/` | small native helpers ("what is playing" lookup, and an audio tap that is no longer used), built on first use |
| `ui/` | the browser UI (React, Vite, TypeScript); `ui/src/display/render.ts` mirrors the daemon's display renderer |
| `menubar/` | the Swift menu bar app |
| `profiles/` | example profiles |
| `PUSH2_NOTES.md` | every verified fact about the Push 2 hardware (SysEx, MIDI, USB, display, strip, power) and design notes for each feature |
| `BUTTONS.md`, `button_names.json`, `push2_registry.json` | control maps |
| `experiments/` | the original hardware experiments and test scripts (not used by the app) |
| `design/` | fonts (SIL Open Font License) and design references |

## Development

```bash
cd ui && npm run dev        # the UI with hot reload; it proxies /ws to the daemon
cd ui && npm run build      # type-checks, then builds ui/dist (served by the daemon)
PYTHONPATH=daemon .venv/bin/python -m push_daemon.display.tokens   # rewrite ui/src/display/tokens.json from the Python design tokens
```

The display is drawn twice on purpose: `daemon/push_daemon/display/render.py` draws what the Push shows, and `ui/src/display/render.ts` draws the same scene in the browser. Change both together. Restart the daemon after any Python change.

## Licence

A licence has not been chosen yet. Add a `LICENSE` file before publishing; see [OPEN_SOURCE_CHECKLIST.md](OPEN_SOURCE_CHECKLIST.md) for the other things to check first.
