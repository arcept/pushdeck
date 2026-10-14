#!/bin/bash
# Checks that a Push Deck .dmg stands on its own: opens it, makes sure nothing inside points at this Mac's Homebrew, Xcode or other
# developer files, then starts the bundled daemon with a bare environment and waits for it to answer.
# Usage: tools/smoke_test.sh build/PushDeck-<version>-<arch>.dmg
set -e
DMG="$1"; [ -f "$DMG" ] || { echo "usage: $0 <file.dmg>"; exit 1; }
MNT="$(mktemp -d)"; HOME_DIR="$(mktemp -d)"; PORT=8497
PID=""
cleanup() { [ -z "$PID" ] || kill "$PID" 2>/dev/null || true; sleep 1; hdiutil detach -quiet -force "$MNT" 2>/dev/null || true; rmdir "$MNT" 2>/dev/null || true; rm -rf "$HOME_DIR"; }
trap cleanup EXIT
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$MNT" "$DMG"
APP="$MNT/Push Deck.app"; R="$APP/Contents/Resources"

echo "1. every program and library inside links only to macOS itself or to the app"
BAD="$(find "$APP" -type f \( -name '*.so' -o -name '*.dylib' -o -perm -u+x \) -exec file {} + | grep Mach-O | cut -d: -f1 | while read -r f; do
  otool -L "$f" 2>/dev/null | tail -n +2 | awk '{print $1}' | grep -E '^/(opt|usr/local|Applications/Xcode|Library/Developer)' | grep -v 'libusb-1.0.0.dylib' | sed "s|^|$(basename "$f"): |"; done)"
[ -z "$BAD" ] || { echo "links to files outside the app:"; echo "$BAD"; exit 1; }

echo "2. the bundled Python is the app's own"
[ -x "$R/python/bin/python3" ] || { echo "no bundled Python"; exit 1; }
[ ! -L "$R/python/bin/python3" ] || [ "$(readlink "$R/python/bin/python3")" = "python3.12" ] || { echo "python3 is a link outside the app"; exit 1; }

echo "3. the helpers are built, so nothing is compiled on the user's Mac"
[ -x "$R/root/daemon/audiotap/PushAudioTap.app/Contents/MacOS/audiotap" ] || { echo "audio helper missing"; exit 1; }
[ -f "$R/root/daemon/nowplaying/libmr.dylib" ] || { echo "now-playing library missing"; exit 1; }

echo "4. the daemon starts with a bare environment and serves the UI"
cd "$R/root"
env -i HOME="$HOME_DIR" PATH=/usr/bin:/bin PUSH_PORT=$PORT PUSH_HOME="$HOME_DIR" PYTHONPATH="$PWD/daemon" PYTHONDONTWRITEBYTECODE=1 \
  DYLD_FALLBACK_LIBRARY_PATH="$R/lib" "$R/python/bin/python3" -m push_daemon > "$HOME_DIR/log.txt" 2>&1 &
PID=$!
for _ in $(seq 1 30); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || { echo "the daemon did not answer"; cat "$HOME_DIR/log.txt"; exit 1; }
grep -q Traceback "$HOME_DIR/log.txt" && ! grep -q "No such device" "$HOME_DIR/log.txt" && { cat "$HOME_DIR/log.txt"; exit 1; }
echo "smoke test passed"
