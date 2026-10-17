# Changelog

All notable changes to Push Deck. Newest first.

## Unreleased

- Landing page (pushdeck.arcept.in): download, Homebrew and one-line install are live for 1.0.0 (the "from source" card is gone; build instructions stay in docs/DEVELOPING.md), and window shortcuts are added to the features, FAQ and requirements. The window screenshots and tour close-ups were recaptured from 1.0.0, so they show the window pads and the "Add an action" shelf.

## 1.0.0 (2026-10-17)

First public release. Push Deck turns an Ableton Push 2 into a per-app controller and live display for your Mac: profiles that follow the app in front, pads and buttons that send shortcuts and actions, window shortcuts, now playing, Claude and Codex usage, and a replica of the Push to set it all up on screen.

- Window pads can be selected and personalised: rename them, change their colour and the colour while you hold them, and turn on "Confirm before running" (same in every profile; "Reset pad" puts the defaults back). They still can't be removed, moved or given another action, and the whole set is switched on or off in Settings and per profile.
- Three new actions in "Add an action": **Close window** (the red button: an app with unsaved work still asks), **Minimize window** (the yellow button) and **Full screen**, for any pad. A full-screen window leaves full screen first when minimized, and Close works from full screen too. Also available as a "Window" choice in the pad editor.
- The editor no longer shows the "Selected control / The one you picked" heading, and "Add an action" is always folded to start with.

- Control editor (right column) reworked: the action choices are buttons with the icon beside the label, with clear hover, pressed and keyboard-focus states (and a quiet "No action" row); text boxes share one look for rest, hover and focus; 20 pad colours instead of 10 (plus the profile colour, Off and a custom picker); "When pressed" is now "Colour while you hold it" with the same swatches and a plain explanation; plainer wording throughout ("Try it now" instead of "Test press", "Clear pad", "Confirm before running", shorter hints, "Pin as Master"). Name, app and command fields keep their own text while you type, so a save coming back can no longer move the cursor or swap the text; spell-check and auto-correct are off in them.

- Window shortcuts are a built-in feature, not editable pads: the "Add an action" list no longer has window chips and the 16 pads show a locked card in the editor. Settings → General has one switch (the default for every profile), and each profile has Default / On / Off for itself (left column, "Window shortcuts"). While on they cover that profile's own pads on the top-left 4 x 4 (the pads stay saved and come back when off); turning them on first lists which pads will be covered and asks. The first version's saved shared pads are removed automatically.
- Pad labels on the replica are black or white depending on the pad colour (whichever has more contrast), so white, yellow and light-blue pads are readable.
- Minimum window size is 1600 x 900 (or the screen, if that is smaller; the page then scales itself down to fit instead of breaking). Fixed the inspector's Test press / Clear footer showing the controls through it in the Showpiece look, and the action list now starts folded in short windows so the editor above it has room.

- Window pads: fixed "No app in front" when testing a pad while the Push Deck window itself was in front (the editor's Test press): the Push Deck window is now a target like any other. If macOS reports no front app at all, the window pads fall back to the owner of the topmost window on screen. The Push Deck window can also go full screen from the Full screen pad now: it is normally built to sit over other apps' full-screen Spaces, which forbids full screen, so the pads' helper asks the app to allow it just before (and the app takes it back after leaving full screen).

- Window pads: the top-left 16 pads (4 x 4) now move and size the front app's window in every profile: quarters at the corners, halves on the edges, thirds, maximize, center, full screen (enter or leave), and next / previous display (a Restore layout puts the window back where it was before the pads first moved it; it is in the action list, not on a default pad). Pressing the same pad again steps through half, two-thirds and one-third (the thirds pads step between one-third and two-thirds). Moving to another display keeps the window's relative place and size. Full-screen windows: any layout pad first leaves full screen and then snaps the window, and next / previous display leaves full screen, moves the window and puts it back in full screen on the new display (macOS animates each step, so it takes a second or two). Works with any app (minimized windows are skipped, with a short message on the display); needs Accessibility, which Push Deck already asks for. The pads are shared like the right-hand column (stored in settings, not in profiles), can be changed in the editor like any pad (there is a new "Window" action with a layout list, and chips to drag), and Settings → General has a switch that hides them everywhere without losing your layout. A pad you had set in one of those places in a profile is backed up (`backups/profiles-before-window-pads`, with notes) and replaced. Under the hood: the app's own binary runs a small window server (`PushMenu --windows`) that starts on the first press and stops after 10 idle minutes; the layout maths is a tested library (`WinGeo`). Layout names and the repeat-to-cycle idea follow Rectangle (MIT), credited in `NOTICE.md`.

- Tests can always be ended. One that waits for you (the colour picks, the knob measurement) now gives up after a minute with no input at all on the Push; any press, touch or turn starts the minute again. You can also stop a running test yourself: the Run button turns into Stop in Settings → Tests and in the colour calibration page, and the Repeat button on the Push stops it too (Repeat still re-runs the last test when none is running). A stopped test shows "Stopped" instead of a pass or fail.

- Dot orbs: a small cloud of dots that swirls into a different shape for each state (breathing, working, searching and more), drawn the same on the Push display and in the app. They show only where the Push is the subject: while it is being found (setup welcome page and the "Push isn't connected" banner), while a test runs (Settings → Tests), and on the display when the Push is turned off. They stop drawing when off screen and show one still frame with "reduce motion".

- Landing page (`site/`, published at pushdeck.arcept.in by `.github/workflows/pages.yml`): a pinned hero where the Push turns into the app window, a guided tour through it (select a pad, drag an action, profiles, the live display, first-run setup), a menu bar scene with a made-up Mac desktop, a close-up of the display per profile, and a slim feature recap. Phones and reduced motion get a still version with a swipe carousel. The tour settles on each step, only the visible display video plays, and scrolling stays at about 120 fps.

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
