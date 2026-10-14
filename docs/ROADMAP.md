# Push Deck: roadmap and parked ideas

Status as of 2026-10-09. Hardware is fully mapped (see `docs/PUSH2_NOTES.md`, `docs/BUTTONS.md`, `push2_registry.json`). Nothing below is built unless marked done.

## 0. Decisions (2026-10-11, from the 20-question session)

Goal: make the Push a daily-use device: control apps, show ambient info, switch profiles, always give visual feedback. Items 3 and 4 below are no longer parked; they are scheduled.

**Build order:** (1) Claude usage dashboard, (2) replica UI + profiles, (3) music now-playing + controls.

**Architecture:** Python daemon owns the Push; local web UI (React + Vite) over WebSocket; native macOS menu bar app (Swift) for profile switching and settings.

**Profiles**
- Auto-switch by frontmost app; manual override via the scene-launch buttons (select profile).
- One JSON file per profile in a project folder.
- First profiles: ChatGPT/Codex, Figma, Claude Code/terminal, Spotify/YouTube Music, Browser/Slack/Notion.
- Pads: freeform per profile (action, status tile, or both). No fixed global row.
- Encoders: first few global (volume, brightness), the rest per-profile. Touch strip: scrub/scroll per profile.
- Action types: keyboard shortcuts + typed text; launch/focus apps, open URLs; shell scripts / Shortcuts.app; media + system controls.
- Risky actions are flagged and need a second confirm press.

**Lifecycle (setting in the UI):** default start at login, always on. Alternatives: manual only; start at login but sleep with the Mac or when idle; only while the UI app is open.
**Idle/away:** fully off after idle, with one small "asleep" indicator. Any button wakes it.

**Display**
- Idle screen cycles: Claude usage dashboard, clock + date + now playing, animated screensaver.
- Per-profile themes under a shared mother theme. Mother theme rule: every one of the 16 display buttons (8 above, 8 below) gets a tiny label on the screen next to it, always visible.
- LED colors follow the profile theme; each control can override its color; state changes (active, pressed, error) override both.

**Music:** Spotify-specific design when Spotify plays, YouTube Music-specific design for YouTube Music, fallback to system-wide Now Playing. Rich media (artwork, progress, next up).

**Replica UI**
- Editing: click a control, press the physical control to select it, and drag from an action library. All three.
- Live mirror is a preview-mode toggle (off by default).

**Usage data:** Claude only first; later the active session list and cost/token history. Codex usage meters not planned yet (Codex still gets an app profile).

**Test rerun rule:** every hardware test must be rerunnable from the **Repeat** button (CC 56, white-only), which replays the last test with the same arguments. Repeat is always lit when a rerun is available (the user cannot see unlit buttons). The always-on daemon owns the listener; test scripts register themselves as "last test". After a rerun: pass/fail on the display and Repeat's color (green/red) with a one-line summary.


**Next steps:** connection check and rainbow test (all pads, buttons, display), then finish the usage dashboard.

## 1. Claude usage dashboard (in progress)

**Done**
- `claude_statusline.py` + a `statusLine` entry in `~/.claude/settings.json`: copies the 5-hour and weekly percentages and reset times to `~/.claude/push_usage.json`. Local only, no polling, no tokens.
- `push_usage_display.py`: first test UI (bars on the display, two pad-row gauges, touch-strip gauge, Record button as the warning light). Uses `usage_demo.json` until the live file exists.

**Still to verify**
- Whether `~/.claude/push_usage.json` appears after a message in a *new* session. If the desktop app's Code tab does not run status lines, use the terminal `claude` CLI, or find another trigger.

**Later: a proper UI (user's direction)**
- Designed for the display's real detail: the screen is 960x160, so text can be much smaller and denser than the first test.
- Claude branding, including a Claude crab mark. Use artwork you draw or have the right to use; do not copy brand assets from the web.
- More information beyond the two limits. The status line also receives `context_window` (size, used percentage), cost, and model, so the same tap can store them.
- **Context actions on buttons:** reset the context (clear) and compact it. Open question: how to send `/clear` or `/compact` to the right session. Options are keystrokes into the terminal (needs macOS Accessibility permission, and which session or window gets them must be unambiguous), or a Claude Code hook or command if one exists. Decide before building.
- **Refresh button:** re-read the usage file on demand. Note: the file only updates when Claude Code gets an API response, so a button cannot force fresh data without sending a request that costs usage. Decide what "refresh" should mean.
- Colors and states: green, amber, red thresholds; counting down to reset; "stale data" indicator when the file is old.

## 2. Codex usage (later)
- Same dashboard for Codex. Idea to verify first: Codex's local session logs may contain rate-limit snapshots that a script can read from disk with no login. Check a real log file before relying on it.

## 3. Music: Spotify, YouTube Music, Apple Music (later)
- Show now playing, next up, artwork on the display; Master encoder = volume; arrows or Page buttons = previous/next; Play button lit green when playing.
- Data: Spotify via AppleScript (queue via Web API); Apple Music via AppleScript; YouTube Music via a small Chrome extension; media keys as a universal control. Pad and button LEDs can use the album art's dominant color.
- First step would be a read-only feasibility check (macOS version, AppleScript support, how legible a screen crop would be).

## 4. Replica UI and profiles (main project)
- A browser UI that looks exactly like the Push 2 (our own vector drawing, with the reference photos as guidance). Every on-screen control maps to a real control; the display is mirrored.
- Python backend, web UI over a websocket, one control registry, a profile engine, an action layer. Profiles per app (Figma first).
- Step one: a mapping-check mode (press hardware, the UI control highlights; click UI, the real LED pulses).
- Reference: `reference-photos/`, `LAYOUT_FROM_PHOTOS.md`.

## 5. Open technical tests
- Send keystrokes into Figma (macOS Accessibility permission).
- Running next to Ableton Live (does it conflict?).
- Unplug/replug and sleep/wake recovery.
- Tune pad velocity curve (useful range is about 1 to 60) and decide on pressure mapping (polyphonic mode works: SysEx `1E 01`).
- Display extras: zoom/fit modes for images, dithering for the 16-bit color, finer type for dense UIs.

## Reminders
- Keep the 12 V adapter plugged in for full brightness (USB-only works but is dimmer).
- Display needs continuous frames (about 50 fps max, 30 fps reliable).

## Pending before the open-source release
- Make the app fully standalone: bundle a portable Python (python-build-standalone, arm64) instead of pointing at Xcode's Python 3.9, reinstall the libraries into it, and re-sign. Needs a download; decide with the owner first. Also consider a free/paid Apple Developer ID (signing + notarising) to remove the "unidentified developer" warning.
- Performance/size pass (measured 2026-10-12): daemon Python ~14-22 % of one core and ~400 MB RSS; WebKit GPU 40-87 % while the window is visible (animated backdrop + 30 fps display canvas), ~0 when hidden. Ideas: pause the backdrop/mirror when the window is hidden or unfocused, lower the preview frame rate, find what holds 400 MB in the daemon (icon/art caches, numpy frames), idle the display loop when nothing changes.
