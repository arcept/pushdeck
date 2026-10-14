# Ableton Push 2 — standalone control notes (no Ableton Live)

Everything below was **tested on this unit** (macOS, Python 3.9, Push 2 over USB) unless marked *unverified*.
Date of testing: 2026-10-09.

## Setup

- USB: vendor `0x2982`, product `0x1967`. Appears as USB 2 high speed, requests 500 mA.
- MIDI ports: `Ableton Push 2 Live Port` and `Ableton Push 2 User Port`.
- Python env: see `requirements.txt` (`mido`, `python-rtmidi`, `pillow`, `pyusb`, `numpy`). Display needs `brew install libusb`.
- Do not run Ableton Live at the same time (it also drives the display / ports) — *not tested yet*.
- Create a fresh venv wherever the project ends up (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`). The old `.venv` is not portable.

## MIDI mode (important)

By default the Push ignores LED messages on the User Port. Set the MIDI mode first:

    SysEx  F0 00 21 1D 01 01 0A <mode> F7      mode: 0 = Live, 1 = User, 2 = Dual

We use **Dual (2)**. Pads, buttons, encoders and touch all arrive on the **User Port**.
(Encoder touch and pad pressure also arrive on the Live Port; button presses did not.)

All SysEx below uses the prefix `F0 00 21 1D 01 01 <command> ... F7`.

## Pads (8x8)

- Notes **36 (bottom-left) to 99 (top-right)**, 8 per row, row-major from the bottom. `idx = note - 36`, `row = idx // 8` (0 = bottom), `col = idx % 8`.
- LED: send `note_on`, channel 0, note = pad, velocity = **palette index** (0 = off).
- Palette: 128 entries. Redefine one with SysEx `03 <idx> <r_lo r_hi> <g_lo g_hi> <b_lo b_hi> <w_lo w_hi>` where each value 0-255 is split into 7-bit low and high bytes (`lo = v & 0x7F`, `hi = v >> 7`). Then reapply with SysEx `05`. A palette change only shows after `05`.
- Per-pad colors: give each pad its own palette entry (used entries 1-64) and update entry + reapply. Worked smoothly.
- Velocity: observed 1-102 in tests, but **practical range for this user is about 1-60** (max seen in normal play 57-75). Very small values (1-5) are light contact.
- Release: `note_off`, or `note_on` with velocity 0.
- **Animations (verified, visibly different per channel):** set the pad to colour A on channel 0, then send `note_on` on MIDI channel 1-15 with colour B: ch 1-5 one-shot transitions, ch 6-10 pulsing, ch 11-15 blinking (timing per spec is clock-based; exact rates not measured).

## Pad pressure (aftertouch)

- Default is **channel pressure**: effectively unusable (max ~3 seen).
- Switch to **polyphonic**: SysEx `1E 01` (channel = `1E 00`). Verified: poly mode gave up to 127 per pad, one message stream per pad (`polytouch`, note = pad).
- Use poly mode. Each message includes the pad's note number.

## Buttons (CC, channel 0)

Press = value > 0 (127), release = 0. LED: send the same CC with value = palette index.

### RGB buttons (verified by eye, took red/green/blue/white)
- Row below display: CC **20-27**
- Row above display: CC **102-109**
- Scene launch column (right of pads): CC **36-43**
- CC **60** Mute, **61** (called "Stop" by user; spec says Solo), **29** Stop Clip, **85** Play, **86** Record, **89** Automate

### White-only (brightness only; did not show color when RGB was sent with white channel 0)
- CC **3, 9, 28, 35, 44, 45, 46, 47, 87, 88, 90, 110, 111, 112, 113, 116, 117, 118, 119** (assumed white-only; seen lit white)
- Newly found later (all white-only): CC **30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63**
- Total mapped buttons: 65 (+11 encoders)
- **All 65 buttons are named and verified on the device** (name viewer run, 2026-10-09). Full CC -> name table: `BUTTONS.md` (source: `button_names.json`). Physical layout: `LAYOUT_FROM_PHOTOS.md` and `reference-photos/`.
- Confirmed by photos: CC 55 is **Octave Up**; CC 61 is **Solo**; CC 90 is **Fixed Length**; arrows are CC 46 Up, 47 Down, 44 Left, 45 Right.

To light a white-only button use a palette entry with the white channel set (e.g. entry 100 = r,g,b,w all 255). Pure RGB entries (w = 0) do not light white-only buttons.

## Encoders (11 on the top row, left to right)

| Pos | Control | Rotation CC | Touch note | Notes |
|---|---|---|---|---|
| 1 | Tempo | 14 | 10 | stepped / clicky (few events) |
| 2 | Swing | 15 | 9 | free spin |
| 3-10 | Encoder 1-8 | 71-78 | 0-7 | free spin |
| 11 | Master | 79 | 8 | free spin |

- Rotation is **relative**: clockwise = `1` (2 when fast), counter-clockwise = `127` (126 when fast). Convert with `step = v if v < 64 else v - 128`.
- Touch = `note_on` velocity 127 (touch) and velocity 0 / `note_off` (release).
- Free-spinning encoders send hundreds of events per turn; Tempo sends few.

## Touch strip

- Touch: note **12**, `note_on` velocity 127; release velocity 0.
- Position: **pitch bend**, -8192 (bottom) to about +8191 (top). Returns to 0 on release.
- **LEDs (verified):** 31 LEDs, bottom = LED 0, top = LED 30. White only; each LED value 0-7 is a *brightness step* on this unit (spec calls it a colour index), 0 = off.
  - Configure first: SysEx `17 63` (bit0 host controls LEDs, bit1 host sends SysEx, bit5 autoreturn, bit6 to centre). Documented default is `17 68`; restore it when done.
  - Set LEDs: SysEx `19` + 16 bytes; `byte[i] = led[2i] | (led[2i+1] << 3)` (LED 30 alone in byte 15). Verified: sweep and finger-follow both work.
  - Mistake to avoid: config bit 1 must be 1 or the Push ignores the LED SysEx (my first attempt used `17 41` and nothing lit).

## Display

- 960 x 160, USB bulk transfer, **endpoint 0x01**, interface 0 (use pyusb, `usb.util.claim_interface`).
- Frame header (16 bytes): `FF CC AA 88` followed by 12 zero bytes.
- Pixel data: RGB565 little-endian, **per pixel `(b & 0xF8) << 8 | (g & 0xFC) << 3 | (r & 0xF8) >> 3`** (verified: colors correct).
- Each line is 2048 bytes (1920 used + 128 filler) x 160 lines = 327,680 bytes, sent in 16,384-byte chunks.
- Every byte is XORed with the repeating mask `E7 F3 E7 FF` (shape/coding mask from the spec).
- The display **goes blank when frames stop**: keep sending (we resend at 20-50 ms intervals).
- Frame rate measured: **~56 fps** USB transfer only, **~53 fps** with Pillow drawing + conversion each frame (render+convert costs about 1 ms). Worst single frame ~50 ms.
- Display brightness: SysEx `08 <lo> <hi>`, 0-255 (verified).

## LED brightness

- SysEx `06 <0-127>` (verified). Display and LED brightness both reached max (255 / 127) on the adapter.

## Power

- Tested: 12 V adapter + USB: full brightness. USB only: everything works (no disconnect, no flicker) but **pads, buttons and display are all dimmer**. Same on two different USB hubs.
- Mac reports "Current Required 500 mA" regardless of port; extra amperage on a hub port needs a charging handshake the Push does not do. Switching to USB-3/USB-C is not expected to help (device is USB 2).
- Keep the adapter plugged in for full brightness.

## Files in this folder

- `push_hello.py` — rainbow pads + display text; also exports helpers (`sysex`, `set_palette_entry`, `send_frame`, `font`, ...) imported by other scripts.
- `push_buttons.py`, `push_probe.py`, `push_probe_rest.py` — find button CCs and test LED types.
- `push_encoder_check.py` — guided one-at-a-time encoder mapping (Mac speaks the names).
- `push_strip_pads_check.py` — guided touch strip + pad check.
- `push_pressure_diag.py` — channel vs polyphonic pressure diagnostic.
- `push_power_test.py` — max-load LED/display test (power).
- `push_brightness.py`, `push_control.py` — encoder-driven brightness / hue.
- `push_pads.py` — velocity -> brightness, pressure (poly) -> hue per pad, live numbers on display.
- `buttons_seen.json`, `button_map.json`, `encoders_seen.json`, `encoders_seen_2.json` — raw results.
- `push2_registry.json` — consolidated control registry (start of the project's source of truth); now includes all 65 button names.
- `button_names.json`, `BUTTONS.md` — final button names; `button_press_order.json`, `column_left.json`, `column_right_of_pads.json`, `right_cluster.json` — raw sweep results.
- `push_name_sweep.py`, `push_column_sweep.py` — record button press order; `push_name_viewer.py` — shows pressed button's name on the display; `push_fps.py`, `push_extras.py`, `push_strip.py` — frame rate, pad animations, strip LEDs.
- `ROADMAP.md` — parked ideas and later scope (Claude usage UI, Codex, music, replica UI).
- `claude_statusline.py`, `push_usage_display.py`, `usage_demo.json` — Claude usage tap and first display test; `push_media.py`, `push_image_viewer.py`, `push_display_test.py` — media, images, display calibration.
- `LAYOUT_FROM_PHOTOS.md`, `reference-photos/` — physical layout measurements and the three reference photos.

## Not yet tested / open

- Running alongside Ableton Live.
- Unplug/replug handling; sleep/wake.
- Sending keystrokes into Figma (macOS Accessibility permission).
- Velocity curve / pad sensitivity tuning.

## Project idea

A Python app with a UI that looks exactly like the Push 2: every on-screen control maps to the real control; touch strip, encoders and the display are mirrored; per-app profiles later. See the scoping discussion: Python backend + web UI over a websocket; one control registry; profile engine; action layer; render the display frame once and send to both the Push and the UI.

## Project scaffold (2026-10-11)
- `daemon/push_daemon/`: `registry.py` (141 control ids, shared with UI/SVG), `device.py` (MIDI/USB/LED palette/display, hotplug watcher), `engine.py` (events, profiles, sleep, tests, Repeat), `scenes.py` (mother theme: 16 button labels), `profiles.py`, `actions.py`, `tests_runner.py`, `server.py` (WebSocket `/ws` + serves `ui/dist` on 127.0.0.1:8472).
- `ui/` React+Vite+TS (`npm run build`; dev `npm run dev` proxies /ws). Placeholder replica in `Replica.tsx`/`layout.ts` until the real SVG arrives (ids identical).
- `menubar/` Swift package (`swift build`), `run_daemon.sh`, `com.arcept.pushdeck.daemon.plist` (LaunchAgent, NOT installed yet).
- Verified: daemon start, WS hello (141 controls), rainbow test PASS via WS, UI renders. Not yet verified by eye/hands: Repeat press rerun, sleep/wake, risky confirm, press-to-select, scene-button pinning.
- Known gaps: power-cable signal unknown (reported as `null`); `login_sleep` does not yet react to Mac sleep (only idle timeout); `ui_only` lifecycle not enforced.

## Display labels, SVG replica, mirror (2026-10-11)
- Label zones: 16 zones, each as wide as its button (105 px, centred in the 120 px column; measured from the SVG: button 96 SVG px = 105 device px), 34 px tall, upper row at the top edge, lower row at the bottom edge. Content = small icon (13 px) above a one-line label (12 px bold, max 12 chars); filled accent tab when active/pressed; empty slots show a faint marker. Code: `scenes.zone()` (Python) and `displayRenderer.ts` (browser), icons shared in `daemon/push_daemon/icons.json` (profile controls take `"icon": "<name>"`). Font is still Helvetica Neue; final font pending the 67-font specimen (`design/font_specimen.html`, served with `cd design && python3 -m http.server 8801`).
- Replica SVG: `ui/src/assets/push2.svg` (original vector drawing). Ids: `<id>`, `<id>-base`, `<id>-led`; arrows are `arrow-up/down/left/right`, pages `btn-page-left/right` (registry renamed to match). Pads render light grey (ChatGPT's inferred unlit look); may want darker.
- Display mirror modes in the UI: Re-render (browser draws scene JSON from the daemon), Stream (daemon sends JPEG frames ~8 fps over the WebSocket), Off, plus Pause. Verified rendering in both modes in the browser pane.
- Not yet done: font choice, usage dashboard completion, profile editing of icons (Editor has no icon picker yet), power-cable signal.

- Power-cable detection removed from daemon and UI (no signal exists). USB unplug detection remains.
- Font shortlist (2026-10-11): IBM Plex Sans Condensed, Manrope, Figtree, IBM Plex Sans, Quicksand, IBM Plex Mono, Pixelify Sans, DotGothic16, Instrument Sans, Bricolage Grotesque. Rejected: all Sci-fi/instrument fonts.

## Fonts and label zones, final form for now (2026-10-11)
- Temporary fonts (decision may change): **Quicksand** for names/labels/titles, **IBM Plex Mono** for numbers (clock, percentages, values). Files in `design/fonts/` (OFL, from github.com/google/fonts); copied to `ui/public/fonts/` for the browser mirror. Switch with `scenes.set_fonts(label=..., mono=...)` (packs: plexmono, quicksand, instrument, plexsans) and `setFonts` in `displayRenderer.ts`.
- Label zone = **single row**: optional icon (left) + label, centred in a 105x34 zone. Label is the priority and **ALL CAPS by default** (`"keep_case": true` on a control keeps your capitalization). Fit rule: shrink text 15 to 11 px, then drop the icon, then truncate with "...". Icon-only zones are allowed (22 px icon). The UI editor has an icon picker and a keep-capitalization checkbox.
- Preview images: `design/label_zones_final.png`, `design/font_mocks.png`.

## Colour calibration (2026-10-11)
- `daemon/push_daemon/color.py`: every display frame passes through a calibration before RGB565 (identity by default): picked primaries for red/green/blue plus a saturation multiplier, stored in `settings.json["calibration"]`. LEDs on pads/buttons are NOT affected (separate palette). The browser mirror and JPEG stream show uncalibrated frames.
- Tests (all rerunnable with Repeat): `cal_red` and `cal_green` show 10 swatches each (a hue sweep around the primary); press the button under the truest one (levels 1-8 = upper row, 9-10 = first two lower buttons; the buttons' own LEDs show the same colours for comparison). `cal_blue` (same idea), `cal_all` runs red, green, blue, then saturation as a guided sequence; `cal_saturation` shows the same sample palette at x1.0 to x1.9. The UI has Calibrate buttons, a saturation slider and Reset.
- Fonts swapped: Quicksand = main (labels, titles, big numbers), IBM Plex Mono = secondary (captions, subtitles, dates, hints).
- Colour calibration can be started any time: UI Settings card 'Color calibration test', menu bar item, or Shift+Setup on the Push (Setup is kept lit dim white).
- RULE: display background is always pure black (no theme background colour); profile themes supply an accent only.

## Global knobs + HUD (2026-10-11)
- Zone labels (the 16 button labels) always use **IBM Plex Mono**; Quicksand stays for titles and big numbers.
- Global controls, active in every profile (profiles cannot override them): **Tempo knob = display brightness** (SysEx `08`), **Swing knob = pad & button LED brightness** (SysEx `06`), **Master knob (top right) = system volume** (osascript). Mapping is `settings.json["global_knobs"]` (no UI editor yet). Step = 2 % per encoder tick; touching a knob also shows its current value.
- Popup HUD: icon + name + bar + value, centred over the current scene for 1.4 s (`scenes.draw_hud`, `displayRenderer.ts drawHud`). Mirrored in the browser.
- Brightness values persist (saved after the popup fades) and are re-applied when the Push reconnects. Software colour scaling for LED brightness was removed (hardware does it).
- WS message `{"type":"input","event":{...}}` injects a synthetic hardware event (used for testing without the device).

## Knob reassignment, volume bug, standby (2026-10-11, supersedes the "Global knobs" mapping above)
- **Unused encoders (user rule):** Tempo, Swing (far left) and Master (far right) are ignored entirely. Global knobs now: **Encoder 1 = display brightness, Encoder 2 = pad & button brightness, Encoder 8 = system volume** (`settings.json["global_knobs"]`).
- **Volume bug investigation:** with nothing touched, the Push sent 0 MIDI events in 20 s (so no hardware noise at idle). Likely software causes, now fixed: (1) one un-queued `osascript` per tick could land out of order, so volume drifted for seconds after a turn; (2) a cached volume overwrote the real one (any zero-value event reset the Mac to the stale value). New `volume.py`: ticks are summed and applied by ONE worker relative to the real current volume (read just before each change). Guards: turns from a knob without its touch sensor are ignored (`require_touch`), value 0 and |value| > 20 are ignored. Every global-knob event is logged to `/tmp/push_knob_events.log` (ok/IGNORED) to diagnose a faulty encoder.
- **Verified by simulated events:** untouched turn ignored, Master ignored, touched turns +/-2 applied and the volume returned to exactly its starting value.
- **Standby ("Turn Push off"):** UI header button (two-step confirm) and menu bar item. Blanks display, LEDs off, releases USB/MIDI, ignores all input; saved in `settings.json["standby"]` so it survives daemon restarts. The Push cannot be powered off by software.
- **Hover tooltips** in the UI show each control's assignment (profile label/action, global knob, scene-button profile, reserved controls).

## Ports (2026-10-11)
- Push daemon + UI: **http://127.0.0.1:8472** (env `PUSH_PORT` overrides). It used to be 8765, which collides with other common local dev servers.
- Standby fix: LEDs force-cleared (cache bug), display shows 'TURNED OFF FROM THE BROWSER UI'; SVG <title>/<desc> stripped to remove the duplicate native tooltip.

## UI redesign + display design system (2026-10-11)
- Product record `PRODUCT.md`, design record `DESIGN.md`.
- Web UI (ui/src): TopBar (device chip, profile switcher, pin, search/palette, settings, turn off), ProfileRail (library: search, scene-button slots, new/import), Stage (replica + display-mirror modes "Drawn here / Real display / Off" + pause, "Follow the Push" switch, action tray), Rings (value ring, icon and number under Encoders 1/2/8, pad names), Inspector (function first: action, display label/icon, colour, safety; ProfilePanel when nothing is selected: name, colour, slot, app rules, duplicate/export/delete), SettingsSheet (General, Display and lights, Knobs, Colour calibration, Tests, Device), Palette (Cmd+K), autosave of profiles. Tests list comes from the daemon (`TESTS_META` in tests_runner.py).
- Hover tooltip: function first ("Display brightness"), then small mono lines ("Encoder 1 · works in every profile").
- Display system: `daemon/push_daemon/display/` (tokens.py is the source of truth; `python -m push_daemon.display.tokens` regenerates `ui/src/display/tokens.json`), scene specs from library.py, drawn identically by render.py and ui/src/display/render.ts. Preview: `design/display_system_sheet.png`. Captions/notes are 13-14 px in a brighter grey for desk-distance legibility.
- Knob log check (09:46): one deliberate-looking burst of ~150 turns on knob-8 at 09:29, no idle events; Mac volume was 100 afterwards.

## Round of UI fixes (2026-10-11)
- Overlays (knob rings, pad names, display-button labels) now live inside the SVG's `#device-space` group (it carries translate(-33.8 12.4) scale(1.042)); drawing outside it misaligned everything. Verified: ring centre = knob centre, label centre = pad centre.
- Ableton logo removed from `ui/src/assets/push2.svg` (replaced by a small project mark `#project-mark`); see `NOTICE.md` and `OPEN_SOURCE_CHECKLIST.md`. Ableton's own page says the name and logo are trademarks of Ableton AG and gives no third-party rules.
- Knob sensitivity: step = 100 / (turns_full_range x ticks_per_turn) per tick (defaults 2.5 turns, 128 ticks, an ESTIMATE). Run Settings > Knobs > Measure (test `knob_sensitivity`: turn Encoder 8 one full turn, press Select) to store the real ticks per turn. Volume accumulates fractional ticks in `volume.py`.
- The daemon now broadcasts settings ~10x/s while a global knob turns, so the UI ring follows live. "Follow the Push" is on by default.
- Layout stability rule: any state-dependent text uses `<Stable>` (all variants share one cell) or a fixed-width box; banners are overlays (no reflow). Toolbar hovers use `<Tip>` (no native title attributes).
- Quick edit popup (`QuickPop.tsx`) opens beside a control when clicked on the replica.

## Frontmost app detection (macOS)
- `NSWorkspace.frontmostApplication()` goes stale in a process that never runs an AppKit run loop (the daemon): it stays on whichever app was in front at start. Pump `NSRunLoop.currentRunLoop().runUntilDate_` before reading (done in `daemon/push_daemon/frontmost.py`), or use `lsappinfo front`. Verified 2026-10-11 by switching Finder/Chrome/Terminal/Claude and watching the daemon `active` messages.
- "Frontmost" = the app with keyboard focus, which is the one you last clicked or switched to; hovering does not change it.


## Media: now playing, visualizer, Spotify (2026-10-11)
- **Display modes** (settings.media.mode): Full / Half / Off, cycled by upper display button 8 (under the volume knob, Encoder 8) in every profile. Daemon: `media_ui.py` (scene, buttons, strip seek), `media/` package (hub, audio, spotify), `display/render.py` `w_now_playing`, TS twin in `ui/src/display/render.ts`.
- **System audio capture works with a Core Audio process tap** (macOS 14.2+): `daemon/audiotap/audiotap.swift` is built on first use into `PushAudioTap.app` (ad-hoc signed, its own bundle id) and started with `open`, so macOS attributes the permission to that app, not to whatever launched the daemon. It writes mono float32 frames (1024 samples) into a FIFO. Verified: afplay sound shows up in the spectrum.
  - Gotcha: the aggregate device's main sub-device must be the **default output** device (`kAudioHardwarePropertyDefaultOutputDevice`). With `DefaultSystemOutputDevice` the tap ran but returned pure silence.
  - A tap without permission also returns silence, not an error.
- **Players:** Spotify desktop via AppleScript (`artwork url`, `shuffling`, `repeating`, `player position`; no sign-in). Chrome (incl. the YouTube Music Chrome app, whose window is a Chrome window) via AppleScript `execute javascript` reading `navigator.mediaSession`; this needs Chrome > View > Developer > Allow JavaScript from Apple Events. Without it only tab titles are readable (and `playing` comes from the audio level). Unverified: YouTube Music button selectors for like/next/prev (`.play-pause-button` etc.).
- **Spotify Web API:** PKCE, user pastes their own Client ID in Settings > Media (redirect `http://127.0.0.1:8472/spotify/callback`); tokens in `private/spotify.json` (git-ignored). Used for save/like and the queue; Premium needed to control playback through the API.
- **Buttons (full):** upper 1-6 = Prev, Play, Next, Save, Shuffle, Repeat; lower 1-3 = style (Bars/Wave/Glow). Half: lower 1-4 (5-8 when the visualizer is on the right) = Prev, Play, Next, Save. Play, Left and Right arrows = play, prev, next and the touch strip = seek, but only when the profile gives them no action.
- Not built yet: queue and playlist browsing on the Push, lyrics (Spotify has no lyrics API; LRCLIB is a free option), Apple Music.
- **Strip seek (verified from a bug, 2026-10):** the strip sends pitch bend 0 as it springs back when the finger lifts, so "last position on release" always read the middle. `media_ui._strip` ignores exact 0 and uses the last position from at least 80 ms before the release.
- **Media buttons (now):** Half and Full share positions: lower Prev/Play/Next/Save, upper Shuffle/Repeat/Browse, on the side set by `half_layout` (columns 1-4, or 5-8). Browse (Spotify connected only) opens a list of the queue or playlists: upper 1/2 switch lists, Up/Down (lower 1/2 or arrows) move, Play (lower 3, Play or right arrow) picks, Back (lower 4 or left arrow) closes; auto-closes after 25 s. Queue pick = skip forward n times; playlist pick = `play track "<uri>"` in Spotify.
- **Source stickiness:** the display stays on the current player until a different one *starts* playing (`hub._apply`, `_new`). Button labels on the display are IBM Plex Mono regular, two lines before truncating.
- **Media keys:** Chrome decides which tab gets the keys; after using the YouTube Music app window they stay on it while that window is in view. Reproduced with the daemon stopped, so it is not ours.
- **Brightness + list knob (2026-10):** Swing (`knob-swing`) is the combined brightness knob (`global_knobs` value `brightness`: display and pads move together, keeping their gap). Old `knob-1: display` + `knob-2: leds` settings migrate to it in `settings.load`. While Browse is open, Encoder 1 (`knob-1`) scrolls the list (4 ticks per row, `media_ui.SCROLL_TICKS`); otherwise it keeps whatever is assigned (nothing by default). Push encoders only touch/turn, they have no press.
- **Browse layout (replaces the full-display list):** the list takes the side the profile had; Full becomes a split with the player on the right. The list side's upper buttons: Select, Back, Playlists/Queue (the other list); arrows and Play also select/back. Picking a song just plays it (no "Playing..." notification, only a failure message).
- **Labels:** buttons drawn as a solid colour (lit/pressed) use a bold label, the rest regular (`render.py zones`, TS twin).
- **Source badge:** a 22 px app icon on the artwork's lower-right corner: Spotify, the YouTube Music Chrome app (`/Applications/Chrome Apps.localized/YouTube Music.app`), Chrome, or the macOS now-playing app's bundle id (`MRMediaRemoteGetNowPlayingApplicationDisplayID` in `nowplaying/mr.c`: VLC, Music...). Served at `/api/media/icon/<key>`.
- **Browse, column view (supersedes the Select/Back layout above):** the list takes one half; the player and its buttons stay on the other. Playlists open as two columns: playlists, then the songs of the selected one after Select. List buttons in fixed places on the list's side: upper 1 Play now, upper 2 Select (Playlists, first column only), upper 3 empty, upper 4 Back; lower 1 Queue, lower 2 Playlists. When the list is on the right half, its fourth button is upper 8, so Back takes the mode button's place while Browse is open. Play now: playlist = `play track "<playlist uri>"`, song inside a playlist = `play track "<uri>" in context "<playlist uri>"`, queue entry = skip forward n times. Encoder 1 and the up/down arrows scroll the focused column; Play button = Play now, right arrow = Select, left arrow = Back. Songs of a playlist: `GET /playlists/{id}/tracks` (may fail for playlists you don't own: the column then says it couldn't load).
- **Full view buttons** are always on the far left (lower 1-4 Prev/Play/Next/Save, upper 1-3 Shuffle/Repeat/Browse), in line with the artwork; only Half-right puts them on columns 5-8. In Browse, Full becomes a split with the player on the right and its buttons follow it.
- **Button labels (supersedes earlier notes on fills and wrapping):** 24 px strips (`zone_h` 24, body 30-130). No filled buttons any more: a lit/active/pressed/open button has a bold white label and a 3 px bar in the accent colour along its bottom edge, the full button width (about 3-4 px under the label). One line only on the display (size 15 down to 11, then icon dropped, then "..."); two-line wrapping stays only for pad names in the browser replica (`Rings.tsx`).
- **Browse list (final):** five rows (y 30-130), no divider between the columns, a faint line between the list and the player. Icons: Select = chevron, Back = X. Player art is 96 px in Full, 80 px in Half.
- **Source colours (2026-10):** `hub.BRANDS`: Spotify #1ed760, YouTube Music #ff2e43, Chrome #4c8bf5 (Apple Music #fa2d48, VLC #ff8800 via the macOS now-playing app id). While a source plays, the player's interface (volume meter, progress bar, bars under active button labels, list highlight) uses its colour; the visualizer bars/wave keep the artwork's colours. Zones carry `bar_color` for this.
- **Spotify playlist songs (verified):** `GET /playlists/{id}/tracks` is dead (403); use `/playlists/{id}/items` (songs come back under `item`). Even then Spotify returns 403 for playlists you do not own or collaborate on (dev-mode apps), so Browse hides Select for those and says so; Play now still plays them. `POST /me/player/queue` only appends to the END of the queue (no "play next"): the Browse button is "Add to queue", shown inside a playlist's songs.
- **Browse tabs (2026-10):** lower 1-3 on the list's side = Queue, My playlists (made or shared with you, can be opened with Select), Public (everyone else's that you follow: one column, Play now only). Ops `b:queue`, `b:mine`, `b:public`.
- **Label size (2026-10):** button labels are 12 px down to 9 px (was 15 to 11), centred 9.5 px below the strip top so there is about 6 px between the label and its bar.
- **Label size (final, supersedes the 12-9 px note):** every button label is 14 px, one line, cut with "..." when too long (the icon stays); the active bar is 1.5 px.
- **Label fit (final):** 14 px; if icon + label do not fit the width (button width minus 4 px) the icon is dropped, then the label is cut with "..." so it spans the bar.
- **Label fit (final, supersedes the "..." notes):** button labels never get "...": 14 px with the icon if it fits, else no icon and the size steps down 14 to 9 until the whole label fits. Track titles and Browse rows still use "..." (`clip`).
- **Browse knobs and timeout (2026-10):** Browse no longer times out (only Back, or turning the display mode Off, closes it). Encoder 1 scrolls the parent column only; inside an opened playlist Encoder 3 scrolls only its songs (Encoder 3 is untouched when no playlist is open). Turning Encoder 1 while a playlist is open moves to the next playlist and loads its songs. The arrows still move the focused column.
- **Playlists (2026-10):** `Spotify.playlists()` now pages through `/me/playlists` (it used to read only the first 50, which hid most of a big library). Saved/liked: the Save button (Spotify) / Like button (YouTube Music) shows a filled heart in the source colour when the song is already saved/liked and a heart before the title; YouTube Music's state is read from `ytmusic-like-button-renderer[like-status]`. Empty button slots draw nothing. Browse selection rows have 2 px corners.
- **Spotify save/like (verified 2026-10):** `/me/tracks`, `/me/tracks/contains` now return 403 Forbidden; use `GET /me/library/contains?uris=<spotify:track:..>` and `PUT`/`DELETE /me/library?uris=...` (200). The liked state is re-read every 30 s so a like made in the Spotify app shows up. A failed save now says the HTTP status.
- **Favorites (2026-10):** Browse has a 4th tab (lower 4 on the list side): Favorites. Upper 3 on a playlist = Favorite/Favorited (toggles; stored in `settings.media.favorites`, a list of playlist URIs). Lit buttons (saved, shuffle on, favorited) are bold with no bar; the bar only shows while a button is pressed (or for the open Browse tab).
- **Layout button + knobs by side (2026-10, supersedes the upper-8 mode button and the Encoder 1/3 note):** the display mode (Full / Half / Off) now cycles with the Layout button (`btn-layout`, CC 31; its LED shows the mode), so all eight display buttons are free. Player buttons: upper Shuffle, Repeat, (gap), Browse at the 4th place of the player's side (upper 4, or upper 8 for a right-hand player); lower Prev, Play, Next, Save. Browse list scroll knobs follow the list's side: list on the left = Encoder 1 (parent) and 3 (songs inside a playlist); list on the right (player on the left) = Encoder 5 and 7.
- **Volume, order, notifications (2026-10):** the volume knob is the Master encoder (`knob-master`; old `knob-8: volume` settings migrate); the volume meter is drawn inside the player at `x1 - 20`, so it moves with the player. Player lower buttons: Play, Prev, Next, Save. Confirmations (Saved, Removed, Added to queue, Shuffle on, mode changes, Master/Auto) are a small pill: `eng.note(text, icon)` adds `spec["pill"]`, the painter blurs and dims what is behind and draws the pill in the centre for about 1.3 s. Messages that need action (errors, "Connect Spotify...") and standby still use the full-screen `eng.flash`; the split is `media_ui.BIG`.
- **YouTube Music Browse (2026-10, verified on a live tab):** `media/ytm.py`. There is no official YouTube Music API (YouTube Data API v3 only knows ordinary YouTube playlists, needs your own Google Cloud app, and cannot see the YTM queue). So scripts run inside the signed-in YTM tab (AppleScript `execute javascript`, "Allow JavaScript from Apple Events"): queue = `ytmusic-player-queue-item` elements after the `selected` one; playing a queue entry = click its `ytmusic-play-button-renderer`; playlists / songs = `POST /youtubei/v1/browse` (browseId `FEmusic_liked_playlists`, `VL<playlistId>`) from the page with the page's own cookies + `SAPISIDHASH` (the web client key and version are public values from the page; the version string may need bumping), answer left in `window.__push[token]` and read back by polling; playing a playlist = `yt-navigate` event with `watchPlaylistEndpoint`, a song inside one = `watchEndpoint{videoId, playlistId}` on `ytmusic-app`. Tabs for YouTube Music: Queue, Playlists (lower 2), Favorites (lower 4); no Public tab and no Add to queue. Favorites are stored as `ytm:playlist:<id>` URIs. The Browse button shows when the current song is Spotify (connected) or YouTube Music (`hub.browse_src()`). Browse no longer closes after Play now; Favorites tab/button use a star.
- **Browse button bug (fixed):** `hub.browse_src()` and the Like/Save label checked `track["brand"] == "ytm"`, but `brand` is the colour hex; the service is now `track["service"]` ("spotify", "ytm", "chrome", or an app id).
- **YouTube Music Shuffle / Repeat / Like (2026-10, DOM checked live):** Shuffle clicks `ytmusic-player-bar .shuffle` and reshuffles the queue once (it has no on/off state, so the button never lights; message "Queue shuffled"). Repeat clicks `.repeat` and cycles off > all > one; the state is the `repeat-mode` attribute (NONE/ALL/ONE) on `ytmusic-player-bar`, read every poll, the button lights unless NONE. Like uses a thumbs-up icon (`thumbup`/`thumbupfill`), also before the title when liked; the pill and labels say Like/Liked on YouTube Music, Save/Saved on Spotify.
- **Queue length (2026-10):** Spotify's `/me/player/queue` returns at most ~20 entries (19 seen), so the list cannot be longer from the API; playlist songs are paged (50 at a time, up to 500); YouTube Music queue up to 300, playlist songs up to 500. README.md written for open sourcing; requirements.txt gained aiohttp and pyobjc; settings.json is git-ignored.
- **Play button in Browse (fixed):** the physical Play button no longer means Play now while Browse is open; it keeps toggling play/pause. Only the "Play now" display button picks the highlighted item; right arrow = Select, left arrow = Back, up/down arrows scroll.
- **Liked Songs (2026-10):** Spotify's API does not list Liked Songs as a playlist, so Browse adds it by hand as the first item of My playlists / Favorites (`hub.LIKED`). Songs: `GET /me/tracks` paged (up to 1000). Play: context `spotify:user:<id>:collection` (verified: `play track "<uri>" in context "spotify:user:<id>:collection"` plays that song and continues through Liked Songs).
- **Browse button order (supersedes the earlier "Play now first"):** on the list side: upper 1 Select, upper 2 Favorite / Favorited (Add to queue inside a playlist), upper 3 Play now, upper 4 Back. Play now is third and Back fourth in every list (queue, playlists, songs).
- **Browse button order (final):** Queue: upper 1 Play now, upper 4 Back. My playlists / Public / Favorites (and the songs inside one): upper 1 Select, upper 2 Favorite (Add to queue inside a playlist), upper 3 Play now, upper 4 Back.
- **YouTube Music queue duplicates (fixed):** each queue entry can carry a hidden "counterpart" (the video/song alternate) in `#counterpart-renderer`; Browse now skips those, so a song shows once. **Close/Back:** at the top level of a list the fourth upper button reads Close (X); inside a playlist it reads Back (left arrow, icon `backarrow`).
- **Profile buttons in Half / Full (2026-10):** while the player is on screen the profile keeps only its core 8 display buttons (its columns 1-4, upper and lower), on its own side: player on the right = columns 1-4 as defined; player on the left = drawn, lit and pressed on columns 5-8 (physical upper-5 runs the profile's upper-1 action, and so on). The player's side shows only player buttons. Full view and Browse show no profile display buttons and press none; the profile's columns 5-8 only appear when the visualizer is Off (or falls back to the profile). Mapping: `media_ui.profile_button` / `physical_button`, used by `Engine.dispatch` and `apply_leds`; `eng.media_ui = {layout, browse}`.

**Display feedback and motion (2026-10):**
- **One overlay, one language.** The old centred "toast" card is gone. Knob values (volume, brightness) and notes (Saved, Shuffle on) are both the pill: blurred, dimmed picture behind, rounded dark pill with an icon and words; a knob's pill also carries a slim value bar. It fades in 0.12 s and out 0.18 s (`spec.pill.a`). Errors and standby stay full-screen (`library.message`).
- **Button states.** idle (grey) / on (bold + 1.5 px bar) / pressed (bold + bar + a light that rises from the bar, `spec.glow`, 1.0 while held and fading over 0.25 s after release). Glow is only for `btn-*` strips.
- **Player.** Paused: artwork dimmed 55 % with a pause glyph and a dimmed progress bar (no "PAUSED" text). Resume: a play glyph fades over 0.7 s. Half view shows elapsed (left) and total (right) under the bar; the bar is at y 106 there. While a finger is on the touch strip (`seeking`) the bar thickens, a playhead dot shows, and the target time follows it under the bar.
- **Browse.** A selected row whose title doesn't fit slides left after the selection has rested 3 s (45 px/s, holds 1.5 s at the end, snaps back, rests 3 s, repeats). Others keep "...". Dwell clock resets whenever the selection, level, tab or list changes (`br["_key"]`).
- **Empty player.** Music icon, "Nothing playing" and a readable hint (ink3, not ink4).
- **View changes.** Full / Half / Browse / Off and idle changes arrive with a 0.32 s soft wipe from the left (`render.wipe` in Python, `wipe()` in render.ts, both keyed on `scene.kind + spec.view`). Messages are never wiped. The loop runs at 30 fps while a wipe or glow fade is active.

**YouTube Music timeline quirk (2026-10):** YTM's `<video>` element runs one MSE timeline across consecutive songs, so `video.duration` / `currentTime` include the previous song (seen: 413 s element vs a 228 s song, offset 185 s). Real per-song values are in `ytmusic-player-bar #progress-bar` (`aria-valuemax` / `aria-valuenow`, whole seconds). Position and duration are read from there (`hub.JS_STATE`); a seek finds the offset `video.currentTime - valuenow` and sets `currentTime = offset + seconds` (`hub._chrome_do`). `#movie_player.seekTo` is not available in YTM.

**Widget grid (2026-10, steps 1-3 of the display-widget plan):**
- The display body is a grid of 8 columns x 2 rows (cells 120 x 50 px) between the two label rows. A widget is `{type, col, row, w, h, ...}`; both renderers draw it inside `rect(w)` (render.py) / the `y0..y1` box in `widget()` (render.ts). Widgets so far: `profile` (icon or colour dot, name, Auto/Master in the profile's colour), `clock` (1 or 2 rows), `usage` (slim bar at 1 row, dial at 2 rows), `now_playing` (the player), plus the old `title`, `wave`, `rainbow` used by messages and tests.
- **The player is only 4 x 2**, on the side set by `media.half_layout`; the full-width player is gone. The Layout button now toggles the player On / Off (old `mode: "full"` reads as `"half"`). Browse, buttons and encoders stay relative to the player's side.
- **Layers** (`display/layout.py`): the shared arrangement in `settings["display_widgets"][view]` (defaults in `layout.DEFAULT`) with a profile's own `profile["display"]["widgets"][view]` on top; the profile wins where they overlap. `half` = the 4 columns beside the player (shifted by 4 when the player is on the left), `full` = all 8 columns, used when the player is off or the idle policy is "profile". No editor yet: arrangements are data only.
- **Removed:** the big centred profile name, the profile knob meters, the idle cycle (clock / usage / animation rotating) and its two settings (`idle_cycle`, `idle_cycle_seconds`). The profile indicator, clock and usage are now ordinary widgets. Backup of the project before this change: `~/Documents/Push Deck snapshots/pre-widgets-2026-10-11.tar.gz` (no .venv, node_modules, private/ or built dylibs).
- Next: drag-to-arrange editor on the replica's display, then a separate Display page.

**Visualizer removed, widgets, usage (2026-10):**
- No visualizer: the Mirror / Wave styles, the quiet idle, the audio-reaction setting and its card are gone; `media_ui` never starts the audio tap now (`hub.audio` code is dormant). "When nothing is playing" is only Last track or Nothing playing (old `quiet` / `profile` read as `last`). Settings → Media shows Player On/Off and Player side.
- Profile icons on the display follow the browser UI's rule (`layout.icon_key`): the profile's app icon or picture, else the icon of the first app that switches it on (installed). Served to the browser mirror at `/api/media/icon/app-<bundle>`.
- Usage widget carries `provider` ("claude" orange / "codex" green, name drawn first in its colour) and `which` (`five_hour` / `seven_day`). `usage.py` reads local files only: Claude from `~/.claude/push_usage.json` (written by `claude_statusline.py`, which the **terminal CLI** runs; the desktop Code tab does not run status lines, so no file until the CLI has been used), Codex from the newest `~/.codex/sessions/**/rollout-*.jsonl` (`rate_limits` primary 300 min = 5-hour, secondary = weekly). No data shows `--`; a window whose reset time has passed shows 0 %. The demo numbers are gone. The ChatGPT / Codex profile swaps its own Codex usage widgets in.
- `tab` widget (browser profile): active tab's site and title via AppleScript (Chrome, Brave, Edge, Arc, Safari), polled every 1.2 s only while a tab widget is on screen, never launching a browser that isn't running (`tabs.py`). The Chrome profile's own `display.widgets` put it on row 2 of both arrangements.

**Claude usage, what was found (2026-10-11):** the desktop app has no local usage file and never runs the status line (checked: a logging status line was never called from the Code tab). The app itself gets the numbers from `GET <apiHost>/api/oauth/usage` (headers `Authorization: Bearer <oauth token>`, `anthropic-beta: oauth-2025-04-20`; reply `{five_hour:{utilization,resets_at}, seven_day:{...}}`), and exposes them to Claude sessions as the `get_usage` tool. `usage.py` implements the same read as an opt-in (`claude_usage_live`, Settings → General): token from the Keychain item "Claude Code-credentials", in memory only, ~every 90 s. **Blocker:** that Keychain token belongs to the terminal CLI and had expired ~80 h earlier (only the CLI refreshes it), so the endpoint answers 401 and the widget shows "login expired". The desktop app keeps its own login elsewhere; reading that was not authorised, and refreshing the CLI token would mean rotating and writing back credentials, so neither was done.

**Claude usage is live (2026-10-11):** `usage._desktop_token()` reads the Claude desktop app's own login: `oauth:tokenCacheV2` in `~/Library/Application Support/Claude/config.json` is Electron safeStorage ("v10" + AES-128-CBC, key = PBKDF2-SHA1 of the Keychain item "Claude Safe Storage", salt "saltysalt", 1003 rounds, IV 16 spaces; decrypted with CommonCrypto through ctypes). It picks the unexpired entry with scope `user:profile`, preferring `claude_code`, and falls back to the terminal login ("Claude Code-credentials"). Sent only to `https://api.anthropic.com/api/oauth/usage`, in memory only, never refreshed here (the app refreshes it and the next read picks it up). First read showed 5-hour 11 %, weekly 27 %. The earlier "login expired" came from the terminal login only.

**Usage block 2 x 2 (2026-10-11):** the `usage` widget with `which: "both"` (2 columns x 2 rows) shows the tool's name once in its colour, then 5-hour and weekly one above the other, each as label, percentage, thin bar and a short time to reset ("in 4h 10m", "reset" once the window has rolled over). Usage is no longer in the shared layout: only the Claude Code profile (Claude) and the ChatGPT / Codex profile (Codex) carry it, in `profile["display"]["widgets"]` (half: left two columns of the profile's half; full: columns 3-4). Shared half layout is now the profile indicator (top) and the clock (below), on the two columns next to the player; the browser profile's usage bars were dropped.

**Claude block v2 and Claude Code profile buttons (2026-10-11):**
- Visual language follows the Claude app's own panel (all left-aligned): a title (`CLAUDE · PRO`, plan from the desktop login), then rows of label, detail and percentage over a thin 4 px bar: Context (blue, `361k / 1M`), 5-hour and Weekly (provider colour; amber from 75 %, red from 90 %; reset as `in 3h 54m`). Context comes from the last assistant `usage` in the newest `~/.claude/projects/*/*.jsonl` (input + cache read + cache creation); the 1M window is the setting `claude_context_window` because no file records it. Enabled per widget with `"context": true`.
- Identity is icon + name only (Auto / Master is shown only by the Master button's bar); the clock is left-aligned too. Nothing on the display is centre-aligned any more except the full-screen messages.
- New action type `pin` (Master toggle for the profile it is on; its label keeps a bar while pinned). Claude Code profile: upper 1 Master, 2 Resume, 3 Model; lower 1 Compact, 2 Clear, 3 Context, 4 Usage. Compact and Clear are risky (press twice). Compact, Clear, Context and Usage end in two Returns (the first Return only accepts the slash-command suggestion; a second Return after 0.4 s sends it); Resume and Model end in one, since a second Return would pick an option in their menus.
- Menu bar app: `menubar/.build` did not exist (never built or cleaned), so nothing could run. Built with `swift build -c release` and started; it is not a login item yet.

**Menu bar app v2 (2026-10-11):** the plain NSMenu is replaced by a borderless NSPanel under the status icon hosting SwiftUI (`menubar/Sources/PushMenu`: `main.swift` panel and positioning, `Views.swift` look, `Store.swift` websocket state and actions). Dark navy glass, a tinted glow per tab, five icon tabs (Profiles with app icons and a pin per profile, Player on/off + side + idle, Display brightness sliders + live Claude usage, Tests, Settings with Open at login and the lifecycle choice), power button for standby, Open Dashboard and Quit. "Open at login" = LaunchAgent `~/Library/LaunchAgents/com.arcept.pushdeck.menubar.plist` (RunAtLoad, no KeepAlive; it points at `.build/release/PushMenu`, so rebuild in place). `PushMenu --snapshot <dir>` writes one PNG per tab for checking the look without opening the panel. Installed now and loaded with `launchctl bootstrap`.

**App icon, favicon, login item (2026-10-11):** `menubar/make_icon.py` draws the Push Deck icon (blue-violet tile, 3 x 3 pads) into `ui/public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (linked in `ui/index.html`) and `menubar/AppIcon.icns`. `menubar/build_app.sh --install` wraps the binary as `Push Deck.app` (Info.plist, icon, `LSUIElement`, ad-hoc `codesign`) in `/Applications`; "Open at login" now uses `SMAppService.mainApp` (Login Items lists it by name and icon) and the earlier LaunchAgent was removed. Ad-hoc signing cannot remove "unidentified developer": that label needs an Apple Developer ID certificate and notarisation. `PushMenu --login-item on|off` sets it from a shell.

## Display layout editor
- Shared arrangement: `settings.display_widgets` `{half, full}` (empty = `layout_default` in `display/tokens.py`). A profile's `display.widgets[view]` REPLACES the shared one for that view (UI: Customize / Use the shared layout).
- Grid 8 cols x 2 rows; half = 4 columns beside the player (player always 4x2, side = `media.half_layout`). Usage widget `which`: both | five_hour | seven_day | context (Claude only).
- WS `preview_layout {id, view, side, widgets}` -> `layout_preview` (spec without the player). UI: `DisplayEditor.tsx` (Settings -> Display layout, and "Arrange display" grid over the replica screen), model in `layoutModel.ts`. Overlap is rejected (not resolved) for now.
- Not yet hardware-verified; drag/resize only checked by add/reset in the browser.

## Packaging and project layout
- `Push Deck.app` (built by `menubar/build_app.sh`) runs the daemon itself (`DaemonHost`, env `PUSH_HOME` = `~/Library/Application Support/Push Deck`) and shows the UI in a native WKWebView window (`Window.swift`). Program files are read-only inside the bundle; settings/profiles/private/backups use `registry.DATA`.
- Developing: quit the app, run `./run_daemon.sh` (no PUSH_HOME, so it uses this folder's own settings.json/profiles) and `cd ui && npm run dev`. Release with `build_app.sh --install` (never overwrites app data).
- Old hardware scripts live in `experiments/`; superseded files (3D knob STLs, probe JSONs, UI snapshots, design mocks) were moved to `../Push Deck - archive/`.
