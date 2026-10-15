# Changelog

All notable changes to Push Deck. Newest first.

## Unreleased

- Usage-limit alerts reworked. They fire at 70% and then at every 5% up to 100%, separately for the 5-hour and the weekly limit (Claude and Codex). Each level is announced once: fixed a bug where the same alert came back with every message, because the reset time from the API wobbles by a fraction of a second. The alert is a new full-screen design: a clock for the 5-hour session and a calendar for the week, a big label, the colour running from amber (5-hour) or red-orange (weekly) towards red as usage rises, a bar with level notches, the reset time and a countdown. It plays one chime and a short pad ripple, then stays for up to 60 seconds or until you press a button. Alerts that arrive together wait their turn, and nothing is lost while the Push is off or away. Settings → Display has Preview buttons. The alerts use Title Case, no outlines and the plain black background; the Claude question alert's Dismiss button lost its outline too.

- Removed the unfinished "answer Claude's questions on the Push" code (the question card, its dictation box and the Claude Code hook). The Push still alerts you when Claude asks a question (full-screen alert, pad ripple, chime) and its button opens the Claude app; the question is answered in the Claude app.

- Permissions now survive updates: the app is signed with a rule tied to its name instead of the exact build, so macOS no longer forgets Accessibility, Automation and the other grants every time Push Deck is updated.
- Repository extras: issue templates, a security policy (private reporting is on), a contributing guide, a pull request notice and a social preview image.

- README reworked: shorter, with a jump bar, screenshots and a recording of the display.
- Ready for the first release: `get.sh` (one-line installer that checks the download's checksum) and a Homebrew cask template in `packaging/homebrew/`.

- Removed the Figma and Photoshop starter profiles (and the Photoshop sample file) until proper profiles are ready.
- `tools/smoke_test.sh` checks that a .dmg stands on its own (no links to the build machine, own Python, helpers built, daemon starts in a bare environment); the release workflow runs it before publishing.

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
