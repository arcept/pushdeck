# Keeping the landing page in step with the app

The page (`site/`) shows the real app in several places: screenshots, recordings of the Push's display, copy about what the app does and what it asks for. When the app changes, some of that goes stale. This file says what depends on what, what to check for each kind of change, and how to redo the captures.

Rules that always apply (from `CLAUDE.md`): no personal info in the repo (names, paths, emails); no AI-tool mentions except the Claude usage feature and the one "Built with AI assistance." line; no pushing until the owner says so; run `./install.sh` only when told "ship it". Do not show the Figma or Photoshop profiles until proper ones exist. Do not claim Windows, Linux, Push 3, the original Push, Intel Macs, auto-update, a profile library or notarisation.

## 1. What on the page comes from the app

| On the page | Source | Where it is used |
|---|---|---|
| The Push 2 picture (the hero device, the tour, the profile close-up) | `ui/src/assets/push2.svg`, copied to `site/assets/push2.svg`; `npm run device` builds `public/img/push2-device.svg` and `push2-lights.svg` | `components/Device.tsx`, `DisplayZoom.tsx` |
| The app window | `public/img/ui/app-ui.webp`: the real window, 1600x1000, captured at 3x, Claude Code profile, Auto mode, screen set to "Hidden" | hero, the tour |
| Tour close-ups | `public/img/tour/*.webp`: crops of captures of the same window at fixed coordinates | `TOUR`, `rect(...)` and `CHIP` in `components/Landing.tsx` |
| Setup dialog | `public/img/tour/onb-welcome.webp`, `onb-perm.webp`: the first-run dialog (1000x700 at 300,150) | tour step "Set up" |
| Display recordings | `public/video/hero.mp4`, `claude.mp4`, `browser.mp4`, `codex.mp4`: frames from the daemon's mirror stream | hero, profile close-up |
| Menu bar panel | `public/img/menubar/panel-1..3.webp`: crops of `public/img/menu-bar.png` (a copy of `docs/images/menu-bar.png`) | the menu bar scene |
| Words | `content.ts`: features, tour steps, profiles (`steps`), privacy rows, install, requirements, the FAQ (`faq`) notes | everywhere |
| Version | `../VERSION` | footer, download button |
| Phone hero | `public/img/device-view.webp`: a still of the hero device in its tilted view on a transparent background, 1800px wide. Capture it from the desktop hero at 2300x1250 with the nav, copy and page background hidden (`omitBackground`), `.win` set to `rotateX(40deg)` and the hero perspective at 3400px, then crop to the device. Redo it if the replica art, pad colours or the display content change | phones and reduced motion |
| Phone page: swipe cards | `components/PhoneStory.tsx` (reuses the tour crops, the profile videos and `hero.mp4`) | phones and reduced motion |

The page never reads the app's code. Nothing updates itself: a change in the app only reaches the page when someone redoes the matching row above.

## 2. What to check for each kind of change

**The window UI changed (layout, colours, inspector, toolbar).** Recapture `app-ui.webp` and every file in `public/img/tour/`. Then check: the replica's position inside the window (`IN_APP` in `Device.tsx` is measured from it; the hero device must still land exactly on it), the tour regions (`TOUR`, the `rect(...)` overlays and `CHIP` in `Landing.tsx`), and the profile header crop. If the replica art changed, redo `site/assets/push2.svg` and re-measure the constants at the top of `Device.tsx` (`S`, `TX`, `TY`, `VIEW`, pad grid, display box, knob positions).

**The display UI changed (widgets, fonts, layout).** Re-record the videos (section 3). `hero.mp4` plays inside the hero device and the tour's display step; the three profile loops play in the close-up. Check `public/img/display.gif` (a docs image) if the README uses it.

