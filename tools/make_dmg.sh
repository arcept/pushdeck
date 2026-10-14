#!/bin/bash
# Packs build/Push Deck.app into build/PushDeck-<version>-<arch>.dmg (a window with the app and an Applications shortcut) and writes its SHA-256.
# Run menubar/build_app.sh first. Usage: tools/make_dmg.sh
set -e
cd "$(dirname "$0")/.."
VER="$(tr -d '[:space:]' < VERSION)"
ARCH="$(uname -m)"
APP="build/Push Deck.app"
DMG="build/PushDeck-$VER-$ARCH.dmg"
[ -d "$APP" ] || { echo "Build the app first: menubar/build_app.sh"; exit 1; }
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -quiet -volname "Push Deck" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$DMG"
( cd build && shasum -a 256 "$(basename "$DMG")" > "$(basename "$DMG").sha256" )
echo "$DMG"
cat "$DMG.sha256"
