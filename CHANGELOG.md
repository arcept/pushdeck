# Changelog

All notable changes to Push Deck. Newest first.

## Unreleased

- Faster and lighter: the logo and device-mark animations no longer repaint the page every frame (GPU use with the window open fell from about 35% to 9%), the idle backdrop redraws at 15 fps, the menu bar app skips the daemon messages it does not use and no longer animates its logo while the panel is closed (CPU 15% to 3%).

- Release build: the app carries its own pinned Python and its helpers (audio listener, now-playing library), so a Mac needs nothing installed beyond macOS. `tools/make_dmg.sh` makes the .dmg and `.github/workflows/release.yml` builds and publishes it when a version tag is pushed.
- Fixed: the daemon could crash while the Push was connecting or missing.

- The menu bar panel now uses the same look as the app and the setup: near-black card, soft glow, one lavender accent, Quicksand type, the animated pad mark and the pale primary button.
- Fixed: the splash window was never put on screen. It now shows, and stays at least 3 seconds.

- The splash is now its own small window with a soft shadow; the main window opens at its own size once the splash is done (in a browser it still sits on the page). The setup's Permissions page fits without scrolling.

- Fixed: the app no longer freezes while macOS asks to read the Downloads folder (it is read in the background).

- One app only: `./install.sh` builds `build/Push Deck.app` and installs it into `/Applications` (asks before replacing). `./dev.sh` is the test version.
- Launch splash screen: black text panel with a two-tier name, credits and status line, the pads as the progress bar, and artwork on the right half (`ui/src/assets/splash-art.webp`; replace that file to change it).
- First-run setup: a fixed-size card with quiet step dots (welcome with the Push 2 check, permissions, Claude usage consent, starter profiles), custom icons, pages that slide, fade and blur in the direction you are going, then a guided tour on the real page with a spotlight and a gradient blur. Permissions shows live Accessibility and per-app Automation status (System Events, Chrome, Spotify) with an Allow button, a Downloads folder row, and a System audio check that plays a short chime and ticks when Push Deck hears it. Run it again from Settings → General. In the installed app the permission checks are answered by the app itself, so they match the Push Deck entry in System Settings.
- Fixed the "Broswer" typo in the Browser starter profile.
- Splash and top bar share one brand lockup (the animated pad mark and the name; two lines on the splash).
- Version is now a clean number from the `VERSION` file (no commit hash, no "-dirty"); the window title is just "Push Deck"; dev mode shows "dev" on the splash.
- Removed the separate "Push Deck (Build)" app and its badged icon.
- README rewritten; working notes moved to `docs/`.
- Removed third-party artwork and a prebuilt binary from the repository; notices extended.
