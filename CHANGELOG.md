# Changelog

All notable changes to Push Deck. Newest first.

## Unreleased

- One app only: `./install.sh` builds `build/Push Deck.app` and installs it into `/Applications` (asks before replacing). `./dev.sh` is the test version.
- Launch splash screen: black text panel with a two-tier name, credits and status line, the pads as the progress bar, and artwork on the right half (placeholder tiles until artwork is added at `ui/src/assets/splash-art.png`).
- Version is now a clean number from the `VERSION` file (no commit hash, no "-dirty"); the window title is just "Push Deck"; dev mode shows "dev" on the splash.
- Removed the separate "Push Deck (Build)" app and its badged icon.
- README rewritten; working notes moved to `docs/`.
- Removed third-party artwork and a prebuilt binary from the repository; notices extended.
