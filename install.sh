#!/bin/bash
# Builds Push Deck and installs it into /Applications. Run this only when the dev version (./dev.sh) is approved.
# Usage: ./install.sh [--relaunch | --replace-only]
#   no flag          asks you what to do (needs a terminal)
#   --relaunch       quit the running app, replace it, open the new one
#   --replace-only   replace it and leave it closed (it must not be running, or it is quit first)
set -e
cd "$(dirname "$0")"
ROOT="$PWD"
MODE=""
case "$1" in
  "") ;;
  --relaunch) MODE=relaunch ;;
  --replace-only) MODE=replace ;;
  *) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

menubar/build_app.sh
NEW="$ROOT/build/Push Deck.app"
DEST="/Applications/Push Deck.app"

RUNNING=no; pgrep -f "$DEST/Contents/MacOS/PushMenu" >/dev/null && RUNNING=yes
if [ -d "$DEST" ]; then echo "Installed now: $DEST (running: $RUNNING)"; else echo "Not installed yet (running: $RUNNING)"; fi

if [ -z "$MODE" ]; then
  [ -t 0 ] || { echo "No terminal to ask on. Run ./install.sh in a terminal, or pass --relaunch or --replace-only."; exit 1; }
  if [ "$RUNNING" = yes ]; then
    read -r -p "[q] quit, replace and relaunch   [r] replace only   [c] cancel : " A
    case "$A" in q|Q) MODE=relaunch ;; r|R) MODE=replace ;; *) echo "Cancelled. The new app is in build/."; exit 0 ;; esac
  else
    read -r -p "Replace the installed app? [y/N] : " A
    case "$A" in y|Y) MODE=replace ;; *) echo "Cancelled. The new app is in build/."; exit 0 ;; esac
  fi
fi

if [ "$RUNNING" = yes ]; then
  pkill -f "$DEST/Contents/MacOS/PushMenu" || true
  pkill -f push_daemon || true
  sleep 1
fi
mkdir -p /Applications
rm -rf "$DEST" ~/Applications/"Push Deck.app" "/Applications/Push Controller.app"
cp -R "$NEW" "$DEST"

# Keep what you already set up: copy settings, profiles and Spotify sign-in into the app's data folder, once (never overwrites).
D=~/"Library/Application Support/Push Deck"
OLD=~/"Library/Application Support/Push Controller"   # data folder from before the rename: carried over once
[ -d "$D" ] || { [ -d "$OLD" ] && cp -R "$OLD" "$D"; }
mkdir -p "$D"
[ -e "$D/settings.json" ] || { [ -f "$ROOT/settings.json" ] && cp "$ROOT/settings.json" "$D/"; }
[ -e "$D/profiles" ] || { [ -d "$ROOT/profiles" ] && cp -R "$ROOT/profiles" "$D/"; }
[ -e "$D/private" ] || { [ -d "$ROOT/private" ] && cp -R "$ROOT/private" "$D/"; }
echo "installed $DEST"

if [ "$MODE" = relaunch ]; then open "$DEST"; echo "opened"; fi
