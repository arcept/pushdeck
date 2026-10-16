# Product


## Platform

web

## Stack
Existing: React 18 + Vite + TypeScript UI served by a local Python (aiohttp) daemon over a WebSocket; native Swift menu bar app; Python renders the Push 2 display (960x160). The replica is an inline SVG (ids `<control>`, `<control>-base`, `<control>-led`).

## Users
Primary: the owner, a product designer who is not a musician, at their desk on macOS, using an Ableton Push 2 without Ableton Live. They want it as a daily-use physical controller and ambient display. They use the browser UI both as a deep setup/editing tool and as an always-open companion. Future audience (confirmed): open-source users with a Push 2 who want the same, plus people who see the project as a portfolio piece showing the owner's UI skills.

## Product Purpose
Turn a Push 2 into a standalone, per-app controller and information display: shortcuts and macros on pads and buttons, profiles that switch with the frontmost app, ambient info on the display (Claude usage limits, clock, now playing), and constant visual feedback. The browser UI mirrors the device, edits profiles, and runs diagnostics. Success: the Push is useful every day without opening the UI; the UI makes configuring it effortless and obvious.

## Positioning
A Push 2 replica you can click, drag onto and edit that is a true two-way mirror of the real hardware (LEDs, display, knobs), with profiles stored as plain JSON files. A generic macro-pad tool cannot copy the exact hardware replica or the 960x160 display system.

## Operating Context
- Daemon owns the hardware; UI, menu bar and tests talk to it over WebSocket (`/ws`, port 8472).
- Profiles: one JSON file per profile in `profiles/`; auto-switch by frontmost app, scene buttons (right of the pads) pin a profile. Pads are a freeform per-profile grid.
- Global controls work in every profile: Encoder 1 display brightness, Encoder 2 pad/button brightness, Encoder 8 volume; Tempo, Swing and Master knobs are deliberately unused; Repeat reruns the last test; Shift+Setup starts colour calibration; the top-left 4 x 4 pads are window pads (halves, quarters, thirds, maximize, center, display moves).
- Display rules: always pure black background; Quicksand (main) + IBM Plex Mono (secondary); 16 label zones, 105x34 px, ALL CAPS by default, optional icon; a popup shows global knob changes.
- Risky actions need a second confirm press. The Push cannot be powered off by software; "Turn Push off" blanks it and ignores input.

## Capabilities and Constraints
- Controls: 64 pads, 65 buttons, 11 knobs, touch strip, 8+8 display buttons; 960x160 RGB display needing continuous frames.
- Actions: keyboard shortcuts and typed text, launch apps/URLs, shell and Shortcuts.app, media/system controls.
- Planned features as modules: Claude usage dashboard (first), music now-playing (Spotify, YouTube Music, system fallback), tests, colour calibration.
- Scale targets (confirmed): 20+ profiles and per-app rules; modular feature panels; export/import of profiles.
- Undecided: final display font (temporary pair in use), power-cable detection (dropped: no signal), login auto-start (plist written, not installed).

## Brand Commitments
Dark workspace; the replica SVG sits in the middle and stays. Display typography as above. Project may be open-sourced; keep names and structure clean.

## Evidence on Hand
`ui/src/assets/push2.svg`, `design/` mocks (font specimens, label zones, HUD), `docs/PUSH2_NOTES.md` (verified hardware facts), `docs/ROADMAP.md`. No usage analytics, testimonials, or public users exist; do not invent any.

## Product Principles
1. The hardware is the hero: the UI mirrors and serves the Push, never competes with it.
2. Primary function first, detail on demand: show what a control does, tuck IDs, mechanics and rare settings behind a click or hover.
3. Everything the device can do is discoverable from the UI, and everything the UI can do is reachable from the device where it makes sense.
4. Modular by default: a feature brings its own panel, settings and display scenes.
5. Honest status: say what the daemon and device are actually doing, never imply a signal we do not have.

## Accessibility & Inclusion
Keyboard operable controls and focus states, sufficient contrast on the dark surface, reduced-motion respected, state never conveyed by colour alone.
