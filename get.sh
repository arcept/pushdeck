#!/bin/bash
# Installs the latest Push Deck release into /Applications:
#   curl -fsSL https://raw.githubusercontent.com/arcept/pushdeck/main/get.sh | bash
# It downloads the .dmg from GitHub Releases, checks its SHA-256, copies the app over any older copy and opens it.
# Nothing else is touched. Files fetched with curl are not quarantined, so the "unidentified developer" prompt does not appear.
set -euo pipefail

REPO="arcept/pushdeck"
say() { printf '%s\n' "$*"; }
die() { printf 'Push Deck installer: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "Push Deck runs on macOS only."
[ "$(uname -m)" = "arm64" ] || die "this build is for Apple Silicon Macs (this one is $(uname -m))."
case "$(sw_vers -productVersion | cut -d. -f1)" in ''|*[!0-9]*) ;; *) [ "$(sw_vers -productVersion | cut -d. -f1)" -ge 13 ] || die "macOS 13 or newer is needed." ;; esac

say "Looking for the latest release..."
JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null)" || die "no release is published yet. See https://github.com/$REPO for how to build from source."
DMG_URL="$(printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*arm64\.dmg"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')"
SUM_URL="$(printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*arm64\.dmg\.sha256"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')"
[ -n "$DMG_URL" ] && [ -n "$SUM_URL" ] || die "the latest release has no Apple Silicon download."

WORK="$(mktemp -d)"
MNT="$WORK/mnt"
cleanup() { hdiutil detach -quiet "$MNT" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

NAME="$(basename "$DMG_URL")"
say "Downloading $NAME..."
curl -fL --progress-bar -o "$WORK/$NAME" "$DMG_URL"
curl -fsSL -o "$WORK/$NAME.sha256" "$SUM_URL"

say "Checking the download..."
( cd "$WORK" && shasum -a 256 -c "$NAME.sha256" >/dev/null ) || die "the checksum does not match. Nothing was installed."

mkdir -p "$MNT"
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$MNT" "$WORK/$NAME"
[ -d "$MNT/Push Deck.app" ] || die "the download does not contain Push Deck.app."

if pgrep -f "/Push Deck.app/Contents/MacOS/PushMenu" >/dev/null; then
  say "Quitting the running Push Deck..."
  osascript -e 'tell application "Push Deck" to quit' >/dev/null 2>&1 || true
  sleep 2
  pkill -f "/Push Deck.app/Contents/MacOS/PushMenu" 2>/dev/null || true
fi

DEST="/Applications/Push Deck.app"
say "Installing to $DEST..."
rm -rf "$DEST"
cp -R "$MNT/Push Deck.app" "$DEST"

say "Done. Opening Push Deck..."
open "$DEST"