**A profile was added or changed, and you want it on the page** (for example a finished Figma profile). The close-up in `DisplayZoom.tsx` and the `steps` array in `content.ts` are built for three profiles:
1. Record its loop (section 3) and add `public/video/<name>.mp4`.
2. Add an entry to `steps` in `content.ts`: `name`, `text`, `colors` (indexes into `PAD_COLORS`; they colour the device pads), `video`, `glow` (a hex colour for the screen's glow).
3. The close-up pins for 2200px and steps by `steps.length` (`Landing.tsx`, the `data-pin` timeline). Make the distance about 730px per profile so each keeps its time.
4. The tour's profiles step crossfades three header crops (`prof-*.webp`, the `zl-p-*` overlays and their timeline tweens in `Landing.tsx`). Add a fourth, or swap one. Recapture the header with `scripts/capture` (Auto mode needs that app in front, see section 3).
5. Re-read the copy: the hero text, "Switch app. The Push follows." and the features list mention profiles in general terms; update them only if the new profile changes what is true.
6. Check the Figma/Photoshop rule above before showing either.

**Phone page.** The features tiles are desktop-only (phones get them as the tour cards).

**Phone cards.** The swipe cards show the same crops as the desktop tour (`tour/*.webp`), the chip and the profile videos, so recapturing those updates both. If a tour step is added or removed, `Scene` in `PhoneStory.tsx` needs a matching case (and the keyframes in `globals.css`). Check the phone page at 390px after any change.

**The menu bar panel changed.** Replace `public/img/menu-bar.png` (and `docs/images/menu-bar.png`, which the README uses), recut `public/img/menubar/panel-1..3.webp` (the panels are 555x832 at x = 33, 622, 1211, y = 33, with rounded corners), and check the cursor targets in the menu bar scene (`tab(0.32)` and `tab(0.855)` are the tab centres as a fraction of the panel width).

**The first-run setup changed.** Recapture `onb-welcome.webp` and `onb-perm.webp`. Then re-read the "Set up" tour step, the features recap and the requirements list.

**A permission, network call or data use changed.** This is the one that matters most. Re-read `privacyRows`, `claudeNote` and `requirements` in `content.ts` against the app's own permission text and the README, and fix the hero and privacy copy. Never leave a claim on the page that the app no longer keeps.

**Anything the FAQ answers changed** (supported Macs or Pushes, licence, permissions, how it is signed). Re-read `faq` in `content.ts` against the app and the README.

**A feature was added or removed.** Update `features` in `content.ts`, the tour if it deserves a step, and the README. Keep the page and the README saying the same thing.

**Release.** Flip `RELEASE_LIVE` in `content.ts` once the .dmg exists on GitHub Releases (the buttons then link to it), and update the Homebrew and one-line install notes. The version comes from `VERSION`. Add a line to `CHANGELOG.md`.

**Name, legal or footer text.** `disclaimer` and the footer in `content.ts` / `Landing.tsx`. The Ableton non-affiliation line, MIT licence, issues-open and "pull requests by invitation" lines must stay.

## 3. How to redo the captures

All captures come from a dev daemon with blank data, so no personal data, tracks or sign-ins are shown. The installed app has to be stopped while you do this.

1. Stop the app and the dev daemon: `pkill -f "Push Deck.app"; pkill -f push_daemon`.
2. Blank the dev data (this backs it up first): `tools/dev_data.sh blank`.
3. Start the daemon from the repo: `PYTHONPATH=daemon .venv/bin/python -m push_daemon &` (the UI is at http://127.0.0.1:8472).
4. Keep the music player off in every capture: `python scripts/capture/pin.py terminal` does it (and pins a profile). Use the repo's venv Python (it has `aiohttp`).
5. Window captures: a Playwright page at 1600x1000 with `deviceScaleFactor: 3`, then `page.screenshot()`. Click "Hidden" in the Screen switch, then blur focus and move the mouse to a neutral spot (a tooltip stays open otherwise). Profiles follow the app in front when Auto is on: bring Terminal to the front (Claude Code), leave Chrome in front (Browser), bring ChatGPT to the front (Codex). Do that a few seconds into the capture run with `open -a <App>`, because the capture browser takes focus when it opens. Crop the 4800x3000 shots to the regions in section 1 with Pillow and save as WebP (quality about 86).
6. Display recordings: `python scripts/capture/rec.py OUT terminal:12 browser:12 chatgpt-codex:12`, then `scripts/capture/encode.sh OUT site/public/video`.
7. Stop the daemon, restore the data with `tools/dev_data.sh restore`, then reopen the app (`open -a "Push Deck"`).

Delete the scratch captures when you are done; none of them belong in the repo.

## 4. Before calling it done

- `cd site && npx tsc --noEmit -p .` is clean, and a production build passes. Build in a scratch copy of `site/` (with `node_modules` linked and `VERSION` beside it) rather than in `site/` while `npm run dev` is running; two builds sharing `.next` break the dev server.
- Scroll the whole page at 1440x900 and on a phone width. The tour should rest on one clean step each time and the frame rate should stay near 120 on a laptop. There must be no horizontal scroll.
- Look at every changed close-up in place: the sharpness at the zoomed size and the alignment with the window behind it.
- Search `site/` for personal information (names, home folders, emails) and for tool names other than the Claude usage feature.
- Image weight: each close-up should stay in the tens of KB; the base window about 200 KB. Anything much larger needs a reason.
- Update `CHANGELOG.md`. Commit with the repo identity; push only when asked.
