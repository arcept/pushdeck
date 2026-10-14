#!/bin/bash
# Builds "Push Deck (Build).app" here in menubar/ (a test build, named so you can tell it apart), and with --install
# also puts the release copy "Push Deck.app" in /Applications. Both carry the version (git tag + commit) in Info.plist.
# Signed ad hoc: macOS lists it by name and icon, but without an Apple Developer ID it still says the developer is unidentified.
set -e
cd "$(dirname "$0")"
swift build -c release
APP="Push Deck (Build).app"
VER="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
NUM="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/PushMenu "$APP/Contents/MacOS/PushMenu"
cp AppIcon-Build.icns "$APP/Contents/Resources/AppIcon.icns"   # the test build wears a badge
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Push Deck (Build)</string>
<key>CFBundleDisplayName</key><string>Push Deck (Build)</string>
<key>CFBundleIdentifier</key><string>com.arcept.pushdeck.build</string>
<key>CFBundleExecutable</key><string>PushMenu</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VER</string>
<key>CFBundleVersion</key><string>$NUM</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHumanReadableCopyright</key><string>Push Deck. Not affiliated with Ableton.</string>
</dict></plist>
PLIST

# --- the whole product inside the app: daemon code, UI, python environment, libusb ---
ROOT="$(cd .. && pwd)"
R="$APP/Contents/Resources"
( cd "$ROOT/ui" && npm run build >/dev/null )
mkdir -p "$R/root/daemon" "$R/root/design" "$R/lib"
rsync -a --exclude '__pycache__' --exclude 'audiotap' "$ROOT/daemon/" "$R/root/daemon/"
rsync -a "$ROOT/ui/dist" "$R/root/ui/"
rsync -a "$ROOT/design/fonts" "$R/root/design/"
rsync -a "$ROOT/profiles" "$R/root/"
cp "$ROOT/push2_registry.json" "$ROOT/button_names.json" "$R/root/"
rsync -a --exclude '__pycache__' --exclude 'pip*' --exclude '_distutils_hack' --exclude 'setuptools*' --exclude 'pkg_resources' --exclude 'imageio*' --exclude 'share' "$ROOT/.venv/" "$R/venv/"
cp "$(brew --prefix libusb)/lib/libusb-1.0.0.dylib" "$R/lib/"
codesign --force --sign - "$R/lib/libusb-1.0.0.dylib" 2>/dev/null || true
find "$R" -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
codesign --force --deep --sign - "$APP"
echo "built $PWD/$APP  ($VER)"
if [ "$1" = "--install" ]; then
  REL="Push Deck.app"
  rm -rf "$REL"; cp -R "$APP" "$REL"
  cp AppIcon.icns "$REL/Contents/Resources/AppIcon.icns"   # the installed app gets the plain icon
  P="$REL/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName Push Deck" -c "Set :CFBundleDisplayName Push Deck" -c "Set :CFBundleIdentifier com.arcept.pushdeck.menubar" "$P"
  codesign --force --deep --sign - "$REL"
  mkdir -p /Applications
  rm -rf /Applications/"$REL" ~/Applications/"$REL" "/Applications/Push Controller.app"
  mv "$REL" /Applications/
  # Keep what you already set up: copy settings, profiles and Spotify sign-in into the app's data folder, once (never overwrites).
  D=~/"Library/Application Support/Push Deck"
  OLD=~/"Library/Application Support/Push Controller"   # data folder from before the rename: carried over once
  [ -d "$D" ] || { [ -d "$OLD" ] && cp -R "$OLD" "$D"; }
  mkdir -p "$D"
  [ -e "$D/settings.json" ] || { [ -f "$ROOT/settings.json" ] && cp "$ROOT/settings.json" "$D/"; }
  [ -e "$D/profiles" ] || { [ -d "$ROOT/profiles" ] && cp -R "$ROOT/profiles" "$D/"; }
  [ -e "$D/private" ] || { [ -d "$ROOT/private" ] && cp -R "$ROOT/private" "$D/"; }
  echo "installed /Applications/Push Deck.app  ($VER)"
fi
